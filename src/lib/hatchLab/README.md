# Hatch Lab — P0.1 (isolated, disabled, removable)

Infrastructure to turn Hatch/Wilcom A–G technical evidence into checkable rules,
regression cases and comparable metrics for the **current base engine**.

**Status**

- Schema version: **1.1.0** (`seed/seedSchema.js`).
- No A–G rule is implemented.
- The lab is **not** connected to the Editor, the router, the pipeline or any
  persisted config. No feature flag exists yet anywhere in productive code.
- Deleting `src/lib/hatchLab/**` and `src/tests/hatchLab/**` restores the app
  to its exact previous behaviour.

**Seed status**: the real Hatch/Wilcom A–G seed is **not in this repository**.
`seed/syntheticSeedExample.js` is `syntheticExample: true`: schema/validator
verification only — never evidence, never a learning case, never pass/fail.

**Engine V2 / referenceLearning**: `src/lib/referenceLearning/**`,
`src/components/referenceLearning/**` and `src/pages/ReferenceLearning.jsx` are
the *reference-learning module of the base application*; their relation to the
externally developed Engine V2 is **not confirmed**. Excluded as a precaution —
the lab never imports them. See `engineBoundaryManifest.js`.

## Verified real structures (read-only inspection, 2026-07-28)

**Regions** (`src/lib/pipeline/types.js` EnrichedRegion + `regionBuilderStage.js`):

- Stable: `id`, `color` (`#rrggbb`), `stitch_type ∈ fill|satin|running_stitch`,
  `visible` (false ⇒ discarded), `path_points` (normalized 0–1 `[[x,y],…]`),
  `area_mm2` (number, mm²), `area_norm` (number, contour stage),
  `region_class`/`layerType` (`outer_outline|inner_outline|detail_run|detail|micro_fill`),
  contour objects: `type: 'contour'` + `contour_points`.
- `holes` is declared as a **number** on EnrichedRegion — counted only when the
  field is explicitly present; never inferred from geometry or screenshots.
- Ambiguous: a bare `stitch_type: 'running_stitch'` without `type:'contour'` or
  an outline `region_class` does **not** confirm a contour → classified
  `unknown`, never auto-counted as contour.

**Commands** (`src/lib/exportPipeline.js` — `flattenToCommands`,
`buildFinalCommands`): `{ type, x, y, color, regionId, stitchType?, source?,
layerType? }` with `type ∈ 'stitch' | 'jump' | 'trim' | 'colorChange' | 'end'`.
`'stop'` was NOT observed in the generator: it is recognized literally if
present but never invented from another type. Any other type → `unknown`
(`unknownCommandCount`, `commandRecognitionCoverage`), and a required metric
that depends on commands becomes non-conclusive.

**stageLog** (`src/lib/pipeline/types.js` `logStage` + `runner.js`):
`[{ stage, durationMs, ok, ts, error? }]` — field names verified; the extractor
uses exactly `stage`, `durationMs`, `ok`, `error`.

**Cannot be measured reliably today**: holes not explicitly declared, overlaps
between layers, expected technique per shape, and anything inside an EMB file
(no parser — EMB evidence must declare `extractable: false`).

## Availability policy

`extractMetrics(result, options)` → `{ metrics, availability, warnings }`.
Each metric's availability entry: `{ available, complete, reason, unit, source }`.

- Zero is a real measurement: `regions: []` → `regionCount = 0`, `colorCount = 0`;
  `commands: []` → `stitchCount = 0`. An **absent** field → `unavailable`.
- Partial data → `available: true, complete: false` + coverage metrics
  (`colorCoverage`, `holeCoverage`, `classifiedRegionCoverage`,
  `commandRecognitionCoverage`). Partial sums are never presented as totals.
- Units are never mixed: `totalAreaMm2` (from `area_mm2` only, all-or-unavailable)
  vs `totalAreaNormalized` (from `area_norm`, or shoelace(path_points) as a
  single consistent fallback). `smallRegionCount` declares its unit + threshold
  in `availability.source` and requires complete mm² data.
- Region classification is mutually exclusive: `fill | contour | detail |
  discarded | unknown` — one class per region, counts always sum to `regionCount`.

## expectedResult (v1.1.0)

`expectedResult: { criteria: [{ metric, operator, value|min/max|direction,
required, tolerance? }] }` with operators `equals | minimum | maximum | between |
sequence_equals | set_equals | relative_to_baseline`. Every operator except
`relative_to_baseline` evaluates the candidate against the **real target value**;
improving vs baseline never satisfies an absolute target. Validation rejects:
unknown metrics, unknown operators, operator/metric-type mismatches, empty
criteria, NaN/Infinity, non-boolean `required`, invalid tolerances,
non-array sequence values, and negative dimensions. `observation` remains a
separate field and can never carry criteria or rules.

## Synthetic-case policy

`syntheticExample: true` ⇒ never `pass`, never `fail`, never holdout, never
evidence; its expectedResult is ignored for approval; the report concludes
`no_expected_result` and carries a `SYNTHETIC_EXAMPLE` warning. Enforced in
`buildBenchReport` and covered by tests.

## Conclusion rules (exact)

- `invalid_case` — invalid seed, invalid expectedResult, unknown metric or operator.
- `no_expected_result` — synthetic case, no expectedResult, or empty criteria.
- `inconclusive` — any required criterion unavailable / incomplete /
  notComparable / unevaluated; unknown command types affecting a required
  command-derived metric; or zero required criteria (a pass is impossible
  without at least one required criterion).
- `fail` — at least one required criterion evaluated and not satisfied.
- `pass` — valid non-synthetic seed, ≥1 required criterion, ALL required
  criteria available + complete + comparable + evaluated + satisfied.

Never pass by default; never pass by mere absence of regressions. Every report
includes `conclusionReason` explaining the verdict. Differences outside the
criteria remain informational only.

## Test execution

Suites live in `src/tests/hatchLab/*.test.js` (pure runners — no test framework
is installed and `package.json` was not modified). Real execution:
open **`/src/tests/hatchLab/hatchLabTests.html`** through the Vite dev server —
it runs all suites, colors the page green/red and prints the full JSON result.
The latest execution result is recorded in the task report (see conversation);
this README does not claim results that were not actually executed.

## Future stage-hook feasibility

Read-only inspection of `src/lib/pipeline/runner.js` (unmodified):

- `runPipeline(imageUrl, config, { onProgress, skipStages, initialCtx })`:
  `onProgress(weight, stageId)` fires **before** each stage without `ctx` — a
  progress signal, not a hook. No after-stage callback, no early stop
  (`skipStages` skips but the loop completes). Failures are swallowed into
  `ctx.stageLog` (`{ stage, durationMs, ok, ts, error? }`).
- Intermediate state is reachable: the returned `ctx` carries all outputs,
  `initialCtx` merges into a fresh context, and `runStages(ctx, stageIds)`
  re-runs any subset on an existing context.
- Stages that replace/reorder `ctx.regions`: `region_builder`,
  `quality_phase_1_input_segmentation_cleanup`, `stitch_optimizer` — a rule
  touching regions requires re-running every later stage.

**Conclusion: B — no usable per-stage hooks; an optional API would be needed.**
Mitigation without touching `runner.js`: segmented execution
(`runPipeline` + `skipStages` → apply rule to `ctx` → `runStages(rest)`);
limits: depends on private stage-id strings, cannot intercept inside a stage,
re-runs whole stages. Option D (duplicating the pipeline) is rejected.
Minimal future change if real hooks are ever needed: optional
`opts.hooks = { afterStage(stageId, ctx) }` in the runner loop — additive,
default-undefined, NOT part of P0/P0.1.

## File inventory (exact)

```
src/lib/hatchLab/README.md
src/lib/hatchLab/engineBoundaryManifest.js
src/lib/hatchLab/seed/seedSchema.js
src/lib/hatchLab/seed/validateSeed.js
src/lib/hatchLab/seed/normalizeSeed.js
src/lib/hatchLab/seed/syntheticSeedExample.js
src/lib/hatchLab/bench/metricAvailability.js
src/lib/hatchLab/bench/extractMetrics.js
src/lib/hatchLab/bench/compareMetrics.js
src/lib/hatchLab/bench/buildBenchReport.js
src/lib/hatchLab/reports/reportSchema.js
src/tests/hatchLab/seedValidation.test.js
src/tests/hatchLab/metricExtraction.test.js
src/tests/hatchLab/metricComparison.test.js
src/tests/hatchLab/mutationSafety.test.js
src/tests/hatchLab/runHatchLabTests.js
src/tests/hatchLab/hatchLabTests.html
```

17 files, all inside the two lab folders. Nothing outside them is imported,
modified or referenced by productive code.