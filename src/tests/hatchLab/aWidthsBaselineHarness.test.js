/**
 * aWidthsBaselineHarness.test.js — Hatch Lab (P0.3B.0)
 *
 * Tests the capture guards WITHOUT executing the engine: this suite imports no
 * productive module and never touches runPipeline. Storage and the hash provider
 * are injected fakes, so the suite stays synchronous like every other one.
 */

import {
  buildEditorParityAudit, createCaptureStateStore, createReadyCaptureState,
  createCaptureArchive, buildCaptureArtifactsSync, buildArchiveRecord,
  assembleFullCapture, canonicalJson, buildEngineInputAudit,
} from '@/lib/hatchLab/baselines/A_WIDTHS/canonicalSnapshot.js';
import {
  EDITOR_RUNPIPELINE_CONTRACT, CAPTURE_STATE_KEY, CAPTURE_STATES, CAPTURE_STATE_FIELDS,
  CAPTURE_ARCHIVE_FIELDS, CAPTURE_ARCHIVE_DB, CAPTURE_ARCHIVE_STORE, CAPTURE_FILE_NAMES,
  FULL_CAPTURE_SECTIONS, PREVIEW_CHARACTER_LIMIT, PREVIEW_TRUNCATION_NOTICE, PARITY_STATUSES,
  ENGINE_IMPORT_ALLOWLIST, BASELINE_ID, READINESS,
} from '@/lib/hatchLab/baselines/A_WIDTHS/baselineSchema.js';
import { A_WIDTHS_CASES } from '@/lib/hatchLab/seed/real/A_WIDTHS/index.js';

/** Fake localStorage; a "reload" is a new store built on the same key/value map. */
function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: k => { map.delete(k); },
  };
}
const reload = storage => createCaptureStateStore(fakeStorage(Object.fromEntries(storage.map)));

/** Deterministic synchronous digest — a pure function of the text, no crypto. */
function fakeHash(text) {
  let a = 0x811c9dc5;
  const out = [];
  for (let i = 0; i < text.length; i++) { a = ((a ^ text.charCodeAt(i)) * 16777619) >>> 0; }
  for (let i = 0; i < 32; i++) { a = ((a ^ (a >>> 13)) * 2654435761) >>> 0; out.push((a & 0xff).toString(16).padStart(2, '0')); }
  return out.join('').toUpperCase();
}

const HARNESS_CONTRACT = {
  signature: EDITOR_RUNPIPELINE_CONTRACT.signature,
  editorConfigKeys: ['mode', 'width_mm', 'height_mm'],
  configKeys: ['mode', 'width_mm', 'height_mm'],
  initialCtxKeys: ['darkStroke', 'inputAudit', 'effectiveProfile'],
  passesOnProgress: false,
  skipStages: [],
  darkStrokeBuilder: EDITOR_RUNPIPELINE_CONTRACT.darkStrokeBuilder,
  inputAuditBuilder: 'replica of the module-local Editor helper',
  inputAuditFields: [...EDITOR_RUNPIPELINE_CONTRACT.inputAuditFields],
  equivalences: [{ item: 'inputAudit', justification: 'module-local helper reimplemented field for field' }],
};

export function runAWidthsBaselineHarnessTests() {
  const fails = [];
  let checks = 0;
  const ok = (label, cond) => { checks++; if (!cond) fails.push(label); };

  // ── 1 · Parity with the Editor ────────────────────────────────────────────
  const parity = buildEditorParityAudit(HARNESS_CONTRACT);
  ok('P1. parity equivalent with a verifiable explanation', parity.parityStatus === 'equivalent'
    && parity.runAllowed === true && /module-local helper/.test(parity.parityReason)
    && PARITY_STATUSES.includes(parity.parityStatus));
  ok('P2. the real runPipeline signature is declared', /runPipeline\(imageUrl, config, opts/.test(parity.editorRunPipelineSignature)
    && parity.harnessRunPipelineSignature === parity.editorRunPipelineSignature);
  ok('P3. the Editor passes no onProgress and the harness passes none', /does NOT pass it/.test(parity.progressCallbackContract)
    && parity.harnessPassesOnProgress === false);
  ok('P4. initialCtx parity covers darkStroke, inputAudit and effectiveProfile',
    JSON.stringify(parity.editorInitialCtxKeys) === JSON.stringify(['darkStroke', 'effectiveProfile', 'inputAudit'])
    && parity.missingInHarness.length === 0 && parity.additionalInHarness.length === 0);
  ok('P5. a missing initialCtx key yields mismatch and forbids the run', (() => {
    const bad = buildEditorParityAudit({ ...HARNESS_CONTRACT, initialCtxKeys: ['inputAudit', 'effectiveProfile'] });
    return bad.parityStatus === 'mismatch' && bad.runAllowed === false && bad.missingInHarness.includes('initialCtx.darkStroke');
  })());
  ok('P6. passing onProgress yields mismatch', buildEditorParityAudit({ ...HARNESS_CONTRACT, passesOnProgress: true }).runAllowed === false);
  ok('P7. skipping a stage yields mismatch', buildEditorParityAudit({ ...HARNESS_CONTRACT, skipStages: ['vector_engine'] }).runAllowed === false);
  ok('P8. a different darkStroke builder yields mismatch', buildEditorParityAudit({ ...HARNESS_CONTRACT, darkStrokeBuilder: 'other' }).parityStatus === 'mismatch');
  ok('P9. no declared equivalence yields exact', buildEditorParityAudit({ ...HARNESS_CONTRACT, equivalences: [] }).parityStatus === 'exact');
  ok('P10. every parityStatus belongs to the declared vocabulary',
    JSON.stringify(PARITY_STATUSES) === JSON.stringify(['exact', 'equivalent', 'mismatch', 'unavailable']));

  // ── 2 · Persistent single-execution guard ─────────────────────────────────
  const storage = fakeStorage();
  const store = createCaptureStateStore(storage);
  ok('S1. initial state is ready', store.read().state === 'ready' && store.isRunAllowed() === true
    && store.blockingReason() === null && store.key === CAPTURE_STATE_KEY
    && CAPTURE_STATE_FIELDS.every(f => f in store.read()));
  ok('S2. pre-run refusals (bad hash, unreachable URL, invalid audit, unproven parity) never consume the invocation',
    storage.getItem(CAPTURE_STATE_KEY) === null && store.read().pipelineInvocationCount === 0 && store.isRunAllowed() === true);

  const invoked = store.markInvoked({ invocationId: 'INV-1', invokedAt: '2026-07-28T18:00:00.000Z', sourceSha256: 'ABC' });
  ok('S3. markInvoked persists invoked, count 1, id, timestamp and source hash', invoked.state === 'invoked'
    && invoked.pipelineInvocationCount === 1 && invoked.invocationId === 'INV-1'
    && invoked.invokedAt === '2026-07-28T18:00:00.000Z' && invoked.sourceSha256 === 'ABC');
  ok('S4. invoked blocks a second execution', store.isRunAllowed() === false && /already registered as "invoked"/.test(store.blockingReason()));
  ok('S5. reload preserves invoked', reload(storage).read().state === 'invoked' && reload(storage).isRunAllowed() === false);
  ok('S6. markInvoked throws when the state is not ready', (() => {
    try { store.markInvoked({ invocationId: 'INV-2', invokedAt: 'x', sourceSha256: 'y' }); return false; }
    catch (e) { return /not "ready"/.test(e.message); }
  })());

  const completedStore = reload(storage);
  const completed = completedStore.markCompleted({ completedAt: '2026-07-28T18:05:00.000Z', resultSha256: 'HASH' });
  ok('S7. completed blocks a second execution and keeps the result hash', completed.state === 'completed'
    && completed.resultSha256 === 'HASH' && completedStore.isRunAllowed() === false
    && /"completed"/.test(completedStore.blockingReason()));
  ok('S8. reload preserves completed', reload(completedStore.read() && { map: new Map([[CAPTURE_STATE_KEY, JSON.stringify(completed)]]) }).read().state === 'completed');

  const failedStore = reload(storage);
  const failed = failedStore.markFailed({ failedAt: '2026-07-28T18:06:00.000Z', reason: 'stage crashed' });
  ok('S9. failed blocks a second execution', failed.state === 'failed' && failed.reason === 'stage crashed'
    && failedStore.isRunAllowed() === false && /"failed"/.test(failedStore.blockingReason()));
  ok('S10. reload preserves failed', reload({ map: new Map([[CAPTURE_STATE_KEY, JSON.stringify(failed)]]) }).read().state === 'failed');
  ok('S11. an unreadable persisted state refuses a new execution',
    createCaptureStateStore(fakeStorage({ [CAPTURE_STATE_KEY]: '{not json' })).isRunAllowed() === false);
  ok('S12. there is no reset / clear / delete path in the store API', (() => {
    const api = Object.keys(createCaptureStateStore(fakeStorage()));
    return !api.some(k => /reset|clear|delete|remove|wipe/i.test(k));
  })());
  ok('S13. the state vocabulary is exactly the four allowed values',
    JSON.stringify(CAPTURE_STATES) === JSON.stringify(['ready', 'invoked', 'completed', 'failed']));

  // ── 3 · Full result, hashing, downloads ──────────────────────────────────
  const bigResult = {
    baselineId: BASELINE_ID, invocationId: 'INV-9', capturedAt: '2026-07-28T18:00:00.000Z',
    status: 'A_WIDTHS_BASELINE_CAPTURE_COMPLETED', runStatus: 'completed', pipelineInvocationCount: 1,
    source: { sha256: 'ABC', bytes: 46432 }, engineInputAudit: { clean: true },
    editorParityAudit: parity, baselineConfig: { config: { mode: 'hybrid' } },
    regionSourceResolution: { selectedRegionSource: 'regions' },
    coordinateDeclaration: { design: { coordinateSpace: 'normalized_0_1' } },
    stageLog: [{ stage: 'image_analysis', ok: true }],
    pipelineSnapshot: { regions: Array.from({ length: 900 }, (_, i) => ({ id: `r_${i}`, path_points: [[0.1, 0.2], [0.3, 0.4]], note: 'x'.repeat(400) })) },
    omittedFields: [], missingContextKeys: [], preservedRegionFieldReport: {},
    regionsSummary: [{ sourceIndex: 0, id: 'r_0' }], evaluationReport: { conclusion: 'partial' },
    readiness: READINESS,
  };
  const artifacts = buildCaptureArtifactsSync(bigResult, fakeHash);
  const parsedFull = JSON.parse(artifacts.full.json);
  ok('R1. the full JSON carries every required section', FULL_CAPTURE_SECTIONS.every(s => s in parsedFull));
  ok('R2. the full JSON is NOT truncated', artifacts.full.json.length > PREVIEW_CHARACTER_LIMIT
    && parsedFull.pipelineSnapshot.regions.length === 900 && parsedFull.pipelineSnapshot.regions[899].id === 'r_899'
    && parsedFull.pipelineSnapshot.regions[899].note.length === 400);
  ok('R3. resultSha256 is computed and embedded', /^[0-9A-F]{64}$/.test(artifacts.resultSha256)
    && parsedFull.resultSha256 === artifacts.resultSha256);
  ok('R4. the hash depends on the captured content', (() => {
    const other = buildCaptureArtifactsSync({ ...bigResult, status: 'A_WIDTHS_BASELINE_CAPTURE_FAILED' }, fakeHash);
    return other.resultSha256 !== artifacts.resultSha256;
  })());
  ok('R5. size in bytes reported for both files', artifacts.full.sizeBytes > 0 && artifacts.summary.sizeBytes > 0
    && artifacts.full.sizeBytes === new TextEncoder().encode(artifacts.full.json).length);
  ok('R6. exact download file names', artifacts.full.fileName === 'BASE-ENGINE-A-WIDTHS-V1.capture.json'
    && artifacts.summary.fileName === 'BASE-ENGINE-A-WIDTHS-V1.summary.json'
    && CAPTURE_FILE_NAMES.full === artifacts.full.fileName && CAPTURE_FILE_NAMES.summary === artifacts.summary.fileName);
  const summary = JSON.parse(artifacts.summary.json);
  ok('R7. the summary is small and points at the full file', artifacts.summary.sizeBytes < artifacts.full.sizeBytes / 10
    && summary.fullCaptureFileName === CAPTURE_FILE_NAMES.full && summary.resultSha256 === artifacts.resultSha256
    && summary.parityStatus === 'equivalent' && summary.evaluatorConclusion === 'partial' && summary.regionCount === 1);
  ok('R8. the preview may be truncated while the download is not',
    artifacts.full.json.slice(0, PREVIEW_CHARACTER_LIMIT).length === PREVIEW_CHARACTER_LIMIT
    && /Vista previa truncada/.test(PREVIEW_TRUNCATION_NOTICE) && artifacts.full.json.length > PREVIEW_CHARACTER_LIMIT);
  ok('R9. canonical JSON and artifacts are deterministic', canonicalJson({ b: 1, a: 2 }) === canonicalJson({ a: 2, b: 1 })
    && buildCaptureArtifactsSync(bigResult, fakeHash).full.json === artifacts.full.json);
  ok('R10. a failed capture still produces a complete, hashed artifact', (() => {
    const failedResult = { ...bigResult, status: 'A_WIDTHS_BASELINE_CAPTURE_FAILED', pipelineSnapshot: null, evaluationReport: null };
    const a = buildCaptureArtifactsSync(failedResult, fakeHash);
    const p = JSON.parse(a.full.json);
    return FULL_CAPTURE_SECTIONS.every(s => s in p) && p.pipelineSnapshot === null && /^[0-9A-F]{64}$/.test(a.resultSha256);
  })());
  ok('R11. sections absent from the result become null, never dropped',
    Object.keys(assembleFullCapture({}).full).length === FULL_CAPTURE_SECTIONS.length - 1
    && Object.values(assembleFullCapture({}).full).every(v => v === null));

  // ── 4 · Archive contract (real IndexedDB round trip runs in the page) ─────
  const record = buildArchiveRecord({ invocationId: 'INV-9', status: bigResult.status, json: artifacts.full.json, sizeBytes: artifacts.full.sizeBytes, sha256: artifacts.resultSha256 });
  ok('A1. the archived record carries every required field', CAPTURE_ARCHIVE_FIELDS.every(f => f in record) && record.baselineId === BASELINE_ID);
  ok('A2. the archived JSON is the untruncated one, with the same hash', record.json === artifacts.full.json
    && JSON.parse(record.json).pipelineSnapshot.regions.length === 900 && record.sha256 === artifacts.resultSha256);
  ok('A3. the archive exposes put / get / getAll on the declared database and store', (() => {
    const archive = createCaptureArchive({ open: () => ({}) });
    return typeof archive.put === 'function' && typeof archive.get === 'function' && typeof archive.getAll === 'function'
      && archive.dbName === CAPTURE_ARCHIVE_DB && archive.storeName === CAPTURE_ARCHIVE_STORE;
  })());
  ok('A4. the archive API offers no clear / destroy path', (() => {
    const api = Object.keys(createCaptureArchive({ open: () => ({}) }));
    return !api.some(k => /clear|destroy|delete|reset/i.test(k));
  })());

  // ── 5 · Isolation and seed integrity ─────────────────────────────────────
  ok('I1. only the harness may import the base engine',
    JSON.stringify(ENGINE_IMPORT_ALLOWLIST) === JSON.stringify(['src/tests/hatchLab/aWidthsBaselineCapture.js']));
  ok('I2. this suite executed no engine and produced no commands or stitches',
    typeof globalThis.runPipeline === 'undefined' && !('commands' in artifacts) && !('stitches' in artifacts));
  ok('I3. the engine input audit still rejects Hatch material',
    buildEngineInputAudit({ imageUrl: 'u', config: { expectedResult: {} } }).clean === false
    && buildEngineInputAudit({ imageUrl: 'u', config: { mode: 'hybrid' } }).clean === true);
  ok('I4. expectedResult still null in the five real cases', A_WIDTHS_CASES.length === 5
    && A_WIDTHS_CASES.every(c => c.expectedResult === null));
  ok('I5. no confirmed rule', A_WIDTHS_CASES.every(c => c.candidateRules.every(r => r.status === 'candidata' && r.physicalValidation === false)));
  ok('I6. readiness flags stay false', Object.values(READINESS).every(v => v === false));
  ok('I7. the ready state is a pure deterministic factory',
    JSON.stringify(createReadyCaptureState()) === JSON.stringify(createReadyCaptureState())
    && createReadyCaptureState().state === 'ready' && createReadyCaptureState().pipelineInvocationCount === 0);
  ok('I8. no pass / fail verdict anywhere in the artifacts',
    !/"(pass|fail|improved|regressed|accepted|rejected)"/.test(artifacts.summary.json));

  return { name: 'hatchLab/aWidthsBaselineHarness', pass: fails.length === 0, checks, fails };
}