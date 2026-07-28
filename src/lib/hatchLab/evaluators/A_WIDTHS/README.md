# A_WIDTHS evaluator (Hatch Lab, P0.3A)

## Purpose

Pure, isolated tool that reads an **already generated** base-engine result and
extracts, for each real A_WIDTHS seed case (A1, A5, A6, A7, A8): the matched
region, interpreted width and height, technique, underlay, spacing mode and
value, pull compensation, automatic split, stitch angle, and the availability
and reliability of every one of those data points.

**It never runs the engine** (no `runPipeline`, `runStages`, `buildFinalCommands`,
no image processing, no stitch generation, no export, no project saving), never
applies rules, never writes `expectedResult`, and never promotes a candidate rule.
It imports **no productive module**: every input arrives as a plain data object.
Deleting `src/lib/hatchLab/evaluators/` leaves the application unchanged.

## API

```js
import { evaluateAWidthsResult } from '@/lib/hatchLab/evaluators/A_WIDTHS/index.js';

const report = evaluateAWidthsResult({
  result,      // { regions?, objects?, optimizedRegions?, plan?, commands?, meta?, config?, machineSettings?, stageLog? }
  seedCases,   // the five real A_WIDTHS cases
  design,      // { widthMm, heightMm, widthPx, heightPx, coordinateSpace }
  options,     // tolerances, match policy, explicit coordinate space, ambiguity margin, verified alternative fields
});
```

Output: `{ evaluatorVersion, generatedAt, status, inputSummary, coordinateSystem,
fieldCoverage, matchCoverage, cases[{ caseId, match, reference, actual,
comparisons, warnings, status }], unknownFields, unavailableFields, warnings,
conclusion }`.

Allowed conclusions in this phase: `evaluated`, `partial`, `inconclusive`,
`invalid_input`, `no_matches`, `ambiguous`. `pass`, `fail`, `improved` and
`regressed` are **not** produced.

`generatedAt` defaults to `null` (and only ever comes from `options.generatedAt`)
so the same input always yields the exact same output.

## Verified productive field table

Obtained by read-only inspection of `regionBuilder.js`, `adaptiveEngine.js`,
`stitchIntelligence.js`, `stitchPlanner.js`, `stitchSequenceOptimizer.js`,
`exportPipeline.js`, `pipeline/types.js`, `pipeline/regionNormalize.js`,
`pipeline/stages/regionBuilderStage.js`, `stitchPlannerStage.js`,
`stitchOptimizerStage.js`, `contourSafeMode.js`, `contourFromFill.js`,
`outlineGenerator.js` and the regression fixtures.

| Data point | Real path | Meaning | Unit | Pipeline moment | Stable | Optional | Variants / limitations |
|---|---|---|---|---|---|---|---|
| region id | `region.id` | identifier | — | regionNormalize | yes | no | auto-generated `r_xxxxxxx`; uniqueness not guaranteed |
| geometry | `region.path_points` | closed fill polygon | **normalized 0–1** after `normalizeRegionForPipeline` | contour_engine → region_builder | yes | no | mm or pixels *before* normalization; the space is never declared in the object |
| contour geometry | `region.contour_points` | contour polyline | normalized 0–1 | contourSafeMode / outlineGenerator | yes | yes | contour objects have no `path_points` |
| centroid | `region.centroid` | `[cx, cy]` | normalized 0–1 | regionNormalize | yes | yes | recomputed when out of range (bounding-box centre is used for matching) |
| order | `region.priority`, `region.layer_order`, `region.travelOrder` | layer / travel order | integer | adaptiveEngine / stitchIntelligence | priority yes, travelOrder no | yes | never a matching criterion |
| region type | `region.type` | `'contour'` on contour objects | — | contourSafeMode / contourFromFill / outlineGenerator | yes | yes | fill objects carry **no** `type` |
| region class | `region.region_class` | semantic class | — | several modules | no | yes | `outer_outline`, `inner_outline`, `fill`, `detail_run`, … (mixed vocabularies) |
| relation | `region.parentRegionId` | fill a contour belongs to | — | contourFromFill | yes | yes | contour objects only |
| technique | `region.stitch_type` (fallback `plan.sequence[].stitchType`) | stitching technique | — | adaptiveEngine / planner | yes | no | `'fill' \| 'satin' \| 'running_stitch'`; the engine never emits `'tatami'` |
| density | `region.density` | row spacing (fill) / column spacing (satin) | **mm** (documented in `pipeline/types.js:107`, `regionBuilder.js:26`) | adaptiveEngine | yes | yes | equivalence with the Hatch "spacing" column is **not verified** |
| stitch length | `region.stitch_length_mm` | stitch length | mm | adaptiveEngine | yes | yes | — |
| pull compensation | `region.pull_compensation` | pull compensation | mm | adaptiveEngine | yes | yes | `0` is a valid value |
| angle | `region.angle` = `region.fill_angle` (fallback `plan.sequence[].optimalAngle`) | stitch angle | degrees `[0,180)` | adaptiveEngine | yes | yes | `0` is a valid value |
| underlay | `region.recommended_underlay` `{ enabled, type, density_mm, angle_deg, rationale }`; boolean `region.underlay` | underlay | mm / degrees | adaptiveEngine ← `eieUnderlay` | yes | yes | real types: `centre_walk`, `zigzag_centre`, `edge_walk`, `edge_walk_zigzag`, `zigzag`, `full_coverage`; planner emits `center_run` / `edge_run`; **no lengths**, **never two entries** |
| colour | `region.color` / `region.hex` | hex colour | — | regionNormalize | yes | yes | never a matching criterion |
| design dimensions | `config.width_mm`, `config.height_mm` (evaluator: `design.widthMm/heightMm`) | sheet size | mm | pipeline config | yes | no | defaults to 100×100 inside the pipeline — never assumed here |
| plan entry | `plan.sequence[]` `{ regionId, stitchType, optimalAngle, density, underlay, layerOrder, estimatedStitches, areaMm2 }` | planner decision | mm / degrees | stitch_planner | yes | yes | linked by `regionId` |

### Unavailable data (verified absent, never invented)

| Requested data | Status | Reason |
|---|---|---|
| spacing mode (auto/manual) | `unavailable` | exhaustive search over `src/lib` + `src/tests`: **0** occurrences of `spacing_mode` / `spacingMode` |
| spacing value (mm) | `unavailable` | no spacing field exists; only `density`, whose equivalence with the Hatch spacing column is unverified |
| automatic split | `unavailable` | **0** occurrences of `auto_split` / `autoSplit` |
| underlay lengths | `unavailable` | `eieUnderlay` returns `type` / `density_mm` / `angle_deg` only |
| secondary underlay | `unavailable` | a single combined type (`edge_walk_zigzag`) is emitted, never two |
| coordinate space metadata | `unavailable` | no region or result declares it; `regionNormalize` infers it heuristically *inside* the pipeline |

### Ambiguous fields (reported, never resolved silently)

`region_class` (several vocabularies), `region.type` absent on fills (absence
only means "not marked as contour"), `region.density` semantics vs Hatch spacing,
`full_coverage` underlay (no equivalent in the A_WIDTHS vocabulary → `unknown`),
`name` / `color` / array order (never criteria).

## Coordinate systems

Only `mm`, `normalized_0_1` and `pixels`. Resolution priority:
1. `design.coordinateSpace`;
2. verified result metadata — **opt-in only** (`options.allowResultMetaCoordinateSpace`),
   because the base engine declares none;
3. `options.coordinateSpace`.

The space is **never** inferred from values lying between 0 and 1.
`normalized_0_1` requires `widthMm` + `heightMm`; `pixels` requires
`widthPx` + `heightPx` + `widthMm` + `heightMm`. Anything missing →
`coordinateStatus: "unavailable"` and no measurement. Applied conversions are
reported in `coordinateSystem.conversions`; mm, pixels and normalized values are
never mixed.

## Measurement method

`measurementMethod: "bounding_box_width"`. Per region: `centerXMm`, `centerYMm`,
`boundingWidthMm`, `boundingHeightMm`, `areaMm2`, `aspectRatio`, `pointCount`,
`minimumX/maximumX/minimumY/maximumY`. No internal rounding.

For the five current cases (`geometryClass: barra_recta`) the bounding-box width
is the main measurement; nominal width, Hatch-observed width and engine-computed
width stay three distinct values. The report states explicitly that this is **not**
a universal local width profile for curved bands, tapered shapes or capsules, and
warns whenever `geometryClass !== 'barra_recta'`.

## Matching algorithm

Per case: target centre (`input.centerXMm`, `input.centerYMm`), nominal width and
height (`observation.measured` → fallback `testedSizeMm`), `geometryClass` and
region role. Candidates are discarded beyond `maximumCenterDistanceMm`; the score
is `1 − (0.5·centre + 0.2·width + 0.2·height + 0.1·aspect)` penalties, each
normalized by its tolerance. Array position, creation order, colour, region index
and visual similarity are **never** criteria.

Returned: `status` (`matched` / `ambiguous` / `unmatched` / `unavailable`),
`selectedRegionId`, `candidateRegionIds`, `score`, `centerDistanceMm`,
`widthDifferenceMm`, `heightDifferenceMm`, `reasons`, `tolerancesUsed`.
Two candidates within `ambiguityScoreMargin` → `ambiguous` (the first is never
picked arbitrarily). If only contour / auxiliary objects are nearby → `ambiguous`
with the candidates listed; a contour never replaces the main object and nothing
is filtered silently.

Default tolerances: `centerToleranceMm 1.0`, `maximumCenterDistanceMm 6.0`,
`widthToleranceMm 1.0`, `heightToleranceMm 2.0`, `aspectToleranceRatio 0.5`,
`ambiguityScoreMargin 0.05`, `valueToleranceMm 0.01`.

## Extracted vs derived vs inferred

* **Extracted** — read from a verified field (`technique`, `density`,
  `pull_compensation`, `angle`, underlay type/enabled).
* **Derived** — computed from geometry with a documented formula and
  `derived: true` (`widthMm`, `heightMm`, coordinate conversions, and `spacingMm`
  only under the explicit `treatDensityAsSpacing` opt-in, as an identity, never `1/density`).
* **Inferred** — not produced. Missing or unverifiable data is `unavailable` /
  `unknown` with a reason.

Every value carries `rawValue`, `normalizedValue`, `sourceField`, `availability`,
`derived` and `reason`. `0` and `false` are values: `value || null` is never used.

## Seed reference

Read for information only: `observation.measured`, `configuration.documented`,
`input`, `ruleScope`. `candidateRules` are **never** expected truth. Comparisons
expose `referenceValue`, `actualValue`, `delta`, `comparable`, `comparisonStatus`
(`equal`, `different`, `unavailable_reference`, `unavailable_actual`,
`ambiguous_match`, `not_comparable`, `informational`) and `reason`. Hatch values
are never used to fill gaps in the engine result. A `spacingMm: null` on automatic
spacing means "not documented", never zero.

## Minimal example

```js
const result = { regions: [{ id: 'bar_A7', path_points: [[77,5],[83,5],[83,21],[77,21]],
  stitch_type: 'satin', density: 0.36, pull_compensation: 0.4, angle: 0,
  recommended_underlay: { enabled: true, type: 'edge_walk_zigzag', density_mm: 2, angle_deg: 90 } }] };

const report = evaluateAWidthsResult({
  result, seedCases: [caseA7],
  design: { widthMm: 100, heightMm: 80, coordinateSpace: 'mm' },
});
// report.conclusion === 'evaluated'
// report.cases[0].actual.widthMm.normalizedValue === 6
// report.cases[0].actual.autoSplit.availability === 'unavailable'
```

## Limitations

* Nothing is measured without a declared coordinate space.
* Spacing mode, spacing value and automatic split do not exist in the engine.
* Bounding-box width is only the main measurement for straight bars.
* The 78 A_WIDTHS screenshots stay unmapped, so no visual cross-check is possible.
* No physical validation exists for this sheet; no criterion is applied and no
  pass/fail is emitted.
* Region ids are not guaranteed unique; duplicates are reported as warnings.

## Future baseline execution requirements

A later phase that actually runs the base engine over the A_WIDTHS sheet will need:

1. A **stable source file** for `HATCH-A-WIDTHS-EXACT-100x80mm-300dpi.png`
   (permanent storage plus SHA-256), not a temporary URL and not a copy committed here.
2. Design dimensions fixed at **100 × 80 mm**, declared explicitly together with
   `widthPx` / `heightPx` and the coordinate space used.
3. The exact configuration: digitize mode, fabric profile (Pure Cotton), adaptive
   engine on/off, contour safe mode, experimental flags, machine settings.
4. A complete capture of the result: `regions`, `plan`, `optimized`, `commands`,
   `meta`, `config`, `stageLog` — serialized as plain data.
5. The resulting regions / context stored alongside the run so the evaluation is
   reproducible from data alone.
6. The **base engine version** (and EIE version) used for the run.

Only with items 1–6 recorded can a later phase define `expectedResult` criteria
and, after physical validation, discuss pass/fail.