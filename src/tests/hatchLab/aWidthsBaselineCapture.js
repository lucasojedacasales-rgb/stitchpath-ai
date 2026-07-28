/**
 * aWidthsBaselineCapture.js — Hatch Lab capture harness (P0.3B.0)
 *
 * Prepares (and, when explicitly triggered, performs) the SINGLE real execution
 * of the current base engine over the real A_WIDTHS sheet.
 *
 * ── Isolation contract ──────────────────────────────────────────────────────
 * This file is the single controlled exception of P0.3B: it may import the base
 * engine in ONE direction only:
 *
 *     lab harness → base engine
 *
 * The base engine never imports Hatch Lab, and the pure evaluator
 * (src/lib/hatchLab/evaluators/**) imports no productive module.
 *
 * It is not reachable from the router or from any productive UI. It never calls
 * buildFinalCommands, never exports a file, never saves a project, never touches
 * entities, Engine V2 or referenceLearning, and never applies a Hatch rule.
 */

import { runPipeline } from '@/lib/pipeline/runner';
import { resolveEffectiveEmbroideryProfile } from '@/lib/embroideryEngineProfiles.js';
import { DEFAULT_MACHINE } from '@/lib/exportPipeline';
import { DEFAULT_PREPROCESS } from '@/components/editor/PreprocessingPanel';
import { buildStrictDarkStrokeContextFromOriginalImage } from '@/lib/rawDarkStrokeTest';
import { evaluateAWidthsResult } from '@/lib/hatchLab/evaluators/A_WIDTHS/index.js';
import { A_WIDTHS_CASES } from '@/lib/hatchLab/seed/real/A_WIDTHS/index.js';
import {
  BASELINE_ID, SOURCE_IMAGE, DESIGN_MM, EVALUATOR_OPTIONS, REQUIRED_EVALUATOR_VERSION,
  READINESS, EDITOR_RUNPIPELINE_CONTRACT,
} from '@/lib/hatchLab/baselines/A_WIDTHS/baselineSchema.js';
import { sanitizePipelineResult } from '@/lib/hatchLab/baselines/A_WIDTHS/sanitizePipelineResult.js';
import {
  buildRegionsSummary, regionsSummaryToCsv, resolveCanonicalRegionSource,
  resolveCoordinateDeclaration, buildEngineInputAudit, buildEditorParityAudit,
  createCaptureStateStore, createCaptureArchive, buildCaptureArtifacts,
} from '@/lib/hatchLab/baselines/A_WIDTHS/canonicalSnapshot.js';

export const LAB_RESULT_KEY = '__HATCH_LAB_A_WIDTHS_BASELINE_V1__';

/** In-memory guard — SECOND barrier only; the persistent state is the first. */
let pipelineInvocationCount = 0;
export const getPipelineInvocationCount = () => pipelineInvocationCount;

const defaultStateStore = () => createCaptureStateStore(globalThis.localStorage);
const defaultArchive = () => createCaptureArchive(globalThis.indexedDB);
const defaultSubtle = () => globalThis.crypto.subtle;

/**
 * Replica of Editor.pickMotorConfig (module-local helper, lines 119-130). Same
 * key list, same "skip undefined" rule. Declared as an equivalence, not as exact.
 */
const MOTOR_CONFIG_KEYS = [
  'fabric_type', 'width_mm', 'height_mm', 'color_count', 'mode', 'remove_bg', 'tension_comp',
  'fill_angle', 'tatami_density', 'vector_engine', 'useVectorFusion', 'contourSafeMode',
  'ce01SafeFillMode', 'ce01ProductionMode', 'validationMode', 'professionalMode', 'unifiedStandardProProfile',
  'profile_id', 'profileId', 'engineProfileId', 'universalAutoDigitizerPro', 'travelAndMicroDetailCleanup',
  'universalThreadColorSequenceOptimizer', 'universalCartoonCleanupAndOutlineMerge',
  'threadStopCompactionV1', 'contourCleanupV1',
  'learnedFillDensityMm', 'learnedFillAngleDeg', 'learnedNeighborAngleVariationDeg',
];
const pickMotorConfig = (config = {}) =>
  MOTOR_CONFIG_KEYS.reduce((out, key) => { if (config[key] !== undefined) out[key] = config[key]; return out; }, {});

/** Replica of Editor.buildInputSegmentationAudit (lines 74-85), field for field. */
function buildInputSegmentationAudit({ originalImageUrl, config, project, imageUrl }) {
  const candidates = [originalImageUrl, config?.originalUploadUrl, project?.thumbnail_url, imageUrl].filter(Boolean);
  const darkStrokeSourceUrl = candidates.find(url => !/_masked/i.test(url)) || null;
  return {
    originalUploadUrl: config?.originalUploadUrl || project?.thumbnail_url || originalImageUrl || null,
    imageUrl: imageUrl || null,
    processedImageUrl: null,
    maskedImageUrl: /_masked/i.test(imageUrl || '') ? imageUrl : null,
    darkStrokeSourceUrl,
    isUsingMaskedForDarkStroke: !!(darkStrokeSourceUrl && /_masked/i.test(darkStrokeSourceUrl)),
  };
}

/** Editor DEFAULT_CONFIG (lines 87-113) with ONLY the real sheet height changed. */
const BASE_CONFIG = Object.freeze({
  fabric_type: 'Algodón', width_mm: DESIGN_MM.widthMm, height_mm: DESIGN_MM.heightMm, color_count: 6,
  mode: 'hybrid', remove_bg: false, tension_comp: 0.5,
  fill_angle: null, tatami_density: 0.4, vector_engine: 'hybrid', useVectorFusion: false,
  contourSafeMode: true, ce01SafeFillMode: true, ce01ProductionMode: true, validationMode: 'universal',
  preserveAestheticDetails: false, generateOutlines: false,
  experimentalDetailPreservation: false, experimentalOutlineGenerator: false,
  experimentalFinalLookSimulator: false, experimentalAestheticPreservation: false,
  professionalMode: false, unifiedStandardProProfile: false, universalAutoDigitizerPro: false,
  travelAndMicroDetailCleanup: false, universalThreadColorSequenceOptimizer: false,
  universalCartoonCleanupAndOutlineMerge: false, threadStopCompactionV1: false, contourCleanupV1: false,
});

export const CONFIG_PROVENANCE = Object.freeze({
  'width_mm = 100 · height_mm = 80': 'Physical sheet size of the reference. The Editor default height (100) is the only default overridden.',
  'fabric_type = "Algodón"': 'Editor DEFAULT_CONFIG value and Project entity enum value equivalent to the Pure Cotton profile of the reference.',
  'every other config key': 'src/pages/Editor.jsx DEFAULT_CONFIG (lines 87-113), untouched — all experimental / professional / universal flags OFF.',
  'effectiveProfile + pipelineConfig': 'resolveEffectiveEmbroideryProfile(config, DEFAULT_PREPROCESS, machineSettings), exactly as Editor.startProcessing derives processingConfig (lines 545-550).',
  'machineSettings': 'Editor editorMachineSettings (lines 300-307): DEFAULT_MACHINE + maxStitchLength/maxJumpLength 12.1, hoopSize [100, 80], designOffset [0,0], trimThreshold 3.5.',
  'preprocessSettings': 'DEFAULT_PREPROCESS from src/components/editor/PreprocessingPanel.jsx — the Editor initial state.',
  'technique / density / pull_compensation / underlay / angle': 'NOT supplied. They are engine outputs; no Hatch value is injected.',
});

/** Builds the exact config + machine settings of the productive call. */
function buildBaselineCall() {
  const machineSettings = {
    ...DEFAULT_MACHINE, maxStitchLength: 12.1, maxJumpLength: 12.1,
    hoopSize: [DESIGN_MM.widthMm, DESIGN_MM.heightMm], designOffset: [0, 0], trimThreshold: 3.5,
  };
  const effectiveProfile = resolveEffectiveEmbroideryProfile(BASE_CONFIG, DEFAULT_PREPROCESS, machineSettings);
  const config = { ...BASE_CONFIG, ...(effectiveProfile?.pipelineConfig || {}), effectiveProfile };
  return { config, machineSettings, effectiveProfile };
}

/** Parity report — declarative, no execution. */
export function buildParityAudit({ config }) {
  return buildEditorParityAudit({
    signature: EDITOR_RUNPIPELINE_CONTRACT.signature,
    editorConfigKeys: Object.keys(config),
    configKeys: Object.keys(config),
    initialCtxKeys: ['darkStroke', 'inputAudit', 'effectiveProfile'],
    passesOnProgress: false,
    skipStages: [],
    darkStrokeBuilder: EDITOR_RUNPIPELINE_CONTRACT.darkStrokeBuilder,
    inputAuditBuilder: 'Replica of the Editor module-local buildInputSegmentationAudit, same six fields and same derivation',
    inputAuditFields: ['originalUploadUrl', 'imageUrl', 'processedImageUrl', 'maskedImageUrl', 'darkStrokeSourceUrl', 'isUsingMaskedForDarkStroke'],
    equivalences: [
      { item: 'inputAudit', justification: 'Editor.buildInputSegmentationAudit is module-local and not exported, so the harness reimplements the same six fields with the same derivation (verifiable side by side at src/pages/Editor.jsx lines 74-85).' },
      { item: 'pickMotorConfig', justification: 'Also module-local; the same key list (lines 119-130) is replicated to feed darkStroke, which is the only place the Editor uses it before runPipeline.' },
      { item: 'aiStrategy', justification: 'Absent by design: the Editor omits it when the user presses "Procesar" without AI, which is the flow being reproduced.' },
      { item: 'project / originalImageUrl', justification: 'No project record exists for the baseline; both are null, so the audit resolves darkStrokeSourceUrl to the same source image the engine receives.' },
    ],
  });
}

/** Fetches the exact source image and refuses to continue unless the hash matches. */
async function verifySourceImage(imageUrl, subtle) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`source image fetch failed: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = await subtle.digest('SHA-256', bytes);
  const sha256 = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const signature = [...bytes.slice(0, 8)].map(b => b.toString(16).padStart(2, '0')).join('');
  const view = new DataView(bytes.buffer);
  return {
    imageUrl, bytes: bytes.length, sha256, expectedSha256: SOURCE_IMAGE.sha256,
    hashMatches: sha256 === SOURCE_IMAGE.sha256,
    pngSignatureValid: signature === '89504e470d0a1a0a',
    widthPx: bytes.length >= 24 ? view.getUint32(16) : null,
    heightPx: bytes.length >= 24 ? view.getUint32(20) : null,
  };
}

/** Read-only readiness: parity + persistent state, with no engine execution. */
export function inspectCaptureReadiness({ stateStore = defaultStateStore() } = {}) {
  const { config } = buildBaselineCall();
  const parity = buildParityAudit({ config });
  const persistentState = stateStore.read();
  return {
    baselineId: BASELINE_ID,
    editorParityAudit: parity,
    persistentState,
    persistentStateKey: stateStore.key,
    blockingReason: stateStore.blockingReason(),
    pipelineInvocationCount,
    runAllowed: parity.runAllowed && persistentState.state === 'ready' && pipelineInvocationCount === 0,
    configProvenance: CONFIG_PROVENANCE,
  };
}

/** Recovers a previously archived capture without touching the engine. */
export async function restoreArchivedCapture({ archive = defaultArchive(), stateStore = defaultStateStore() } = {}) {
  const persistentState = stateStore.read();
  if (!persistentState.invocationId) return { persistentState, record: null };
  const record = await archive.get(persistentState.invocationId);
  return { persistentState, record: record || null };
}

const blocked = (reason, extra) => ({
  status: 'A_WIDTHS_BASELINE_CAPTURE_BLOCKED', baselineId: BASELINE_ID,
  pipelineInvocationCount, blockedReason: reason, ...extra,
});

/**
 * Performs the single allowed capture.
 * Every pre-run refusal returns BLOCKED and leaves the persistent state at `ready`.
 */
export async function captureAWidthsBaseline({
  imageUrl,
  stateStore = defaultStateStore(),
  archive = defaultArchive(),
  subtle = defaultSubtle(),
  capturedAt = null,
  invocationId = null,
  onStatus = null,
}) {
  const generatedAt = capturedAt || new Date().toISOString();
  const runId = invocationId || `${BASELINE_ID}-${generatedAt}`;
  const step = label => onStatus?.(label);

  // 1 — parity (no execution)
  const { config, machineSettings, effectiveProfile } = buildBaselineCall();
  const editorParityAudit = buildParityAudit({ config });
  if (!editorParityAudit.runAllowed) {
    return blocked(`Parity with the Editor is not demonstrated (parityStatus: ${editorParityAudit.parityStatus}). ${editorParityAudit.parityReason}`, { editorParityAudit, persistentState: stateStore.read() });
  }

  // 2 — persistent guard (does not consume the invocation)
  const guardReason = stateStore.blockingReason();
  if (guardReason || pipelineInvocationCount !== 0) {
    return blocked(guardReason || 'The in-memory guard already registered the single allowed execution.', { editorParityAudit, persistentState: stateStore.read() });
  }

  // 3 — image identity
  step('verificando la imagen');
  let source;
  try {
    source = await verifySourceImage(imageUrl, subtle);
  } catch (error) {
    return blocked(`The source image is not reachable: ${error.message}. The engine was NOT executed.`, { editorParityAudit, persistentState: stateStore.read() });
  }
  if (!source.hashMatches) {
    return blocked(`The fetched image SHA-256 (${source.sha256}) does not equal the verified reference hash (${SOURCE_IMAGE.sha256}). The engine was NOT executed and no substitute image is accepted.`, { editorParityAudit, source, persistentState: stateStore.read() });
  }

  // 4 — darkStroke, built with the SAME productive function as the Editor
  step('preparando darkStroke');
  let darkStroke = null;
  let darkStrokeError = null;
  try {
    darkStroke = await buildStrictDarkStrokeContextFromOriginalImage(imageUrl, pickMotorConfig(BASE_CONFIG));
  } catch (error) {
    darkStrokeError = error?.message || String(error);
    console.warn('[hatch-lab-baseline] darkStroke failed, same non-fatal path as the Editor:', darkStrokeError);
  }
  const inputAudit = buildInputSegmentationAudit({ originalImageUrl: null, config, project: null, imageUrl });
  const initialCtx = { darkStroke, inputAudit, effectiveProfile };

  // 5 — engine input audit
  const engineInputAudit = buildEngineInputAudit({ imageUrl, config, initialCtx });
  if (!engineInputAudit.clean) {
    return blocked('The engine input audit found Hatch reference material in the input; the engine was NOT executed.', { editorParityAudit, source, engineInputAudit, persistentState: stateStore.read() });
  }

  // 6 — consume the single invocation (persistent, then in memory)
  const invokedAt = new Date().toISOString();
  let persistentState;
  try {
    persistentState = stateStore.markInvoked({ invocationId: runId, invokedAt, sourceSha256: source.sha256 });
  } catch (error) {
    return blocked(error.message, { editorParityAudit, source, engineInputAudit, persistentState: stateStore.read() });
  }
  pipelineInvocationCount = 1;

  const baselineConfig = {
    config: BASE_CONFIG, derivedConfigKeys: Object.keys(config).sort(), machineSettings,
    preprocessSettings: DEFAULT_PREPROCESS, effectiveProfileId: effectiveProfile?.id ?? null,
    darkStrokeAvailable: !!darkStroke, darkStrokeError, configProvenance: CONFIG_PROVENANCE,
  };
  const commonSections = { baselineId: BASELINE_ID, invocationId: runId, capturedAt: generatedAt, source, engineInputAudit, editorParityAudit, baselineConfig, readiness: READINESS };

  // 7 — the single execution. No onProgress (the Editor passes none), no retry.
  step('ejecutando el motor una vez');
  const startedAt = Date.now();
  let ctx = null;
  try {
    ctx = await runPipeline(imageUrl, config, { initialCtx });
  } catch (error) {
    const failure = {
      ...commonSections,
      status: 'A_WIDTHS_BASELINE_CAPTURE_FAILED', runStatus: 'failed_before_context',
      pipelineInvocationCount, durationMs: Date.now() - startedAt,
      captureFailure: { error: error?.message || String(error), stack: error?.stack || null, failedAt: new Date().toISOString() },
      regionSourceResolution: null, coordinateDeclaration: null, stageLog: null, pipelineSnapshot: null,
      omittedFields: null, missingContextKeys: null, preservedRegionFieldReport: null,
      regionsSummary: null, regionsSummaryCsv: null, evaluationReport: null,
      note: 'runPipeline threw before returning a context. No retry, no synthetic evaluation.',
    };
    return finalize(failure, { archive, stateStore, subtle, runId, markAs: 'failed' });
  }

  // 8 — capture, resolve provenance, evaluate
  step('capturando el resultado');
  const { snapshot, omittedFields, missingContextKeys, preservedRegionFieldReport } = sanitizePipelineResult(ctx);
  const regionSourceResolution = resolveCanonicalRegionSource(snapshot);
  const coordinateDeclaration = resolveCoordinateDeclaration({
    widthPx: source.widthPx, heightPx: source.heightPx, regionSource: regionSourceResolution.selectedRegionSource,
  });
  const evaluationReport = evaluateAWidthsResult({
    result: snapshot, seedCases: A_WIDTHS_CASES, design: coordinateDeclaration.design,
    options: { regionSource: regionSourceResolution.selectedRegionSource, ...EVALUATOR_OPTIONS, generatedAt },
  });
  const regionsSummary = buildRegionsSummary(snapshot.regions, DESIGN_MM);
  const failedStages = (snapshot.stageLog || []).filter(s => !s.ok);

  const completed = {
    ...commonSections,
    status: 'A_WIDTHS_BASELINE_CAPTURE_COMPLETED',
    runStatus: failedStages.length ? 'completed_with_stage_errors' : 'completed',
    failedStages, pipelineInvocationCount, durationMs: Date.now() - startedAt,
    regionSourceResolution, coordinateDeclaration, stageLog: snapshot.stageLog || [],
    pipelineSnapshot: snapshot, omittedFields, missingContextKeys, preservedRegionFieldReport,
    regionsSummary, regionsSummaryCsv: regionsSummaryToCsv(regionsSummary),
    evaluatorVersionOk: evaluationReport.evaluatorVersion === REQUIRED_EVALUATOR_VERSION,
    evaluationReport, captureFailure: null,
  };
  return finalize(completed, { archive, stateStore, subtle, runId, markAs: 'completed' });
}

/**
 * Archives the untruncated JSON FIRST, then marks the persistent state.
 * If the archive write fails, the state becomes `failed` with the reason.
 */
async function finalize(result, { archive, stateStore, subtle, runId, markAs }) {
  const artifacts = await buildCaptureArtifacts(result, subtle);
  let archived = false;
  let archiveError = null;
  try {
    await archive.put({
      baselineId: BASELINE_ID, invocationId: runId, status: result.status,
      json: artifacts.full.json, sizeBytes: artifacts.full.sizeBytes, sha256: artifacts.resultSha256,
    });
    archived = true;
  } catch (error) {
    archiveError = error?.message || String(error);
  }

  const at = new Date().toISOString();
  const persistentState = (markAs === 'completed' && archived)
    ? stateStore.markCompleted({ completedAt: at, resultSha256: artifacts.resultSha256 })
    : stateStore.markFailed({
      failedAt: at, resultSha256: artifacts.resultSha256,
      reason: archived ? (result.captureFailure?.error || 'runPipeline failed') : `the full result could not be archived: ${archiveError}`,
    });

  return {
    ...result, resultSha256: artifacts.resultSha256,
    downloads: { full: artifacts.full, summary: artifacts.summary },
    archive: { stored: archived, error: archiveError, dbName: archive.dbName, storeName: archive.storeName, invocationId: runId },
    persistentState,
  };
}