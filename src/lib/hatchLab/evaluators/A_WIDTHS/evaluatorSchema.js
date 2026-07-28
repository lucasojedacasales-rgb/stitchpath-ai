/**
 * evaluatorSchema.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A.1)
 * Declarative vocabularies, default options and the field envelope.
 * No logic, no engine imports.
 *
 * 0.2.0 hardens: one-to-one matching, region identity, explicit region-source
 * selection, source conflicts, technical coverage and informative comparisons.
 */

export const EVALUATOR_VERSION = '0.2.0-A_WIDTHS';

export const COORDINATE_SPACES = Object.freeze(['mm', 'normalized_0_1', 'pixels']);
export const COORDINATE_STATUS = Object.freeze(['resolved', 'unavailable']);

export const MATCH_STATUS = Object.freeze(['matched', 'ambiguous', 'unmatched', 'unavailable']);

/** `conflict` = several verified sources disagree; the value must not be used. */
export const AVAILABILITY = Object.freeze(['available', 'unavailable', 'unknown', 'conflict']);
export const SOURCE_AGREEMENT = Object.freeze(['single_source', 'consistent', 'conflict', 'unavailable']);

export const IDENTITY_STATUS = Object.freeze(['stable', 'duplicated_id', 'missing_id']);
export const ELIGIBILITY = Object.freeze(['accepted', 'rejected']);

export const REJECTION_CODES = Object.freeze([
  'OUTSIDE_SEARCH_RADIUS', 'OUTSIDE_ACCEPTED_CENTER_DISTANCE', 'SCORE_BELOW_MINIMUM',
  'HEIGHT_DIFFERENCE_EXCEEDED', 'ASPECT_DIFFERENCE_EXCEEDED',
  'REGION_ROLE_INCOMPATIBLE', 'UNSTABLE_IDENTITY',
]);

export const REGION_SOURCES = Object.freeze({
  regions: 'result.regions',
  optimizedRegions: 'result.optimizedRegions',
  optimizedSequence: 'result.optimized.optimizedSequence',
  objects: 'result.objects',
});

export const ERROR_CODES = Object.freeze([
  'AMBIGUOUS_REGION_SOURCE', 'REGION_SOURCE_UNAVAILABLE', 'DUPLICATED_SEED_CASE_ID',
  'UNVERIFIED_DENSITY_SPACING_EQUIVALENCE', 'INVALID_RESULT_STRUCTURE', 'INVALID_SEED_CASES',
  'ASSIGNMENT_SEARCH_INCOMPLETE',
]);

export const TECHNIQUES = Object.freeze([
  'satin', 'tatami', 'running', 'triple_running', 'contour', 'fill', 'unknown', 'unavailable',
]);

export const UNDERLAY_TYPES = Object.freeze([
  'center_run', 'edge_run', 'zigzag', 'edge_run_plus_zigzag', 'none', 'unknown', 'unavailable',
]);

export const COMPARISON_STATUS = Object.freeze([
  'equal', 'different', 'unavailable_reference', 'unavailable_actual',
  'ambiguous_match', 'not_comparable', 'informational', 'source_conflict',
]);

export const MATCH_CONCLUSIONS = Object.freeze([
  'all_assigned', 'partial_assignment', 'ambiguous_assignment', 'no_assignment', 'unavailable',
]);
export const DATA_CONCLUSIONS = Object.freeze(['complete', 'incomplete', 'conflicted', 'unavailable']);

/** Global conclusions allowed in this phase. pass/fail/improved/regressed are forbidden. */
export const CONCLUSIONS = Object.freeze([
  'evaluated', 'partial', 'inconclusive', 'invalid_input', 'no_matches', 'ambiguous',
]);

export const MEASUREMENT_METHOD = 'bounding_box_width';

export const DEFAULT_OPTIONS = Object.freeze({
  /** Region collection: 'regions' | 'optimizedRegions' | 'optimizedSequence' | 'objects'. */
  regionSource: null,

  /** SEARCH radius — only decides which candidates are examined. */
  maximumCenterDistanceMm: 6.0,

  /** ACCEPTANCE criteria — being inside the search radius is never enough. */
  acceptedCenterDistanceMm: 1.0,
  minimumAcceptedScore: 0.75,
  maximumAcceptedHeightDifferenceMm: 2.0,
  maximumAcceptedAspectDifference: null,
  requireStableIdentity: true,
  requireCompatibleRegionRole: true,

  /** Scoring normalizers (never acceptance filters on their own). */
  widthToleranceMm: 1.0,
  heightToleranceMm: 2.0,
  aspectToleranceRatio: 0.5,

  /** Ambiguity: two global solutions within this score margin → ambiguous. */
  ambiguityScoreMargin: 0.05,
  matchPolicy: 'global_one_to_one',
  /**
   * Safety guards only. Accepted candidates are never silently truncated: if
   * either guard is hit, the search is reported as incomplete, optimality is not
   * proven and the conclusion can never be `evaluated`.
   */
  candidatesPerCaseLimit: 64,
  maximumBranches: 2000000,

  /** Merge diagnostics: width beyond factor × nominal width is only an observation. */
  mergeWidthFactor: 3.0,

  /** Coordinate space. */
  coordinateSpace: null,
  allowResultMetaCoordinateSpace: false,
  alternativeFields: null,

  /** Numeric tolerances. */
  valueToleranceMm: 0.01,
  angleToleranceDeg: 0,
  densityToleranceMm: 0.001,

  /** Data coverage required to consider the basic extraction complete. */
  requiredActualFields: Object.freeze(['widthMm', 'heightMm', 'technique']),
  /** Documented policy when a required field has a source conflict. */
  conflictInRequiredFieldPolicy: 'ambiguous',

  /** Deterministic timestamp; null keeps the output reproducible. */
  generatedAt: null,
});

/** Options removed from the public API in 0.2.0. */
export const FORBIDDEN_OPTIONS = Object.freeze({
  treatDensityAsSpacing: 'UNVERIFIED_DENSITY_SPACING_EQUIVALENCE',
});

/** Canonical field envelope. `0` and `false` are values, never absence. */
export function makeField({
  rawValue = null, normalizedValue = null, sourceField = null,
  availability = 'unavailable', derived = false, reason = '', unit = null, extra = null,
}) {
  const field = { rawValue, normalizedValue, sourceField, availability, derived, reason, unit };
  return extra ? { ...field, ...extra } : field;
}

export function unavailableField(reason, sourceField = null, unit = null) {
  return makeField({ availability: 'unavailable', reason, sourceField, unit });
}

export function isPresent(value) {
  return value !== undefined && value !== null;
}