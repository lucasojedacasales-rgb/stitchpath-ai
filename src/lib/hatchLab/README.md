# Hatch Lab — P0 foundation (isolated, disabled, removable)

Infrastructure to turn Hatch/Wilcom A–G technical evidence into checkable rules,
regression cases and comparable metrics for the **current base engine**.

**Status of P0**

- No A–G rule is implemented.
- The lab is **not** connected to the Editor, the router, the pipeline or any config.
- Nothing in `src/` outside `src/lib/hatchLab/**` and `src/tests/hatchLab/**` was created or modified.
- Deleting these two folders restores the repository to its exact previous behaviour.
- No feature flag has been added yet. When P1 starts, a flag
  `BASE_ENGINE_HATCH_LAB_ENABLED = false` should live in a new
  `src/lib/hatchLab/hatchLabFlags.js` — **not** in the Editor, not in `config`,
  not persisted in the `Project` entity.

**Seed status**: the Hatch/Wilcom A–G seed is **not present in this repository**.
`seed/syntheticSeedExample.js` is marked `syntheticExample: true` and exists only
to exercise the schema and the validator. It is not evidence and must never be
used to derive rules.

**Engine V2**: `src/lib/referenceLearning/**`, `src/components/referenceLearning/**`
and `src/pages/ReferenceLearning.jsx` are the *reference-learning module of the base
application*; their relation to the externally developed Engine V2 is **not confirmed**.
They are excluded as a precaution and the lab must never import them. See
`engineBoundaryManifest.js`.

## Modules

| File | Purpose |
|---|---|
| `engineBoundaryManifest.js` | Declarative path classification + hard constraints. Imports nothing. |
| `seed/seedSchema.js` | Versioned A–G case schema, phases, evidence types, confidence levels. |
| `seed/validateSeed.js` | Pure validator (single case + collection). Never mutates input. |
| `seed/normalizeSeed.js` | Pure normalizer producing a new copy; missing data stays `null`. |
| `seed/syntheticSeedExample.js` | Synthetic valid case + invalid variants for the tests. |
| `bench/metricAvailability.js` | `unavailable` vocabulary, metric keys, default tolerances. |
| `bench/extractMetrics.js` | Pure extraction from an already-produced engine result. |
| `bench/compareMetrics.js` | Pure comparison: equal / improvement / regression / informational / not comparable. |
| `bench/buildBenchReport.js` | JSON report; `pass` is never the default. |
| `reports/reportSchema.js` | Report shape and allowed conclusions. |

## Comparison policy

Fewer regions, fewer colors, fewer stitches or shorter processing time are
**informational differences**, never improvements. A change is only an
improvement or a regression when a seed case declares the expected direction in
`expectedResult`. Without a seed `expectedResult` the report concludes
`no_expected_result`; with essential metrics missing it concludes `inconclusive`.

Holes are only counted when the region data declares them explicitly
(`region.holes`). They are never inferred from geometry and never read from a
screenshot.

## Future stage-hook feasibility

Read-only inspection of `src/lib/pipeline/runner.js` (not modified):

- `runPipeline(imageUrl, config, { onProgress, skipStages, initialCtx })` iterates
  a private `CLIENT_STAGES` array. `onProgress(weight, stageId)` is invoked
  **before** each stage and receives no `ctx`, so it cannot read or transform
  regions: it is a progress notification, not a hook.
- There is **no** after-stage callback, no stage-level interception point and no
  early-stop mechanism: `skipStages` skips a stage but the loop always runs to
  the end. Stage failures are swallowed and logged into `ctx.stageLog`.
- Intermediate state **is** reachable: the returned `ctx` carries every stage's
  output, `initialCtx` is merged into a fresh context before the loop, and the
  exported `runStages(ctx, stageIds)` re-runs an arbitrary subset on an existing
  context.
- Stages that replace or reorder `ctx.regions`: `region_builder`,
  `quality_phase_1_input_segmentation_cleanup` and `stitch_optimizer`
  (the last one overwrites `ctx.regions` with `result.optimizedSequence`).
  A rule that modifies regions before any of these must be followed by a re-run
  of every later stage, otherwise plan, path metrics and ordering go stale.

**Conclusion: B — there are no usable per-stage hooks; an optional API would be
needed for true in-pipeline rule insertion.**

Mitigation available today **without touching `runner.js`**: segmented execution
composed externally — call `runPipeline` with `skipStages` listing every stage
after the insertion point, apply the lab rule to the returned `ctx`, then call
`runStages(ctx, [...remaining stage ids])`. This is a legitimate C-style
composition and is the recommended P1 mechanism. Its limits, stated honestly:
it depends on the private stage-id strings, it cannot intercept anything
*inside* a stage (for example the blob filter inside `contourEngine`), and it
re-runs whole stages rather than patching them.

Option D (duplicating the pipeline) is **rejected**: it would fork the base
engine and guarantee divergence.

**Minimal future change, if in-pipeline hooks are ever required**: add an optional
`opts.hooks = { afterStage(stageId, ctx) }` invoked after `stage.fn(ctx)` inside
the existing loop of `runner.js` — a purely additive, default-undefined
parameter. That change is **not** part of P0 and has not been made.