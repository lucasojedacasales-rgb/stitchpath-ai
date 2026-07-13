import { analyzeArtworkColor } from '../semantics/colorFeatureAnalysis.js';
import { analyzeRegionGeometryFeatures } from '../semantics/geometryFeatureAnalysis.js';
import { analyzeSourceSemanticEvidence } from '../semantics/sourceSemanticEvidence.js';
import { createEmbroideryObjectProposalV2 } from './embroideryPlanningModel.js';
import { regionGeometryToMillimeters } from './normalizedToMillimeterGeometry.js';
import { evaluateOutlineEligibility } from './outlineEligibility.js';

const ROLE_LAYERS = Object.freeze({ excluded: -1, base_fill: 0, foreground_fill: 1, internal_detail: 2, dark_detail: 3, highlight: 3, inner_outline: 4, outer_outline: 5, manual_review: 6 });

function physicalFeatures(geometryFeatures, config) {
  const widthMm = (geometryFeatures?.width || 0) * config.designWidthMm;
  const heightMm = (geometryFeatures?.height || 0) * config.designHeightMm;
  return {
    areaMm2: (geometryFeatures?.effectiveArea || 0) * config.designWidthMm * config.designHeightMm,
    minimumWidthMm: Math.min(widthMm, heightMm),
    maximumWidthMm: Math.max(widthMm, heightMm),
    aspectRatio: geometryFeatures?.aspectRatio || 0,
    closed: (geometryFeatures?.effectiveArea || 0) > 0,
  };
}

function detailDecision(features, config) {
  if (features.minimumWidthMm <= config.maximumRunningDetailWidthMm || features.areaMm2 <= config.smallDetailAreaMm2) return 'running';
  if (features.minimumWidthMm >= config.minimumSatinWidthMm
    && features.minimumWidthMm <= config.maximumSatinWidthMm
    && features.aspectRatio >= 1.5) return 'satin';
  if (features.closed && features.areaMm2 >= config.minimumTatamiAreaMm2) return 'tatami';
  return 'manual';
}

function manual(region, assessment, geometry, outlineEligibility, reason) {
  return createEmbroideryObjectProposalV2({
    regionId: region.id, semanticRole: assessment?.semanticRole || 'unknown', proposedEmbroideryRole: 'manual_review',
    proposedStitchType: 'manual', geometryMm: geometry.geometryMm, holesMm: geometry.holesMm,
    visualColor: region.visualColor, layer: ROLE_LAYERS.manual_review, planningConfidence: assessment?.confidence || 0,
    needsReview: true, evidence: [{ code: 'MANUAL_REVIEW_REQUIRED', message: reason }, ...(assessment?.evidence || [])],
    alternatives: assessment?.alternatives || [], outlineEligibility, source: { regionSource: region.source, geometryErrors: geometry.errors },
  });
}

export function planEmbroideryRoleForRegion({ region, graph, semanticAssessment, colorFeatures, geometryFeatures, config }) {
  const assessment = semanticAssessment || { semanticRole: 'unknown', confidence: 0, evidence: [], alternatives: [], needsReview: true };
  const suppliedColor = colorFeatures || assessment.colorFeatures;
  const suppliedGeometry = geometryFeatures || assessment.geometryFeatures;
  const color = typeof suppliedColor?.valid === 'boolean' ? suppliedColor : analyzeArtworkColor(region?.visualColor);
  const geometryAnalysis = Number.isFinite(suppliedGeometry?.effectiveArea) ? suppliedGeometry : analyzeRegionGeometryFeatures(region, graph);
  const sourceEvidence = analyzeSourceSemanticEvidence(region);
  const converted = regionGeometryToMillimeters(region, config);
  const features = physicalFeatures(geometryAnalysis, config);
  const outlineEligibility = evaluateOutlineEligibility({ region, graph, semanticAssessment: assessment, sourceEvidence, colorFeatures: color, geometryFeatures: geometryAnalysis, config });
  if (!converted.valid) return manual(region, assessment, converted, outlineEligibility, 'Geometry could not be converted safely to millimetres.');

  const base = {
    regionId: region.id, semanticRole: assessment.semanticRole, geometryMm: converted.geometryMm, holesMm: converted.holesMm,
    visualColor: region.visualColor, planningConfidence: assessment.confidence, needsReview: false,
    evidence: [...(assessment.evidence || []), { code: 'REGION_DECISION_RECORDED', message: 'Region received one deterministic planning decision.' }],
    alternatives: assessment.alternatives || [], outlineEligibility, source: { regionSource: region.source, sourceEvidence: sourceEvidence.controlledMatches, geometryFeatures: features },
  };

  if (assessment.semanticRole === 'negative_space') return createEmbroideryObjectProposalV2({ ...base, proposedEmbroideryRole: 'excluded', proposedStitchType: 'none', excluded: true, exclusionReason: 'explicit_negative_space', layer: ROLE_LAYERS.excluded });
  if (assessment.semanticRole === 'background' && !config.includeBackground) return createEmbroideryObjectProposalV2({ ...base, proposedEmbroideryRole: 'excluded', proposedStitchType: 'none', excluded: true, exclusionReason: 'background_excluded_by_policy', layer: ROLE_LAYERS.excluded });
  if (outlineEligibility.eligible) return createEmbroideryObjectProposalV2({ ...base, proposedEmbroideryRole: outlineEligibility.proposedRole, proposedStitchType: 'running', layer: ROLE_LAYERS[outlineEligibility.proposedRole] });
  if (assessment.semanticRole === 'unknown' || assessment.confidence < config.minimumPlanningConfidence) return manual(region, assessment, converted, outlineEligibility, 'Semantic role or confidence is insufficient for automatic planning.');
  if (assessment.semanticRole === 'background' || assessment.semanticRole === 'primary_shape') {
    if (features.areaMm2 < config.minimumTatamiAreaMm2) return manual(region, assessment, converted, outlineEligibility, 'Primary fill area is below the tatami safety threshold.');
    return createEmbroideryObjectProposalV2({ ...base, proposedEmbroideryRole: 'base_fill', proposedStitchType: 'tatami', layer: ROLE_LAYERS.base_fill });
  }
  if (assessment.semanticRole === 'secondary_shape') {
    if (features.areaMm2 < config.minimumTatamiAreaMm2 || features.minimumWidthMm <= config.maximumRunningDetailWidthMm) return manual(region, assessment, converted, outlineEligibility, 'Secondary shape is too small or thin for automatic tatami.');
    return createEmbroideryObjectProposalV2({ ...base, proposedEmbroideryRole: 'foreground_fill', proposedStitchType: 'tatami', layer: ROLE_LAYERS.foreground_fill });
  }
  const role = assessment.semanticRole === 'internal_feature' ? 'internal_detail'
    : assessment.semanticRole === 'dark_mark' ? 'dark_detail'
      : assessment.semanticRole === 'highlight' ? 'highlight' : 'manual_review';
  const stitchType = detailDecision(features, config);
  if (stitchType === 'manual' || assessment.confidence < config.minimumAutomaticStitchTypeConfidence) return manual(region, assessment, converted, outlineEligibility, 'Detail geometry or confidence is ambiguous.');
  return createEmbroideryObjectProposalV2({ ...base, proposedEmbroideryRole: role, proposedStitchType: stitchType, layer: ROLE_LAYERS[role] });
}
