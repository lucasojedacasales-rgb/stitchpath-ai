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

**Binary copy.** `source/HATCH-A-WIDTHS-EXACT-100x80mm-300dpi.png` could not be
stored: the build tooling only persists text files. Instead the harness fetches
the image at capture time and **recomputes its SHA-256**, refusing to run the
engine unless the bytes are identical to the hash above. No substitute image is
ever accepted.

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

## Single execution

`pipelineInvocationCount` starts at 0, is checked before the run, becomes 1, and
a second invocation throws. There are no automatic retries and the HTML has a
reload guard so a completed capture is never repeated.

Failure policy: an exception **before** a context is returned produces
`captureFailure.json` and `A_WIDTHS_BASELINE_CAPTURE_FAILED`, with no synthetic
evaluation. A returned context with failing stages keeps the context and the
`stageLog` and is marked `runStatus: "completed_with_stage_errors"` — stage
failures are never hidden.

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