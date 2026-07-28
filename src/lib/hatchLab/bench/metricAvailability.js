/**
 * metricAvailability.js — Hatch Lab (P0)
 * Availability vocabulary shared by extraction, comparison and reporting.
 * Missing data is NEVER represented as 0.
 */

export const UNAVAILABLE = 'unavailable';

export const isUnavailable = v => v === UNAVAILABLE || v == null;
export const isAvailable = v => !isUnavailable(v);

/** Metrics required for a comparison to be conclusive at all. */
export const ESSENTIAL_METRICS = Object.freeze(['regionCount', 'colorCount']);

/** Metrics whose direction of "better" cannot be inferred without expectedResult. */
export const DIRECTIONLESS_METRICS = Object.freeze([
  'regionCount', 'fillRegionCount', 'contourRegionCount', 'detailRegionCount',
  'discardedRegionCount', 'colorCount', 'stitchCount', 'jumpCount', 'trimCount',
  'colorChangeCount', 'commandCount', 'processingTimeMs', 'smallRegionCount',
  'explicitHoleCount', 'totalArea', 'averageRegionArea', 'minimumRegionArea',
  'maximumRegionArea',
]);

export const METRIC_KEYS = Object.freeze([
  'regionCount', 'fillRegionCount', 'contourRegionCount', 'detailRegionCount',
  'discardedRegionCount', 'colorCount', 'orderedRegionIds', 'colorSequence',
  'explicitHoleCount', 'smallRegionCount', 'totalArea', 'averageRegionArea',
  'minimumRegionArea', 'maximumRegionArea', 'stitchCount', 'jumpCount',
  'trimCount', 'colorChangeCount', 'commandCount', 'processingTimeMs',
  'stageTimings', 'warningCount', 'errorCount',
]);

export const DEFAULT_TOLERANCES = Object.freeze({
  regionCount: { absolute: 0 },
  colorCount: { absolute: 0 },
  stitchCount: { relative: 0.02 },
  jumpCount: { absolute: 0 },
  trimCount: { absolute: 0 },
  commandCount: { relative: 0.02 },
  totalArea: { relative: 0.01 },
  processingTimeMs: { relative: 0.5 },
});