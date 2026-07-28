/**
 * evaluatorSchema.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A)
 * Declarative vocabularies, default options and the field envelope used by the
 * A_WIDTHS evaluator. No logic, no engine imports.
 */

export const EVALUATOR_VERSION = '0.1.0-A_WIDTHS';

export const COORDINATE_SPACES = Object.freeze(['mm', 'normalized_0_1', 'pixels']);
export const COORDINATE_STATUS = Object.freeze(['resolved', 'unavailable']);

export const MATCH_STATUS = Object.freeze(['matched', 'ambiguous', 'unmatched', 'unavailable']);
export const AVAILABILITY = Object.freeze(['available', 'unavailable', 'unknown']);

export const TECHNIQUES = Object.freeze([
  'satin', 'tatami', 'running', 'triple_running', 'contour', 'fill', 'unknown', 'unavailable',
]);

export const UNDERLAY_TYPES = Object.freeze([
  'center_run', 'edge_run', 'zigzag', 'edge_run_plus_zigzag', 'none', 'unknown', 'unavailable',
]);

export const COMPARISON_STATUS = Object.freeze([
  'equal', 'different', 'unavailable_reference', 'unavailable_actual',
  'ambiguous_match', 'not_comparable', 'informational',
]);

/** Conclusions allowed in P0.3A. pass/fail/improved/regressed are forbidden. */
export const CONCLUSIONS = Object.freeze([
  'evaluated', 'partial', 'inconclusive', 'invalid_input', 'no_matches', 'ambiguous',
]);

export const MEASUREMENT_METHOD = 'bounding_box_width';

export const DEFAULT_OPTIONS = Object.freeze({
  /** Matching tolerances (mm). */
  centerToleranceMm: 1.0,
  maximumCenterDistanceMm: 6.0,
  widthToleranceMm: 1.0,
  heightToleranceMm: 2.0,
  aspectToleranceRatio: 0.5,
  /** Two candidates closer than this in score → ambiguous. */
  ambiguityScoreMargin: 0.05,
  matchPolicy: 'spatial_score',
  /** Explicit coordinate space, used only when design.coordinateSpace is absent. */
  coordinateSpace: null,
  /**
   * The base engine declares NO verified coordinateSpace metadata (verified in
   * P0.3A). Reading result.meta.coordinateSpace therefore requires an explicit
   * opt-in and is reported as unverified.
   */
  allowResultMetaCoordinateSpace: false,
  /** Verified alternative field paths, e.g. { technique: ['stitch_type'] }. */
  alternativeFields: null,
  /** Numeric equality tolerance for informative comparisons (mm / degrees). */
  valueToleranceMm: 0.01,
  /**
   * Hatch "spacing" and engine "density" are not verified to be the same
   * quantity. Only an explicit opt-in makes them comparable, and the value is
   * then reported as derived with its formula.
   */
  treatDensityAsSpacing: false,
  /** Deterministic timestamp; null keeps the output reproducible. */
  generatedAt: null,
});

/** Canonical field envelope. `0` and `false` are values, never absence. */
export function makeField({
  rawValue = null, normalizedValue = null, sourceField = null,
  availability = 'unavailable', derived = false, reason = '', extra = null,
}) {
  const field = { rawValue, normalizedValue, sourceField, availability, derived, reason };
  return extra ? { ...field, ...extra } : field;
}

export function unavailableField(reason, sourceField = null) {
  return makeField({ availability: 'unavailable', reason, sourceField });
}

export function isPresent(value) {
  return value !== undefined && value !== null;
}