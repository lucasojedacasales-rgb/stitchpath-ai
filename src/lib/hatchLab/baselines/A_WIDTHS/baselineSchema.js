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

// ─── P0.3B.0 · parity with the productive Editor call ────────────────────────

/**
 * Real contract of the productive call, obtained by READ-ONLY inspection of
 * src/lib/pipeline/runner.js (lines 61-86) and src/pages/Editor.jsx
 * (startProcessing, lines 534-554). Nothing here is invented.
 */
export const EDITOR_RUNPIPELINE_CONTRACT = Object.freeze({
  signature: 'runPipeline(imageUrl, config, opts = { onProgress, skipStages = [], initialCtx = {} })',
  callSite: 'src/pages/Editor.jsx startProcessing (lines 545-554)',
  processingUrlPolicy: 'The FIRST argument is the current imageUrl (the *_masked.png when a mask was applied); the original upload is used only for darkStroke. The baseline has no mask, so processingUrl === the verified source image URL.',
  progressCallbackContract: 'runPipeline accepts opts.onProgress(pct, stageId), but the Editor does NOT pass it. The harness therefore passes no callback and reports progress only from ctx.stageLog after the run.',
  configShape: '{ ...configRef.current, ...processingProfile.pipelineConfig, effectiveProfile: processingProfile }',
  profileCall: 'resolveEffectiveEmbroideryProfile(configRef.current, preprocessSettings, editorMachineSettings)',
  initialCtxKeys: Object.freeze(['darkStroke', 'inputAudit', 'effectiveProfile']),
  optionalInitialCtxKeys: Object.freeze(['aiStrategy']),
  skipStages: Object.freeze([]),
  darkStrokeBuilder: 'buildStrictDarkStrokeContextFromOriginalImage(darkStrokeSourceUrl, pickMotorConfig(config)) — src/lib/rawDarkStrokeTest.js',
  inputAuditFields: Object.freeze(['originalUploadUrl', 'imageUrl', 'processedImageUrl', 'maskedImageUrl', 'darkStrokeSourceUrl', 'isUsingMaskedForDarkStroke']),
  inputAuditBuilder: 'buildInputSegmentationAudit — module-local helper in src/pages/Editor.jsx (lines 74-85), NOT exported',
});

export const PARITY_STATUSES = Object.freeze(['exact', 'equivalent', 'mismatch', 'unavailable']);
export const PARITY_STATUSES_ALLOWING_RUN = Object.freeze(['exact', 'equivalent']);

// ─── P0.3B.0 · persistent single-execution guard ─────────────────────────────

export const CAPTURE_STATE_KEY = 'HATCH_LAB_BASE_ENGINE_A_WIDTHS_V1_CAPTURE_STATE';
export const CAPTURE_STATES = Object.freeze(['ready', 'invoked', 'completed', 'failed']);
export const CAPTURE_STATES_BLOCKING_RUN = Object.freeze(['invoked', 'completed', 'failed']);
export const CAPTURE_STATE_FIELDS = Object.freeze([
  'baselineId', 'state', 'invocationId', 'pipelineInvocationCount',
  'invokedAt', 'completedAt', 'failedAt', 'sourceSha256', 'resultSha256', 'reason',
]);

// ─── P0.3B.0 · full-result archive (IndexedDB) ───────────────────────────────

export const CAPTURE_ARCHIVE_DB = 'hatch_lab_baselines';
export const CAPTURE_ARCHIVE_STORE = 'a_widths_captures';
export const CAPTURE_ARCHIVE_FIELDS = Object.freeze([
  'baselineId', 'invocationId', 'status', 'json', 'sizeBytes', 'sha256',
]);

export const CAPTURE_FILE_NAMES = Object.freeze({
  full: 'BASE-ENGINE-A-WIDTHS-V1.capture.json',
  summary: 'BASE-ENGINE-A-WIDTHS-V1.summary.json',
});

/** Sections the downloaded full capture must contain, in order. */
export const FULL_CAPTURE_SECTIONS = Object.freeze([
  'status', 'pipelineInvocationCount', 'source', 'engineInputAudit', 'editorParityAudit',
  'baselineConfig', 'regionSourceResolution', 'coordinateDeclaration', 'stageLog',
  'pipelineSnapshot', 'omittedFields', 'missingContextKeys', 'preservedRegionFieldReport',
  'regionsSummary', 'evaluationReport', 'readiness', 'resultSha256',
]);

export const PREVIEW_CHARACTER_LIMIT = 200000;
export const PREVIEW_TRUNCATION_NOTICE = 'Vista previa truncada; el archivo descargado contiene el resultado completo.';

/** The ONLY module allowed to import the base engine inside Hatch Lab. */
export const ENGINE_IMPORT_ALLOWLIST = Object.freeze(['src/tests/hatchLab/aWidthsBaselineCapture.js']);