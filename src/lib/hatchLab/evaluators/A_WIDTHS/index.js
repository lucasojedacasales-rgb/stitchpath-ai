/**
 * index.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A.1)
 * Read-only, engine-free entry point. Removing this folder does not affect the app.
 */

export { evaluateAWidthsResult } from './evaluateAWidthsResult.js';
export { resolveCoordinateSystem, createPointConverter } from './coordinateNormalizer.js';
export { measureRegion, extractPoints } from './geometryMeasurement.js';
export { selectRegionSource } from './regionSourceSelector.js';
export { buildMeasuredCandidates } from './regionIdentity.js';
export { buildPlanIndex, resolvePlanEntry } from './planIndex.js';
export { resolveFieldSources, numericNormalizer, booleanNormalizer } from './resolveFieldSources.js';
export { evaluateCandidateForCase, evaluateCandidatesForCase, seedTargets, tolerancesUsed, isContourLike } from './regionMatcher.js';
export {
  matchCasesToRegions, solveAssignmentOptions, isBetterSolution, buildSignature,
  OBJECTIVE_PRIORITY, PROOF_METHOD,
} from './globalAssignment.js';
export { detectPossibleMergedRegions } from './mergeDetection.js';
export { normalizeTechniqueValue } from './normalizeTechnique.js';
export { normalizeUnderlayTypeValue, buildUnderlayFields } from './normalizeUnderlay.js';
export { extractAWidthsActual } from './extractAWidthsActual.js';
export { buildReference, compareAWidthsReference } from './compareAWidthsReference.js';
export {
  EVALUATOR_VERSION, DEFAULT_OPTIONS, FORBIDDEN_OPTIONS, COORDINATE_SPACES, MATCH_STATUS,
  AVAILABILITY, SOURCE_AGREEMENT, IDENTITY_STATUS, ELIGIBILITY, REJECTION_CODES,
  REGION_SOURCES, ERROR_CODES, TECHNIQUES, UNDERLAY_TYPES, COMPARISON_STATUS,
  MATCH_CONCLUSIONS, DATA_CONCLUSIONS, CONCLUSIONS, MEASUREMENT_METHOD,
  COMPARISON_SUPPRESSION_REASONS,
} from './evaluatorSchema.js';
export {
  VERIFIED_REGION_FIELDS, VERIFIED_PLAN_FIELDS, UNAVAILABLE_ENGINE_FIELDS,
  TECHNIQUE_RAW_MAP, UNDERLAY_RAW_MAP, CONTOUR_MARKERS,
} from './verifiedFieldMap.js';