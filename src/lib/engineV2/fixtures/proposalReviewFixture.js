import { createRegionV2 } from '../model.js';
import { createEmbroideryObjectProposalV2 } from '../planning/embroideryPlanningModel.js';

const normalized = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
const geometryMm = [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }];
const evidence = [{ code: 'SYNTHETIC_PHASE_5_FIXTURE', message: 'Synthetic Phase 5 proposal.' }];
const outlineEligibility = { eligible: true, explicitOutlineEvidence: true, regionBackedGeometry: true, darkStrokeSupportAvailable: true, darkStrokeSupportRatio: 0.9 };

function proposal(id, role, stitchType, options = {}) {
  return createEmbroideryObjectProposalV2({
    regionId: id,
    semanticRole: options.semanticRole || (role === 'dark_detail' ? 'dark_mark' : role === 'highlight' ? 'highlight' : role === 'manual_review' ? 'unknown' : 'primary_shape'),
    proposedEmbroideryRole: role,
    proposedStitchType: stitchType,
    geometryMm: options.geometryMm || geometryMm,
    holesMm: options.holesMm || [],
    visualColor: options.color || '#55aa66',
    layer: options.layer || 0,
    dependencyIds: options.dependencyIds || [],
    excluded: options.excluded === true,
    exclusionReason: options.exclusionReason || null,
    planningConfidence: options.confidence ?? 0.92,
    needsReview: options.needsReview === true,
    evidence,
    outlineEligibility: ['outer_outline', 'inner_outline'].includes(role) ? (options.outlineEligibility || outlineEligibility) : null,
    source: { fixture: 'synthetic_phase_5' },
  });
}

function buildPlan(proposals) {
  return {
    version: '2-object-planning-proposals',
    proposals,
    byProposalId: Object.fromEntries(proposals.map(item => [item.id, item])),
    byRegionId: Object.fromEntries(proposals.map(item => [item.regionId, item])),
    executionLayers: [], valid: true, errors: [], warnings: [],
    summary: { sourceRegionCount: proposals.length, decisionRecordCount: proposals.length, decisionCoveragePercent: 100, silentRegionDropCount: 0, dependencyCycleCount: 0 },
    config: {}, metadata: { inputMutationsDetected: false },
  };
}

function regionsFor(proposals) {
  return proposals.map(item => createRegionV2({ id: item.regionId, geometry: normalized, visualColor: item.visualColor, semanticRole: item.semanticRole, source: { fixture: 'synthetic_phase_5' } }));
}

export function createProposalReviewFixture() {
  const base = proposal('base', 'base_fill', 'tatami');
  const foreground = proposal('foreground', 'foreground_fill', 'tatami', { dependencyIds: [base.id], color: '#eeeeee', layer: 1, semanticRole: 'secondary_shape' });
  const internal = proposal('internal', 'internal_detail', 'satin', { dependencyIds: [foreground.id], color: '#111111', layer: 2, semanticRole: 'internal_feature' });
  const dark = proposal('dark', 'dark_detail', 'running', { dependencyIds: [foreground.id], color: '#050505', layer: 3 });
  const highlight = proposal('highlight', 'highlight', 'running', { dependencyIds: [foreground.id], color: '#ffffff', layer: 3 });
  const outer = proposal('outer', 'outer_outline', 'running', { dependencyIds: [base.id, foreground.id, internal.id, dark.id, highlight.id], color: '#050505', layer: 5, semanticRole: 'dark_mark' });
  const inner = proposal('inner', 'inner_outline', 'running', { dependencyIds: [foreground.id, internal.id], color: '#050505', layer: 4, semanticRole: 'dark_mark' });
  const negative = proposal('negative', 'excluded', 'none', { excluded: true, exclusionReason: 'explicit_negative_space', semanticRole: 'negative_space', color: '#ffffff' });
  const background = proposal('background', 'excluded', 'none', { excluded: true, exclusionReason: 'background_excluded_by_policy', semanticRole: 'background', color: '#ffffff' });
  const manual = proposal('manual', 'manual_review', 'manual', { needsReview: true, confidence: 0.4, semanticRole: 'unknown' });
  const proposals = [base, foreground, internal, dark, highlight, outer, inner, negative, background, manual];
  return { regions: regionsFor(proposals), proposalPlan: buildPlan(proposals), proposals };
}

export { buildPlan as createSyntheticProposalPlan, proposal as createSyntheticProposal, regionsFor as createSyntheticRegionsForProposals };
