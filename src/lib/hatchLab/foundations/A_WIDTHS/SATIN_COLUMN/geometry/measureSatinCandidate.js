/**
 * measureSatinCandidate.js — pure orchestrator: fixture region → normalized mm
 * polygon → validation → principal axis → rails → zigzag → straightness →
 * containment → eligibility.
 * Never mutates its input, never touches the productive engine.
 */

import { resolveOptions, FOUNDATION_VERSION } from '../foundationSchema.js';
import { normalizePolygonMm } from './normalizePolygonMm.js';
import { validatePolygonMm } from './polygonValidation.js';
import { computePrincipalAxis } from './principalAxis.js';
import { buildColumnRails } from './buildColumnRails.js';
import { buildSatinZigzag } from './buildSatinZigzag.js';
import { measureCenterlineStraightness } from './measureCenterlineStraightness.js';
import { checkZigzagContainment } from './checkZigzagContainment.js';
import { evaluateStraightColumnEligibility } from '../eligibility/evaluateStraightColumnEligibility.js';
import { auditRegionTopology } from '../holeSemantics/auditRegionTopology.js';
import { reconcileHoleSemantics, resolveOverallEligibility } from '../holeSemantics/reconcileHoleSemantics.js';

/**
 * fixtureRegion: { caseId, regionId, region: { id, path_points, holes, region_class, type }, design }
 * design: { coordinateSpace, widthMm, heightMm }
 */
export function measureSatinCandidate(fixtureRegion, userOptions = {}) {
  const resolved = resolveOptions(userOptions);
  const base = {
    foundationVersion: FOUNDATION_VERSION,
    candidateOnly: true,
    integrated: false,
    caseId: fixtureRegion?.caseId ?? null,
    regionId: fixtureRegion?.regionId ?? null,
    options: resolved.options,
    geometryComplete: false,
    allStationsPaired: false,
    geometryEligibility: 'unavailable',
    holeMetadataStatus: 'unavailable',
    overallEligibility: 'unavailable',
  };
  if (!resolved.valid) {
    return { ...base, status: 'unavailable', eligibility: 'unavailable', reasons: resolved.reasons, warnings: [] };
  }
  const options = resolved.options;
  const region = fixtureRegion?.region;
  if (!region || !Array.isArray(region.path_points)) {
    return { ...base, status: 'unavailable', eligibility: 'unavailable', reasons: ['fixture region or path_points missing'], warnings: [] };
  }

  const norm = normalizePolygonMm(region.path_points, fixtureRegion.design);
  if (!norm.ok) {
    return { ...base, status: 'unavailable', eligibility: 'unavailable', reasons: norm.reasons, warnings: [] };
  }

  // P1.F0.2 — topology and hole semantics are measured independently of geometry.
  const topology = auditRegionTopology(region, fixtureRegion.design || {}, options);
  const holeSemantics = reconcileHoleSemantics({ region, topology, producerSemantics: userOptions.producerSemantics });
  const holeMetadataStatus = holeSemantics.holeMetadataStatus;

  const validation = validatePolygonMm(norm.pointsMm, region, options);
  const axis = computePrincipalAxis(norm.pointsMm);
  if (!axis.ok) {
    return {
      ...base, status: 'ineligible', eligibility: 'ineligible',
      geometryEligibility: 'ineligible',
      holeMetadataStatus,
      overallEligibility: resolveOverallEligibility('ineligible', holeMetadataStatus),
      reasons: [...validation.reasons, ...axis.reasons], warnings: norm.notes,
      validation, normalization: norm.transformation, pointsMm: norm.pointsMm, topology, holeSemantics,
      holeStatus: validation.holeStatus, holeSourceField: validation.holeSourceField, declaredHoleCount: validation.declaredHoleCount,
    };
  }

  // Geometry is measured even when the polygon is rejected: it stays available as
  // diagnostics, but it can never upgrade the eligibility verdict.
  const rails = buildColumnRails(norm.pointsMm, axis, options);
  const zigzag = buildSatinZigzag(rails, options);
  const straightness = measureCenterlineStraightness(rails.centerPoints, axis, options);
  const containment = checkZigzagContainment(zigzag.pointsMm, norm.pointsMm, options);
  const eligibility = evaluateStraightColumnEligibility({ validation, axis, rails, zigzag, straightness, containment, topology }, options);
  const geometryEligibility = eligibility.eligibility;
  const overallEligibility = resolveOverallEligibility(geometryEligibility, holeMetadataStatus);

  const geometryComplete = rails.allStationsPaired
    && rails.stationGapCount === 0
    && zigzag.pointsMm.length >= 4
    && containment.containmentStatus === 'contained';

  let status;
  if (!geometryComplete) status = rails.successfulStations > 0 ? 'partial' : 'ineligible';
  else if (overallEligibility === 'ineligible') status = 'ineligible';
  else if (overallEligibility === 'metadata_conflict') status = 'blocked_by_hole_metadata';
  else if (overallEligibility === 'partial') status = 'partial';
  else if (zigzag.metrics.splitRequired) status = 'unsupported_requires_split';
  else status = 'candidate_geometry_complete';

  return {
    ...base,
    status,
    // `eligibility` is kept as the single headline verdict = overallEligibility.
    eligibility: overallEligibility,
    geometryEligibility,
    holeMetadataStatus,
    overallEligibility,
    candidateGeometryComplete: geometryComplete,
    topology,
    holeSemantics,
    geometryComplete,
    allStationsPaired: rails.allStationsPaired,
    failedStations: rails.failedStations,
    failedStationIndices: rails.failedStationIndices,
    stationGapCount: rails.stationGapCount,
    maximumStationGapMm: rails.maximumStationGapMm,
    holeStatus: validation.holeStatus,
    holeSourceField: validation.holeSourceField,
    declaredHoleCount: validation.declaredHoleCount,
    polygonSimple: validation.polygonSimple,
    reasons: eligibility.reasons,
    warnings: [...norm.notes, ...zigzag.warnings],
    normalization: norm.transformation,
    pointsMm: norm.pointsMm,
    validation,
    axis,
    rails,
    zigzag,
    straightness,
    containment,
    eligibilityChecks: eligibility.checks,
  };
}