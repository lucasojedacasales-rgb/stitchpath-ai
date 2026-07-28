/**
 * baselineSchema.js — Hatch Lab / baselines / A_WIDTHS (P0.3B)
 *
 * Declarative constants for the first controlled baseline of the CURRENT base
 * engine over the real A_WIDTHS sheet. No logic, no engine imports, no rules.
 *
 * This module never emits pass/fail and never defines expectedResult.
 */

export const BASELINE_SCHEMA_VERSION = '1.0.0';
export const BASELINE_ID = 'BASE-ENGINE-A-WIDTHS-V1';
export const BASELINE_PHASE = 'A_WIDTHS';

/** Verified source image (hash checked against the seed manifest + evidence index). */
export const SOURCE_IMAGE = Object.freeze({
  fileName: 'HATCH-A-WIDTHS-EXACT-100x80mm-300dpi.png',
  packageRelativePath: '00_Fuentes/Imagenes/HATCH-A-WIDTHS-EXACT-100x80mm-300dpi.png',
  originPackage: 'A_Anchuras_parte_01.zip',
  sha256: '4CB26E42A48E7D9F9D763CC644DA7B2FDB95A2022A65CDE50C05745619C12005',
  bytes: 46432,
  widthPx: 1181,
  heightPx: 945,
  format: 'PNG',
  dpi: 300,
});

/** Physical sheet size. The ONLY geometry shared with the Hatch reference. */
export const DESIGN_MM = Object.freeze({ widthMm: 100, heightMm: 80 });

/** Run status vocabulary. `completed_with_stage_errors` never hides a failure. */
export const RUN_STATUS = Object.freeze([
  'not_run', 'completed', 'completed_with_stage_errors', 'failed_before_context',
]);

/** Conclusions the evaluator may legitimately return for this baseline. */
export const ALLOWED_CONCLUSIONS = Object.freeze([
  'evaluated', 'partial', 'ambiguous', 'no_matches', 'inconclusive', 'invalid_input',
]);

/** Forbidden vocabulary: this baseline is purely informative. */
export const FORBIDDEN_VERDICTS = Object.freeze([
  'pass', 'fail', 'improved', 'regressed', 'accepted', 'rejected',
]);

/** Readiness flags. All false in P0.3B, by decision, not by omission. */
export const READINESS = Object.freeze({
  expectedResultDefined: false,
  benchmarkReady: false,
  motorIntegrationReady: false,
  physicalValidationAvailable: false,
  rulesApplied: false,
});

/** Region fields that must survive the snapshot untouched and unrounded. */
export const PRESERVED_REGION_FIELDS = Object.freeze([
  'id', 'path_points', 'contour_points', 'centroid', 'area_mm2', 'perimeter_mm',
  'stitch_type', 'density', 'stitch_length_mm', 'pull_compensation', 'angle', 'fill_angle',
  'recommended_underlay', 'underlay', 'priority', 'type', 'region_class', 'parentRegionId',
  'color', 'layer_order', 'travelOrder',
]);

/** Context keys captured as plain serializable data when present. */
export const CAPTURED_CONTEXT_KEYS = Object.freeze([
  'analysis', 'enhanced', 'contours', 'semanticMap', 'vectorRegions', 'regions',
  'plan', 'optimized', 'pathMetrics', 'qualityPhase1Report', 'stageLog', 'config',
  'meta', 'warnings', 'errors',
]);

/** Columns of regionsSummary.json / regionsSummary.csv, in order. */
export const REGION_SUMMARY_COLUMNS = Object.freeze([
  'sourceIndex', 'id', 'type', 'region_class', 'parentRegionId', 'color',
  'boundingWidthMm', 'boundingHeightMm', 'centerXMm', 'centerYMm', 'areaMm2',
  'stitch_type', 'density', 'pull_compensation', 'angle', 'underlay',
  'recommended_underlay.enabled', 'recommended_underlay.type', 'recommended_underlay.density_mm',
  'priority', 'layer_order', 'travelOrder', 'pathPointCount', 'contourPointCount',
]);

/** Hatch-derived values that must NEVER appear in the engine input. */
export const FORBIDDEN_INPUT_KEYS = Object.freeze([
  'expectedResult', 'candidateRules', 'seedCases', 'caseId', 'observation',
  'expectedTechnique', 'expectedUnderlay', 'expectedSpacingMm', 'expectedPullCompensationMm',
  'spacingMode', 'spacingMm', 'autoSplit', 'ruleScope', 'hatch', 'hatchReference',
]);

/** Case ids that must not be present anywhere in the engine input. */
export const SEED_CASE_IDS = Object.freeze([
  'HATCH-A-WIDTHS-A1', 'HATCH-A-WIDTHS-A5', 'HATCH-A-WIDTHS-A6',
  'HATCH-A-WIDTHS-A7', 'HATCH-A-WIDTHS-A8',
]);

/** Evaluator options fixed for this baseline (regionSource is resolved at capture). */
export const EVALUATOR_OPTIONS = Object.freeze({
  candidatesPerCaseLimit: 64,
  maximumBranches: 2000000,
});

export const REQUIRED_EVALUATOR_VERSION = '0.2.1-A_WIDTHS';