# A_WIDTHS baseline (Hatch Lab) — BASE-ENGINE-A-WIDTHS-V1 · P0.3B

## Purpose

First controlled measurement of the **current base engine** over the real
A_WIDTHS sheet. It measures the engine as it works **today**; it does not try to
improve it, and it changes no engine behaviour.

Everything here is **informative**. This baseline never emits `pass`, `fail`,
`improved`, `regressed`, `accepted` or `rejected`, never writes `expectedResult`
and never promotes a candidate rule. `benchmarkReady`, `motorIntegrationReady`
and `physicalValidationAvailable` stay `false`.

## Capture state

**Infrastructure ready — the single engine run has NOT been performed yet.**

`runPipeline` cannot run in the build tooling: `image_analysis` decodes the
bitmap with `Image` + `canvas`, `semantic_segmentation` calls LLM Vision and
`vector_engine` calls a backend function. All three need a real browser with the
authenticated app client. The one allowed execution therefore happens in the
capture harness, opened once in the browser, and its published result is written
into `BASE-ENGINE-A-WIDTHS-V1/`.

Already verified and stored: the exact source image (SHA-256 checked against the
seed manifest and the evidence index), the engine fingerprint and the config
provenance.

## Verified source image

| Item | Value |
|---|---|
| File | `HATCH-A-WIDTHS-EXACT-100x80mm-300dpi.png` |
| Package | `A_Anchuras_parte_01.zip` (SHA-256 `70FA1952…AEF46`, matches the seed manifest) |
| SHA-256 | `4CB26E42A48E7D9F9D763CC644DA7B2FDB95A2022A65CDE50C05745619C12005` |
| Bytes | 46 432 |
| Pixels | 1181 × 945 (300 dpi) |
| Sheet | 100 × 80 mm |

The hash equals the value registered in `seedManifest.json` **and** in
`evidenceIndex.json`. The GUIDE image, the SVG, the 78 screenshots and any
resized, optimized, re-exported or reconstructed variant are rejected.

**Where the image actually is.** The real situation, consistent with
`sourceManifest.json` (`localCopy.stored: false`):

* the image was extracted from the package and **verified in the sandbox**;
* its SHA-256 is **confirmed** against the seed manifest and the evidence index;
* the binary copy is **NOT stored in the repository** (the build tooling only
  persists text files);
* the harness therefore requires a **public URL serving those same bytes**;
* before running the engine the harness **recomputes the SHA-256** of the bytes
  it fetched and refuses to continue unless it equals the hash above.

No substitute, resized or re-exported image is ever accepted, and no text in this
repository claims the image is stored locally.

## Isolation

The application does not know this baseline exists: no route, no button, no tab,
no productive feature flag, no engine selector, no persisted field.

Dependency direction — the single controlled exception of P0.3B:

```
src/tests/hatchLab/aWidthsBaselineCapture.js  →  base engine (runPipeline)
```

Never the opposite. `src/lib/hatchLab/evaluators/**` still imports **no**
productive module and stays completely pure.

The harness never calls `buildFinalCommands`, never generates DST or DSB, never
exports, never saves a project, never touches entities, Engine V2 or
`referenceLearning`, and never applies a Hatch rule.

## Baseline configuration

The current productive defaults (`src/pages/Editor.jsx` `DEFAULT_CONFIG`, lines
87–113), passed through `resolveEffectiveEmbroideryProfile` exactly as
`startProcessing` does. Only three things are shared with the reference: the same
image, the 100 × 80 mm sheet and the Pure Cotton fabric (`fabric_type:
'Algodón'`, the exact value supported by the app).

Technique, density, pull compensation, underlay and angle are **engine outputs**.
They are never injected. Satin, the Hatch underlay, 0,36 mm spacing, 0,40 mm
compensation, 0° angle, automatic split, seed thresholds, `candidateRules` and
`expectedResult` never enter the input — `engineInputAudit.json` proves it by
scanning both keys and string values of the exact object handed to the engine.

Full provenance per field: `CONFIG_PROVENANCE` in the harness, mirrored into
`baselineConfig.json`.

## Parity with the productive Editor call

The harness reproduces `Editor.startProcessing` (lines 545-554), not an
approximation. `editorParityAudit` reports it field by field and the run button
stays disabled unless `parityStatus` is `exact` or `equivalent`:

* real signature — `runPipeline(imageUrl, config, opts = { onProgress, skipStages = [], initialCtx = {} })`;
* `config` — `{ ...baseConfig, ...profile.pipelineConfig, effectiveProfile }`, with
  the profile resolved by the same `resolveEffectiveEmbroideryProfile(config, DEFAULT_PREPROCESS, machineSettings)` call;
* `initialCtx` — `{ darkStroke, inputAudit, effectiveProfile }`, exactly the
  Editor keys (`aiStrategy` is absent because the Editor omits it when the user
  presses “Procesar” without AI);
* `darkStroke` — built with the **same productive function**,
  `buildStrictDarkStrokeContextFromOriginalImage(url, pickMotorConfig(config))`;
* **no `onProgress`** — the Editor passes none, so the harness passes none and the
  page shows no progress bar; progress is read from `stageLog` after the run;
* no skipped stage.

Current status: **`equivalent`**, because `buildInputSegmentationAudit` and
`pickMotorConfig` are module-local helpers in `Editor.jsx` and are not exported;
the harness reimplements them field for field (verifiable at lines 74-85 and
119-130). Every equivalence is listed in `editorParityAudit.equivalences`.

## Single execution — persistent

Two barriers. The first is persistent under
`HATCH_LAB_BASE_ENGINE_A_WIDTHS_V1_CAPTURE_STATE`, storing `baselineId`, `state`,
`invocationId`, `pipelineInvocationCount`, `invokedAt`, `completedAt`, `failedAt`,
`sourceSha256`, `resultSha256` and `reason`. States: `ready` → `invoked` →
`completed` | `failed`.

* Pre-run refusals — wrong hash, unreachable URL, invalid input audit, parity not
  demonstrated — **never** move the state away from `ready`.
* Immediately before `runPipeline`: the state must be `ready`; it becomes
  `invoked` with `pipelineInvocationCount: 1`, an `invocationId` and `invokedAt`.
* After a context is returned: `completed`. If `runPipeline` throws: `failed`.
* After a reload, `invoked` / `completed` / `failed` all keep the button disabled
  and the persisted state is displayed.
* There is **no reset button** and the UI cannot erase the guard. Another run
  would require a different `baselineId` in a separate task.

The in-memory `pipelineInvocationCount` remains as the second barrier.

Failure policy: an exception **before** a context is returned yields
`A_WIDTHS_BASELINE_CAPTURE_FAILED` with the full `captureFailure`, and no
synthetic evaluation. A returned context with failing stages keeps the context and
the `stageLog` and is marked `runStatus: "completed_with_stage_errors"` — stage
failures are never hidden.

## The full result is preserved

`window.__HATCH_LAB_A_WIDTHS_BASELINE_V1__` is a convenience only. After a
completed **or** failed capture the harness:

1. builds the canonical, **untruncated** full JSON with every required section
   (`status`, `pipelineInvocationCount`, `source`, `engineInputAudit`,
   `editorParityAudit`, `baselineConfig`, `regionSourceResolution`,
   `coordinateDeclaration`, `stageLog`, `pipelineSnapshot`, `omittedFields`,
   `missingContextKeys`, `preservedRegionFieldReport`, `regionsSummary`,
   `evaluationReport`, `readiness`, `resultSha256`);
2. computes its size in bytes and its SHA-256;
3. stores `{ baselineId, invocationId, status, json, sizeBytes, sha256 }` in
   IndexedDB (`hatch_lab_baselines` / `a_widths_captures`);
4. only **then** marks the persistent state `completed` (or `failed`, including
   when the archive write itself failed).

Two buttons appear: **Descargar captura JSON completa** →
`BASE-ENGINE-A-WIDTHS-V1.capture.json`, and **Descargar resumen de captura** →
`BASE-ENGINE-A-WIDTHS-V1.summary.json`. The on-screen preview may be cut at
200 000 characters and then says explicitly “Vista previa truncada; el archivo
descargado contiene el resultado completo.” The downloaded file is never cut.

After a reload, if a record exists in IndexedDB the engine is **not** run: the
record is recovered and only the download buttons are re-enabled.

## Delivery flow after the run

Base44 cannot recover an object living only in `window`. The real flow is:

1. the user runs the capture once in the browser;
2. the browser downloads `BASE-ENGINE-A-WIDTHS-V1.capture.json`;
3. the user attaches that JSON to this same Base44 chat;
4. a later task converts it into `pipelineSnapshot.json`, `runManifest.json`,
   `baselineConfig.json`, `engineInputAudit.json`, `stageLog.json`,
   `regionsSummary.json`, `regionsSummary.csv`, `evaluatorInput.json`,
   `evaluationReport.json`, `evaluationReport.md` and `snapshotHashes.json`;
5. that later task never runs the engine again.

## Harness path

Open `/src/tests/hatchLab/aWidthsBaselineCapture.html` in the preview (same
mechanism as the existing `/src/tests/hatchLab/hatchLabTests.html`: Vite serves
HTML entries from the project root and rewrites the `/src/...` module imports).

## Region source and coordinates

Both are declared explicitly, never assumed:

* **Region source** — `resolveCanonicalRegionSource` reports every declared
  collection and its count. `stitch_optimizer` writes the final production order
  back into `ctx.regions`, so `regions` is canonical and
  `optimized.optimizedSequence` is a report over the same objects. Collections
  are never mixed and the evaluator is never run without an explicit
  `regionSource`.
* **Coordinate space** — `normalized_0_1`, justified by the real stage contract
  (`normalizeRegionForPipeline` normalizes `path_points` to `[0,1]²` before
  `region_builder` and no later stage converts them back), **not** by observing
  values between 0 and 1. `widthPx` / `heightPx` come from the PNG header.

## Files

```
baselineSchema.js          constants, preserved fields, allowed conclusions
sanitizePipelineResult.js  plain serializable capture + omittedFields
canonicalSnapshot.js       canonical JSON, region summary, region source, input audit
BASE-ENGINE-A-WIDTHS-V1/
  sourceManifest.json      image + package verification (written)
  engineFingerprint.json   commit, package, SHA-256 of the productive files (written)
  … remaining artefacts are written from the harness result
```

Capture harness: `src/tests/hatchLab/aWidthsBaselineCapture.{js,html}`.

The snapshot suite `aWidthsBaselineSnapshot.test.js` works only on the stored
files, never runs the engine, and is registered in the aggregator **after** the
snapshot exists.

## Limitations

* `spacingMode` does not exist in the engine; `spacingMm` is not equivalent to
  `density`; `autoSplit` does not exist.
* No physical validation exists for this sheet.
* The 78 screenshots stay unmapped, so no visual cross-check is possible.
* Any real stage failure is reported as such, never smoothed over.
* Nothing here states that the engine is good or bad: it states what it produced.