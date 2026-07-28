/**
 * canonicalSnapshot.js — Hatch Lab / baselines / A_WIDTHS (P0.3B)
 *
 * Pure helpers that turn a sanitized pipeline snapshot into the reproducible
 * baseline artefacts: canonical JSON text, the region summary (rows + CSV), the
 * canonical region-source resolution and the engine input audit.
 *
 * No engine imports. No rounding. Nothing invented: absent data stays null.
 */

import {
  REGION_SUMMARY_COLUMNS, FORBIDDEN_INPUT_KEYS, SEED_CASE_IDS, DESIGN_MM,
  BASELINE_ID, CAPTURE_STATE_KEY, CAPTURE_STATES, CAPTURE_STATES_BLOCKING_RUN,
  CAPTURE_ARCHIVE_DB, CAPTURE_ARCHIVE_STORE, CAPTURE_FILE_NAMES,
  FULL_CAPTURE_SECTIONS, EDITOR_RUNPIPELINE_CONTRACT, PARITY_STATUSES_ALLOWING_RUN,
} from './baselineSchema.js';

const isPlainObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
const get = (obj, key) => (isPlainObject(obj) && obj[key] !== undefined ? obj[key] : null);

/** Stable, key-sorted JSON so identical data always produces identical bytes. */
export function canonicalJson(value, indent = 2) {
  const sort = v => {
    if (Array.isArray(v)) return v.map(sort);
    if (isPlainObject(v)) {
      return Object.keys(v).sort().reduce((out, k) => { out[k] = sort(v[k]); return out; }, {});
    }
    return v;
  };
  return JSON.stringify(sort(value), null, indent);
}

/**
 * Resolves which collection of the real result is the canonical final one.
 * Decided from the captured data plus the declared stage contract — never assumed.
 */
export function resolveCanonicalRegionSource(snapshot) {
  const counts = {
    regions: Array.isArray(snapshot?.regions) ? snapshot.regions.length : null,
    optimizedRegions: Array.isArray(snapshot?.optimizedRegions) ? snapshot.optimizedRegions.length : null,
    optimizedSequence: Array.isArray(snapshot?.optimized?.optimizedSequence) ? snapshot.optimized.optimizedSequence.length : null,
    objects: Array.isArray(snapshot?.objects) ? snapshot.objects.length : null,
  };
  const stitchOptimizerRan = (snapshot?.stageLog || []).some(s => s?.stage === 'stitch_optimizer' && s?.ok);
  const declared = Object.entries(counts).filter(([, n]) => n !== null).map(([k]) => k);

  // Contract (src/lib/pipeline/stages/stitchOptimizerStage.js): the optimizer writes
  // the final production order back into ctx.regions, so ctx.regions is canonical.
  const canonical = counts.regions !== null ? 'regions' : (declared[0] || null);

  return {
    selectedRegionSource: canonical,
    declaredCollections: declared,
    countsByCollection: counts,
    stitchOptimizerRan,
    justification: canonical === 'regions'
      ? 'stitch_optimizer writes the final production order back into ctx.regions; optimized.optimizedSequence is a report of the same objects, so ctx.regions is the canonical final collection.'
      : 'ctx.regions is absent in this run; the canonical collection is documented explicitly and collections are never mixed.',
  };
}

/**
 * Declares the coordinate space from the real stage contract, never from value ranges.
 */
export function resolveCoordinateDeclaration({ widthPx, heightPx, regionSource }) {
  return {
    design: {
      widthMm: DESIGN_MM.widthMm,
      heightMm: DESIGN_MM.heightMm,
      widthPx,
      heightPx,
      coordinateSpace: 'normalized_0_1',
    },
    justification: 'normalizeRegionForPipeline (src/lib/pipeline/regionNormalize.js) normalizes region.path_points to the [0,1]² space before region_builder, and no later stage converts them back to mm or pixels. The declaration comes from that stage contract, not from observing values between 0 and 1.',
    regionSource,
  };
}

function boundingBox(points) {
  if (!Array.isArray(points) || points.length === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    const x = Array.isArray(p) ? p[0] : p?.x;
    const y = Array.isArray(p) ? p[1] : p?.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return Number.isFinite(minX) ? { minX, maxX, minY, maxY } : null;
}

/** One row per region. Absent values are null; nothing is invented or rounded. */
export function buildRegionsSummary(regions, { widthMm = DESIGN_MM.widthMm, heightMm = DESIGN_MM.heightMm } = {}) {
  const list = Array.isArray(regions) ? regions : [];
  return list.map((region, sourceIndex) => {
    const bbox = boundingBox(region?.path_points);
    const underlay = get(region, 'recommended_underlay');
    return {
      sourceIndex,
      id: get(region, 'id'),
      type: get(region, 'type'),
      region_class: get(region, 'region_class'),
      parentRegionId: get(region, 'parentRegionId'),
      color: get(region, 'color') ?? get(region, 'hex'),
      boundingWidthMm: bbox ? (bbox.maxX - bbox.minX) * widthMm : null,
      boundingHeightMm: bbox ? (bbox.maxY - bbox.minY) * heightMm : null,
      centerXMm: bbox ? ((bbox.minX + bbox.maxX) / 2) * widthMm : null,
      centerYMm: bbox ? ((bbox.minY + bbox.maxY) / 2) * heightMm : null,
      areaMm2: get(region, 'area_mm2'),
      stitch_type: get(region, 'stitch_type'),
      density: get(region, 'density'),
      pull_compensation: get(region, 'pull_compensation'),
      angle: get(region, 'angle'),
      underlay: get(region, 'underlay'),
      'recommended_underlay.enabled': isPlainObject(underlay) ? get(underlay, 'enabled') : null,
      'recommended_underlay.type': isPlainObject(underlay) ? get(underlay, 'type') : null,
      'recommended_underlay.density_mm': isPlainObject(underlay) ? get(underlay, 'density_mm') : null,
      priority: get(region, 'priority'),
      layer_order: get(region, 'layer_order'),
      travelOrder: get(region, 'travelOrder'),
      pathPointCount: Array.isArray(region?.path_points) ? region.path_points.length : null,
      contourPointCount: Array.isArray(region?.contour_points) ? region.contour_points.length : null,
    };
  });
}

export function regionsSummaryToCsv(rows) {
  const cell = v => {
    if (v === null || v === undefined) return '';
    const text = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = REGION_SUMMARY_COLUMNS.join(',');
  const body = (rows || []).map(row => REGION_SUMMARY_COLUMNS.map(c => cell(row[c])).join(','));
  return [header, ...body].join('\n');
}

/**
 * Proves the engine input carries no Hatch reference material.
 * Scans keys AND string values of the exact object handed to the pipeline.
 */
export function buildEngineInputAudit({ imageUrl, config, initialCtx = null }) {
  const input = { imageUrl, config, initialCtx };
  const text = JSON.stringify(input, (key, value) => (typeof value === 'function' ? '[function]' : value)) || '';

  const foundKeys = [];
  const scan = (value, path) => {
    if (Array.isArray(value)) { value.forEach((v, i) => scan(v, `${path}[${i}]`)); return; }
    if (!isPlainObject(value)) return;
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_INPUT_KEYS.includes(key)) foundKeys.push(`${path}.${key}`);
      scan(value[key], `${path}.${key}`);
    }
  };
  scan(input, 'engineInput');

  const foundCaseIds = SEED_CASE_IDS.filter(id => text.includes(id));

  return {
    scannedKeys: FORBIDDEN_INPUT_KEYS,
    scannedCaseIds: SEED_CASE_IDS,
    forbiddenKeysFound: foundKeys,
    seedCaseIdsFound: foundCaseIds,
    containsExpectedResult: foundKeys.some(k => k.endsWith('.expectedResult')),
    containsCandidateRules: foundKeys.some(k => k.endsWith('.candidateRules')),
    containsHatchTechnicalValues: foundKeys.length > 0,
    clean: foundKeys.length === 0 && foundCaseIds.length === 0,
    configKeys: isPlainObject(config) ? Object.keys(config).sort() : [],
    initialCtxKeys: isPlainObject(initialCtx) ? Object.keys(initialCtx).sort() : [],
    note: 'Technique, density, pull compensation, underlay and angle are OUTPUTS observed from the engine. None of them is supplied as input, and no Hatch value fills any gap.',
  };
}

// ─── Editor parity audit (P0.3B.0) ───────────────────────────────────────────

/**
 * Compares the productive Editor call with the harness call. Purely declarative:
 * it never runs the engine and never guesses — anything it cannot verify is
 * reported as `unavailable`.
 *
 * @param {Object} harness - { signature, configKeys, initialCtxKeys, passesOnProgress,
 *                             skipStages, processingUrl, darkStrokeBuilder,
 *                             inputAuditFields, inputAuditBuilder, equivalences }
 */
export function buildEditorParityAudit(harness = {}) {
  const editor = EDITOR_RUNPIPELINE_CONTRACT;
  const editorInitial = [...editor.initialCtxKeys].sort();
  const harnessInitial = [...(harness.initialCtxKeys || [])].sort();
  const editorConfigKeys = [...(harness.editorConfigKeys || [])].sort();
  const harnessConfigKeys = [...(harness.configKeys || [])].sort();

  const missingInHarness = [
    ...editorInitial.filter(k => !harnessInitial.includes(k)).map(k => `initialCtx.${k}`),
    ...editorConfigKeys.filter(k => !harnessConfigKeys.includes(k)).map(k => `config.${k}`),
  ];
  const additionalInHarness = [
    ...harnessInitial.filter(k => !editorInitial.includes(k) && !editor.optionalInitialCtxKeys.includes(k)).map(k => `initialCtx.${k}`),
    ...harnessConfigKeys.filter(k => !editorConfigKeys.includes(k)).map(k => `config.${k}`),
  ];

  const blockers = [];
  if (harness.signature !== editor.signature) blockers.push('The harness does not declare the real runPipeline signature.');
  if (harness.passesOnProgress === true) blockers.push('The Editor passes no onProgress; the harness must not pass one either.');
  if ((harness.skipStages || []).length !== 0) blockers.push('The Editor skips no stage; the harness must skip none.');
  if (missingInHarness.length) blockers.push(`Missing in the harness: ${missingInHarness.join(', ')}.`);
  if (additionalInHarness.length) blockers.push(`Present only in the harness: ${additionalInHarness.join(', ')}.`);
  if (harness.darkStrokeBuilder !== editor.darkStrokeBuilder) blockers.push('darkStroke is not built with the same productive function.');
  const auditFieldsEqual = JSON.stringify([...(harness.inputAuditFields || [])].sort()) === JSON.stringify([...editor.inputAuditFields].sort());
  if (!auditFieldsEqual) blockers.push('inputAudit does not carry the same fields as the Editor helper.');

  const equivalences = harness.equivalences || [];
  let parityStatus = 'mismatch';
  let parityReason = blockers.join(' ');
  if (blockers.length === 0) {
    if (equivalences.length === 0) {
      parityStatus = 'exact';
      parityReason = 'Same signature, same config shape, same initialCtx keys, same darkStroke builder, no onProgress and no skipped stage.';
    } else {
      parityStatus = 'equivalent';
      parityReason = `Structurally identical call, with verifiable equivalences: ${equivalences.map(e => `${e.item}: ${e.justification}`).join(' | ')}`;
    }
  }

  return {
    editorRunPipelineSignature: editor.signature,
    harnessRunPipelineSignature: harness.signature ?? null,
    editorConfigKeys,
    harnessConfigKeys,
    editorInitialCtxKeys: editorInitial,
    harnessInitialCtxKeys: harnessInitial,
    processingUrlPolicy: editor.processingUrlPolicy,
    progressCallbackContract: editor.progressCallbackContract,
    harnessPassesOnProgress: harness.passesOnProgress === true,
    skipStages: { editor: [...editor.skipStages], harness: [...(harness.skipStages || [])] },
    darkStrokeBuilder: { editor: editor.darkStrokeBuilder, harness: harness.darkStrokeBuilder ?? null },
    inputAuditBuilder: { editor: editor.inputAuditBuilder, harness: harness.inputAuditBuilder ?? null },
    equivalences,
    missingInHarness,
    additionalInHarness,
    parityStatus,
    parityReason,
    runAllowed: PARITY_STATUSES_ALLOWING_RUN.includes(parityStatus),
  };
}

// ─── Persistent single-execution guard (P0.3B.0) ──────────────────────────────

export function createReadyCaptureState() {
  return {
    baselineId: BASELINE_ID, state: 'ready', invocationId: null, pipelineInvocationCount: 0,
    invokedAt: null, completedAt: null, failedAt: null,
    sourceSha256: null, resultSha256: null, reason: null,
  };
}

/**
 * Persistent state machine. `storage` is any localStorage-like object, so the
 * tests can drive it without a browser. There is NO reset path: a new run would
 * require a different baselineId in a separate task.
 */
export function createCaptureStateStore(storage) {
  const read = () => {
    let raw = null;
    try { raw = storage.getItem(CAPTURE_STATE_KEY); } catch { raw = null; }
    if (!raw) return createReadyCaptureState();
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
    if (!parsed || !CAPTURE_STATES.includes(parsed.state)) {
      return { ...createReadyCaptureState(), state: 'failed', reason: 'The persisted capture state is unreadable; a new execution is refused.' };
    }
    return { ...createReadyCaptureState(), ...parsed };
  };
  const write = next => { storage.setItem(CAPTURE_STATE_KEY, JSON.stringify(next)); return next; };

  return {
    key: CAPTURE_STATE_KEY,
    read,
    isRunAllowed: () => read().state === 'ready',
    blockingReason: () => {
      const s = read();
      return CAPTURE_STATES_BLOCKING_RUN.includes(s.state)
        ? `The single allowed execution is already registered as "${s.state}" (invocación ${s.invocationId || '—'}). A new capture would need a different baselineId in a separate task.`
        : null;
    },
    /** Only called immediately before runPipeline. Pre-run failures never reach it. */
    markInvoked: ({ invocationId, invokedAt, sourceSha256 }) => {
      const current = read();
      if (current.state !== 'ready') throw new Error(`persistent guard: state is "${current.state}", not "ready"; runPipeline is refused.`);
      return write({ ...current, state: 'invoked', invocationId, invokedAt, pipelineInvocationCount: 1, sourceSha256 });
    },
    markCompleted: ({ completedAt, resultSha256 }) => write({ ...read(), state: 'completed', completedAt, resultSha256, reason: null }),
    markFailed: ({ failedAt, reason, resultSha256 = null }) => write({ ...read(), state: 'failed', failedAt, reason, resultSha256 }),
  };
}

// ─── Full-result archive (P0.3B.0) ────────────────────────────────────────────

/** SHA-256 of a string, hex uppercase. `subtle` is injectable for the tests. */
export async function sha256OfText(text, subtle) {
  const bytes = new TextEncoder().encode(text);
  const digest = await subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Collects the required sections, untruncated, plus the text that gets hashed. */
export function assembleFullCapture(result) {
  const full = {};
  for (const section of FULL_CAPTURE_SECTIONS) {
    if (section === 'resultSha256') continue;
    full[section] = result[section] !== undefined ? result[section] : null;
  }
  return { full, hashedJson: canonicalJson(full) };
}

/** Record stored in the archive — same shape the recovery path reads back. */
export function buildArchiveRecord({ invocationId, status, json, sizeBytes, sha256 }) {
  return { baselineId: BASELINE_ID, invocationId, status, json, sizeBytes, sha256 };
}

/**
 * Builds the untruncated full capture JSON plus the small summary, both canonical.
 * `resultSha256` is the hash of the full JSON without that field, then embedded.
 * `hashText` is synchronous, so this variant is testable without crypto.
 */
export function buildCaptureArtifactsSync(result, hashText) {
  const { full, hashedJson } = assembleFullCapture(result);
  return finishArtifacts(result, full, hashText(hashedJson));
}

export async function buildCaptureArtifacts(result, subtle) {
  const { full, hashedJson } = assembleFullCapture(result);
  return finishArtifacts(result, full, await sha256OfText(hashedJson, subtle));
}

function finishArtifacts(result, full, resultSha256) {
  const fullJson = canonicalJson({ ...full, resultSha256 });

  const summary = {
    baselineId: result.baselineId ?? BASELINE_ID,
    status: result.status ?? null,
    invocationId: result.invocationId ?? null,
    capturedAt: result.capturedAt ?? null,
    runStatus: result.runStatus ?? null,
    pipelineInvocationCount: result.pipelineInvocationCount ?? null,
    sourceSha256: result.source?.sha256 ?? null,
    parityStatus: result.editorParityAudit?.parityStatus ?? null,
    selectedRegionSource: result.regionSourceResolution?.selectedRegionSource ?? null,
    coordinateSpace: result.coordinateDeclaration?.design?.coordinateSpace ?? null,
    regionCount: Array.isArray(result.regionsSummary) ? result.regionsSummary.length : null,
    stageLog: result.stageLog ?? null,
    evaluatorConclusion: result.evaluationReport?.conclusion ?? null,
    readiness: result.readiness ?? null,
    fullCaptureFileName: CAPTURE_FILE_NAMES.full,
    fullCaptureSizeBytes: new TextEncoder().encode(fullJson).length,
    resultSha256,
  };

  const summaryJson = canonicalJson(summary);
  return {
    resultSha256,
    full: { fileName: CAPTURE_FILE_NAMES.full, json: fullJson, sizeBytes: new TextEncoder().encode(fullJson).length },
    summary: { fileName: CAPTURE_FILE_NAMES.summary, json: summaryJson, sizeBytes: new TextEncoder().encode(summaryJson).length },
  };
}

/**
 * Minimal IndexedDB archive. `factory` defaults to globalThis.indexedDB; the
 * tests inject an in-memory adapter with the same put/get contract.
 */
export function createCaptureArchive(factory) {
  const open = () => new Promise((resolve, reject) => {
    const request = factory.open(CAPTURE_ARCHIVE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CAPTURE_ARCHIVE_STORE)) db.createObjectStore(CAPTURE_ARCHIVE_STORE, { keyPath: 'invocationId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const run = (mode, action) => open().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(CAPTURE_ARCHIVE_STORE, mode);
    const request = action(tx.objectStore(CAPTURE_ARCHIVE_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));

  return {
    dbName: CAPTURE_ARCHIVE_DB,
    storeName: CAPTURE_ARCHIVE_STORE,
    put: record => run('readwrite', store => store.put(record)),
    get: invocationId => run('readonly', store => store.get(invocationId)),
    getAll: () => run('readonly', store => store.getAll()),
  };
}