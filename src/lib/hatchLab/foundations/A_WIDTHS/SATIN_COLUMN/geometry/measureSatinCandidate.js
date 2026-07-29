/**
 * measureSatinCandidate.js — pure orchestrator: fixture region → normalized mm
 * polygon → validation → principal axis → rails → zigzag → eligibility.
 * Never mutates its input, never touches the productive engine.
 */

import { resolveOptions, FOUNDATION_VERSION } from '../foundationSchema.js';
import { normalizePolygonMm } from './normalizePolygonMm.js';
import { validatePolygonMm } from './polygonValidation.js';
import { computePrincipalAxis } from './principalAxis.js';
import { buildColumnRails } from './buildColumnRails.js';
import { buildSatinZigzag } from './buildSatinZigzag.js';
import { evaluateStraightColumnEligibility } from '../eligibility/evaluateStraightColumnEligibility.js';

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

  const validation = validatePolygonMm(norm.pointsMm, region, options);
  if (!validation.valid) {
    return {
      ...base, status: 'ineligible', eligibility: 'ineligible',
      reasons: validation.reasons, warnings: norm.notes, validation, normalization: norm.transformation,
    };
  }

  const axis = computePrincipalAxis(norm.pointsMm);
  if (!axis.ok) {
    return {
      ...base, status: 'ineligible', eligibility: 'ineligible',
      reasons: axis.reasons, warnings: norm.notes, validation, normalization: norm.transformation,
    };
  }

  const rails = buildColumnRails(norm.pointsMm, axis, options);
  const zigzag = buildSatinZigzag(rails, options);
  const eligibility = evaluateStraightColumnEligibility({ validation, axis, rails, zigzag }, options);

  let status;
  if (eligibility.eligibility === 'ineligible') status = 'ineligible';
  else if (eligibility.eligibility === 'partial') status = 'partial';
  else if (zigzag.metrics.splitRequired) status = 'unsupported_requires_split';
  else status = 'candidate_geometry_complete';

  return {
    ...base,
    status,
    eligibility: eligibility.eligibility,
    reasons: eligibility.reasons,
    warnings: [...norm.notes, ...zigzag.warnings],
    normalization: norm.transformation,
    pointsMm: norm.pointsMm,
    validation,
    axis,
    rails,
    zigzag,
    eligibilityChecks: eligibility.checks,
  };
}