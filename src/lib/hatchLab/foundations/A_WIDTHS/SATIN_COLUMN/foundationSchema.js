/**
 * foundationSchema.js — P1.F0 SATIN_COLUMN foundation (laboratory only).
 *
 * Every threshold used by the foundation is declared here, documented, and
 * overridable through options. None of these values is derived from the five
 * Hatch reference values and none of them is a production parameter.
 */

export const FOUNDATION_VERSION = 'P1.F0-A_WIDTHS-SATIN_COLUMN-STRAIGHT-V1';

export const DEFAULT_OPTIONS = {
  // Experimental initial station spacing along the principal axis (mm).
  // Explicit configuration value — NOT declared equivalent to Hatch spacing.
  spacingMm: 0.4,
  // Margin skipped at both axis extremes before the first/last station (mm),
  // so sections never sit exactly on the polygon caps.
  edgeMarginMm: 0.2,
  // Machine physical limit used only to flag splitRequired (mm). No autoSplit.
  maxStitchLengthMm: 12.1,
  // Minimum vertices for a usable polygon (after duplicate removal).
  minPoints: 4,
  // Minimum mean column width (mm) for straight-column eligibility.
  minWidthMm: 0.3,
  // Maximum allowed (max-min)/mean width variation for "approximately constant width".
  maxWidthVariationRatio: 0.35,
  // Minimum fraction of stations that must yield exactly two intersections.
  minStationSuccessRatio: 0.9,
  // Minimum major/minor extent ratio for a "bar" shape.
  minAspectRatio: 1.5,
  // Minimum axis confidence (1 - λmin/λmax) for a stable principal axis.
  minAxisConfidence: 0.5,
  // Numeric tolerance (mm) for deduplicating intersections on a section line.
  dedupeToleranceMm: 1e-6,
};

export const OPTION_KINDS = {
  spacingMm: 'configured',
  edgeMarginMm: 'configured',
  maxStitchLengthMm: 'configured',
  minPoints: 'configured',
  minWidthMm: 'configured',
  maxWidthVariationRatio: 'configured',
  minStationSuccessRatio: 'configured',
  minAspectRatio: 'configured',
  minAxisConfidence: 'configured',
  dedupeToleranceMm: 'configured',
};

// Statuses a measurement can end in. Deliberately no pass/fail/approved vocabulary.
export const RESULT_STATUSES = [
  'unavailable',                 // structural data missing or unusable
  'ineligible',                  // polygon/axis incompatible with a straight column
  'partial',                     // geometry produced but thresholds not met
  'unsupported_requires_split',  // geometry complete but a stitch exceeds maxStitchLengthMm
  'candidate_geometry_complete', // full candidate geometry produced within limits
];

export const ELIGIBILITY_VALUES = ['eligible', 'partial', 'ineligible', 'unavailable'];

export function resolveOptions(options = {}) {
  const merged = { ...DEFAULT_OPTIONS, ...options };
  const reasons = [];
  if (!(Number.isFinite(merged.spacingMm) && merged.spacingMm > 0)) reasons.push('spacingMm must be a finite positive number');
  if (!(Number.isFinite(merged.maxStitchLengthMm) && merged.maxStitchLengthMm > 0)) reasons.push('maxStitchLengthMm must be a finite positive number');
  if (!(Number.isFinite(merged.edgeMarginMm) && merged.edgeMarginMm >= 0)) reasons.push('edgeMarginMm must be a finite non-negative number');
  return { options: merged, valid: reasons.length === 0, reasons };
}