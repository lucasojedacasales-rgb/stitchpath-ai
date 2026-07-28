/**
 * metricAvailability.js — Hatch Lab (P0.1)
 * Metric registry + availability vocabulary shared by extraction, criteria
 * evaluation and reporting. Missing data is NEVER represented as 0.
 */

export const UNAVAILABLE = 'unavailable';

/**
 * Metric registry. `type` drives operator compatibility:
 *   number   → equals / minimum / maximum / between / relative_to_baseline
 *   sequence → sequence_equals / set_equals
 *   object   → not allowed in expectedResult criteria
 */
export const METRIC_DEFS = Object.freeze({
  // ── regions ──
  regionCount:                { type: 'number', unit: 'count' },
  fillRegionCount:            { type: 'number', unit: 'count' },
  contourRegionCount:         { type: 'number', unit: 'count' },
  detailRegionCount:          { type: 'number', unit: 'count' },
  discardedRegionCount:       { type: 'number', unit: 'count' },
  unknownRegionTypeCount:     { type: 'number', unit: 'count' },
  classifiedRegionCoverage:   { type: 'number', unit: 'ratio' },
  colorCount:                 { type: 'number', unit: 'count' },
  colorCoverage:              { type: 'number', unit: 'ratio' },
  orderedRegionIds:           { type: 'sequence', unit: null },
  colorSequence:              { type: 'sequence', unit: null },
  explicitHoleCount:          { type: 'number', unit: 'count' },
  holeCoverage:               { type: 'number', unit: 'ratio' },
  smallRegionCount:           { type: 'number', unit: 'count' },
  totalAreaMm2:               { type: 'number', unit: 'mm2' },
  averageRegionAreaMm2:       { type: 'number', unit: 'mm2' },
  minimumRegionAreaMm2:       { type: 'number', unit: 'mm2' },
  maximumRegionAreaMm2:       { type: 'number', unit: 'mm2' },
  totalAreaNormalized:        { type: 'number', unit: 'normalized' },
  averageRegionAreaNormalized:{ type: 'number', unit: 'normalized' },
  // ── commands ──
  stitchCount:                { type: 'number', unit: 'count' },
  jumpCount:                  { type: 'number', unit: 'count' },
  trimCount:                  { type: 'number', unit: 'count' },
  colorChangeCount:           { type: 'number', unit: 'count' },
  endCount:                   { type: 'number', unit: 'count' },
  stopCount:                  { type: 'number', unit: 'count' },
  unknownCommandCount:        { type: 'number', unit: 'count' },
  commandCount:               { type: 'number', unit: 'count' },
  commandRecognitionCoverage: { type: 'number', unit: 'ratio' },
  // ── stage log / run ──
  processingTimeMs:           { type: 'number', unit: 'ms' },
  stageTimings:               { type: 'object', unit: null },
  stageFailureCount:          { type: 'number', unit: 'count' },
  completedStageCount:        { type: 'number', unit: 'count' },
  unavailableStageTimingCount:{ type: 'number', unit: 'count' },
  warningCount:               { type: 'number', unit: 'count' },
  errorCount:                 { type: 'number', unit: 'count' },
});

export const METRIC_KEYS = Object.freeze(Object.keys(METRIC_DEFS));

/** Metrics whose value is derived from the command stream. */
export const COMMAND_DERIVED_METRICS = Object.freeze([
  'stitchCount', 'jumpCount', 'trimCount', 'colorChangeCount',
  'endCount', 'stopCount', 'unknownCommandCount', 'commandCount',
  'commandRecognitionCoverage',
]);

export const OPERATORS = Object.freeze([
  'equals', 'minimum', 'maximum', 'between',
  'sequence_equals', 'set_equals', 'relative_to_baseline',
]);
export const NUMERIC_OPERATORS = Object.freeze(['equals', 'minimum', 'maximum', 'between', 'relative_to_baseline']);
export const SEQUENCE_OPERATORS = Object.freeze(['sequence_equals', 'set_equals']);
export const RELATIVE_DIRECTIONS = Object.freeze(['higher', 'lower', 'equal']);

/** Availability entry helpers. */
export const availabilityEntry = (unit, source, complete = true, reason = null) =>
  ({ available: true, complete, reason, unit, source });
export const unavailableEntry = (reason, unit = null) =>
  ({ available: false, complete: false, reason, unit, source: null });