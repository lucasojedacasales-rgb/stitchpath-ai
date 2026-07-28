/**
 * aWidthsBaselineCapture.js — Hatch Lab capture harness (P0.3B)
 *
 * Runs the CURRENT base engine EXACTLY ONCE over the real A_WIDTHS sheet and
 * publishes a reproducible snapshot plus the A_WIDTHS evaluation.
 *
 * ── Isolation contract ──────────────────────────────────────────────────────
 * This harness is the single controlled exception allowed in P0.3B: it lives in
 * src/tests/hatchLab/** and may import the base engine in ONE direction:
 *
 *     lab harness → base engine
 *
 * The base engine never imports Hatch Lab, and the pure evaluator
 * (src/lib/hatchLab/evaluators/**) still imports no productive module.
 *
 * It is not reachable from the router or from any productive UI, it never
 * exports files, never saves a project, never runs buildFinalCommands, Engine V2
 * or referenceLearning, and never applies a Hatch rule.
 */

import { runPipeline } from '@/lib/pipeline/runner';
import { resolveEffectiveEmbroideryProfile } from '@/lib/embroideryEngineProfiles';
import { evaluateAWidthsResult } from '@/lib/hatchLab/evaluators/A_WIDTHS/index.js';
import { A_WIDTHS_CASES } from '@/lib/hatchLab/seed/real/A_WIDTHS/index.js';
import {
  BASELINE_ID, SOURCE_IMAGE, DESIGN_MM, EVALUATOR_OPTIONS, REQUIRED_EVALUATOR_VERSION, READINESS,
} from '@/lib/hatchLab/baselines/A_WIDTHS/baselineSchema.js';
import { sanitizePipelineResult } from '@/lib/hatchLab/baselines/A_WIDTHS/sanitizePipelineResult.js';
import {
  buildRegionsSummary, regionsSummaryToCsv, resolveCanonicalRegionSource,
  resolveCoordinateDeclaration, buildEngineInputAudit, canonicalJson,
} from '@/lib/hatchLab/baselines/A_WIDTHS/canonicalSnapshot.js';

export const LAB_RESULT_KEY = '__HATCH_LAB_A_WIDTHS_BASELINE_V1__';

/** Single-shot guard. A second invocation throws; there are no automatic retries. */
let pipelineInvocationCount = 0;

/**
 * Baseline config — the current productive defaults, with ONLY the sheet size
 * and the fabric profile aligned with the reference.
 *
 * Provenance of every field is declared in `configProvenance`.
 */
function buildBaselineConfig() {
  const base = {
    // src/pages/Editor.jsx DEFAULT_CONFIG (lines 87-113), verbatim defaults
    fabric_type: 'Algodón', width_mm: DESIGN_MM.widthMm, height_mm: DESIGN_MM.heightMm,
    color_count: 6, mode: 'hybrid', remove_bg: false, tension_comp: 0.5,
    fill_angle: null, tatami_density: 0.4, vector_engine: 'hybrid', useVectorFusion: false,
    contourSafeMode: true, ce01SafeFillMode: true, ce01ProductionMode: true,
    validationMode: 'universal',
    preserveAestheticDetails: false, generateOutlines: false,
    experimentalDetailPreservation: false, experimentalOutlineGenerator: false,
    experimentalFinalLookSimulator: false, experimentalAestheticPreservation: false,
    professionalMode: false, unifiedStandardProProfile: false, universalAutoDigitizerPro: false,
    travelAndMicroDetailCleanup: false, universalThreadColorSequenceOptimizer: false,
    universalCartoonCleanupAndOutlineMerge: false, threadStopCompactionV1: false,
    contourCleanupV1: false,
  };

  // Same derivation the Editor performs before runPipeline (startProcessing, lines 545-551).
  const machineSettings = {
    maxStitchLength: 12.1, maxJumpLength: 12.1,
    hoopSize: [DESIGN_MM.widthMm, DESIGN_MM.heightMm], designOffset: [0, 0], trimThreshold: 3.5,
  };
  const effectiveProfile = resolveEffectiveEmbroideryProfile(base, null, machineSettings);
  const config = { ...base, ...(effectiveProfile?.pipelineConfig || {}), effectiveProfile };

  return { base, config, machineSettings, effectiveProfile };
}

export const CONFIG_PROVENANCE = Object.freeze({
  'fabric_type = "Algodón"': 'src/pages/Editor.jsx DEFAULT_CONFIG.fabric_type + base44/entities/Project.jsonc fabric_type enum. "Algodón" is the exact supported value equivalent to the Pure Cotton profile of the reference.',
  'width_mm = 100': 'Physical sheet size of the reference (100 × 80 mm). Editor default is 100.',
  'height_mm = 80': 'Physical sheet size of the reference. Editor default (100) is overridden because the real sheet is 80 mm high.',
  'color_count = 6': 'src/pages/Editor.jsx DEFAULT_CONFIG.color_count — untouched productive default.',
  'mode = "hybrid"': 'src/pages/Editor.jsx DEFAULT_CONFIG.mode — untouched productive default (src/lib/digitizeModes.js).',
  'contourSafeMode / ce01SafeFillMode / ce01ProductionMode / validationMode': 'src/pages/Editor.jsx DEFAULT_CONFIG — untouched productive defaults.',
  'experimental* / professionalMode / universal* / *V1 flags = false': 'src/pages/Editor.jsx DEFAULT_CONFIG rollback safety flags — all experimental modules OFF.',
  'effectiveProfile + pipelineConfig': 'src/lib/embroideryEngineProfiles.js resolveEffectiveEmbroideryProfile(config, preprocessSettings, machineSettings), exactly as src/pages/Editor.jsx startProcessing derives processingConfig.',
  'machineSettings': 'src/pages/Editor.jsx editorMachineSettings (lines 300-307), with hoopSize set to the real 100 × 80 mm sheet.',
  'technique / density / pull_compensation / underlay / angle': 'NOT supplied. They are engine outputs; no Hatch value is injected.',
});

/** Fetches the exact source image and refuses to continue unless the hash matches. */
async function verifySourceImage(imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`source image fetch failed: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const signature = [...bytes.slice(0, 8)].map(b => b.toString(16).padStart(2, '0')).join('');
  return {
    imageUrl, bytes: bytes.length, sha256,
    expectedSha256: SOURCE_IMAGE.sha256,
    hashMatches: sha256 === SOURCE_IMAGE.sha256,
    pngSignatureValid: signature === '89504e470d0a1a0a',
    widthPx: bytes.length >= 24 ? new DataView(bytes.buffer).getUint32(16) : null,
    heightPx: bytes.length >= 24 ? new DataView(bytes.buffer).getUint32(20) : null,
  };
}

/**
 * Executes the baseline capture. Call at most once per page load.
 * @param {{ imageUrl: string, onStage?: Function, capturedAt?: string }} params
 */
export async function captureAWidthsBaseline({ imageUrl, onStage = null, capturedAt = null }) {
  const generatedAt = capturedAt || new Date().toISOString();
  const source = await verifySourceImage(imageUrl);
  if (!source.hashMatches) {
    return {
      status: 'A_WIDTHS_BASELINE_CAPTURE_BLOCKED', baselineId: BASELINE_ID, pipelineInvocationCount,
      blockedReason: `The fetched image SHA-256 (${source.sha256}) does not equal the verified reference hash (${SOURCE_IMAGE.sha256}). The engine was NOT executed and no substitute image is accepted.`,
      source,
    };
  }

  const { base, config, machineSettings, effectiveProfile } = buildBaselineConfig();
  const engineInputAudit = buildEngineInputAudit({ imageUrl, config, initialCtx: null });
  if (!engineInputAudit.clean) {
    return {
      status: 'A_WIDTHS_BASELINE_CAPTURE_BLOCKED', baselineId: BASELINE_ID, pipelineInvocationCount,
      blockedReason: 'The engine input audit found Hatch reference material in the input; the engine was NOT executed.',
      engineInputAudit, source,
    };
  }

  if (pipelineInvocationCount !== 0) throw new Error('pipelineInvocationCount guard: runPipeline may be invoked exactly once per capture; a second invocation is refused and no retry is performed.');
  pipelineInvocationCount = 1;

  let ctx = null;
  let runStatus = 'not_run';
  let captureFailure = null;
  const startedAt = Date.now();
  try {
    ctx = await runPipeline(imageUrl, config, { onProgress: (pct, stageId) => onStage?.(pct, stageId) });
    const failed = (ctx?.stageLog || []).filter(s => !s.ok);
    runStatus = failed.length ? 'completed_with_stage_errors' : 'completed';
  } catch (error) {
    runStatus = 'failed_before_context';
    captureFailure = {
      error: error?.message || String(error), stack: error?.stack || null,
      config: base, imageSha256: source.sha256, pipelineInvocationCount,
      failedAt: new Date().toISOString(),
    };
    return {
      status: 'A_WIDTHS_BASELINE_CAPTURE_FAILED', baselineId: BASELINE_ID, pipelineInvocationCount,
      runStatus, captureFailure, source, engineInputAudit,
      baselineConfig: { config: base, machineSettings, configProvenance: CONFIG_PROVENANCE },
      note: 'runPipeline threw before returning a context. No retry, no synthetic evaluation.',
    };
  }

  const { snapshot, omittedFields, missingContextKeys, preservedRegionFieldReport } = sanitizePipelineResult(ctx);
  const regionSourceResolution = resolveCanonicalRegionSource(snapshot);
  const coordinateDeclaration = resolveCoordinateDeclaration({
    widthPx: source.widthPx, heightPx: source.heightPx, regionSource: regionSourceResolution.selectedRegionSource,
  });

  const evaluationReport = evaluateAWidthsResult({
    result: snapshot,
    seedCases: A_WIDTHS_CASES,
    design: coordinateDeclaration.design,
    options: {
      regionSource: regionSourceResolution.selectedRegionSource,
      ...EVALUATOR_OPTIONS,
      generatedAt,
    },
  });

  const regionsSummary = buildRegionsSummary(snapshot.regions, DESIGN_MM);

  return {
    status: 'A_WIDTHS_BASELINE_CAPTURE_COMPLETED',
    baselineId: BASELINE_ID,
    capturedAt: generatedAt,
    durationMs: Date.now() - startedAt,
    pipelineInvocationCount,
    runStatus,
    source,
    engineInputAudit,
    baselineConfig: { config: base, derivedConfigKeys: Object.keys(config).sort(), machineSettings, effectiveProfileId: effectiveProfile?.id ?? null, configProvenance: CONFIG_PROVENANCE },
    regionSourceResolution,
    coordinateDeclaration,
    stageLog: snapshot.stageLog || [],
    pipelineSnapshot: snapshot,
    omittedFields,
    missingContextKeys,
    preservedRegionFieldReport,
    regionsSummary,
    regionsSummaryCsv: regionsSummaryToCsv(regionsSummary),
    evaluatorVersionOk: evaluationReport.evaluatorVersion === REQUIRED_EVALUATOR_VERSION,
    evaluationReport,
    readiness: READINESS,
    canonicalJsonPreview: canonicalJson({ baselineId: BASELINE_ID, capturedAt: generatedAt }),
    captureFailure,
  };
}

export function getPipelineInvocationCount() {
  return pipelineInvocationCount;
}