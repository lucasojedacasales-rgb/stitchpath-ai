/**
 * index.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A)
 * Read-only, engine-free entry point. Removing this folder does not affect the app.
 */

export { evaluateAWidthsResult } from './evaluateAWidthsResult.js';
export { resolveCoordinateSystem, createPointConverter } from './coordinateNormalizer.js';
export { measureRegion, extractPoints } from './geometryMeasurement.js';
export { matchCaseToRegion, isContourLike } from './regionMatcher.js';
export { normalizeTechnique } from './normalizeTechnique.js';
export { normalizeUnderlay } from './normalizeUnderlay.js';
export { extractAWidthsActual } from './extractAWidthsActual.js';
export { buildReference, compareAWidthsReference } from './compareAWidthsReference.js';
export {
  EVALUATOR_VERSION, DEFAULT_OPTIONS, COORDINATE_SPACES, MATCH_STATUS,
  TECHNIQUES, UNDERLAY_TYPES, COMPARISON_STATUS, CONCLUSIONS, MEASUREMENT_METHOD,
} from './evaluatorSchema.js';
export {
  VERIFIED_REGION_FIELDS, VERIFIED_PLAN_FIELDS, UNAVAILABLE_ENGINE_FIELDS,
  TECHNIQUE_RAW_MAP, UNDERLAY_RAW_MAP, CONTOUR_MARKERS,
} from './verifiedFieldMap.js';