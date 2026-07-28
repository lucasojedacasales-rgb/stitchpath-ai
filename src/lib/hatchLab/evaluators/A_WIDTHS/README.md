# A_WIDTHS evaluator (Hatch Lab) — version 0.2.1-A_WIDTHS

## Purpose

Pure, isolated tool that reads an **already generated** base-engine result and
extracts, for each real A_WIDTHS seed case (A1, A5, A6, A7, A8): the assigned
region, interpreted width and height, technique, underlay, spacing mode and
value, pull compensation, automatic split, stitch angle, and the availability,
provenance and reliability of every one of those data points.

**It never runs the engine** (no `runPipeline`, `runStages`, `buildFinalCommands`,
no image processing, no stitch generation, no export, no project saving), never
applies rules, never writes `expectedResult`, and never promotes a candidate rule.
It imports **no productive module**: every input arrives as a plain data object.
Deleting `src/lib/hatchLab/evaluators/` leaves the application unchanged.

This evaluator does **not** reproduce Hatch, and **no engine has been evaluated
yet**: no baseline has been executed.

## What 0.2.0 hardens (vs 0.1.0)

1. **One-to-one matching** — a global assignment replaces per-case decisions, so a
   region can never represent two cases.
2. **Region identity** — internal candidate keys; duplicated or missing ids are
   never treated as a stable identity.
3. **Explicit region-source selection** — the first non-empty collection is no
   longer picked silently.
4. **Source conflicts** — region vs plan disagreements are reported, never resolved
   by priority.
5. **Technical coverage** — `requiredActualFields` decides whether the basic
   extraction is complete; `matchCoverage` alone never concludes `evaluated`.
6. **Informative comparisons** — informative status no longer loses the deltas.

The seed schema version (`1.1.0`) is unchanged.

## API

```js
import { evaluateAWidthsResult } from '@/lib/hatchLab/evaluators/A_WIDTHS/index.js';

const report = evaluateAWidthsResult({
  result,      // { regions?, optimizedRegions?, optimized?, objects?, plan?, meta?, config? }
  seedCases,   // the five real A_WIDTHS cases (no duplicated caseId)
  design,      // { widthMm, heightMm, widthPx, heightPx, coordinateSpace }
  options,     // regionSource, search radius, acceptance criteria, requiredActualFields, tolerances
});
```

Output: `{ evaluatorVersion, generatedAt, status, errors, inputSummary,
coordinateSystem, identitySummary, planIntegrity, assignment, mergeDiagnostics,
fieldCoverage, matchCoverage, cases[{ caseId, status, match, planStatus, reference,
actual, comparisons, requiredMissing, warnings }], unknownFields,
unavailableFields, conflictFields, warnings, matchConclusion, dataConclusion,
conclusion }`.

`generatedAt` defaults to `null` (and only ever comes from `options.generatedAt`),
so the same input always yields byte-identical output.

## What 0.2.1 corrects (P0.3A.3)

1. **Lexicographic pruning** — the score bound is only applied when the branch can
   reach *exactly* the current best match count. A branch that can still match MORE
   cases is never pruned by score, even when its best possible score is lower.
2. **Independent optimality proof** — the branch-and-bound is verified against an
   exhaustive oracle written separately in the test suite (adversarial fixture plus
   100 deterministic instances); optimality is never claimed merely because
   `maximumBranches` was not reached.
3. **Real suppression of comparisons** — when the search is not proven, no region is
   attributed, no `actual` value is produced and every comparison against Hatch is
   suppressed (`comparisonSuppressed`, `comparisonSuppressionReason`).

The seed schema version (`1.1.0`) is unchanged.

## Completeness corrections (P0.3A.2)

* Accepted candidates are never truncated silently; the counts per case are reported.
* The 20 000-solution cap was replaced by an exact branch-and-bound search that
  proves optimality.
* An interrupted or limited search can never conclude `evaluated`.
* A declared but **empty** region collection is a valid engine result
  (`no_matches`), not a missing source.

## Region source policy (`options.regionSource`)

Declarable collections: `regions` → `result.regions`, `optimizedRegions` →
`result.optimizedRegions`, `optimizedSequence` → `result.optimized.optimizedSequence`,
`objects` → `result.objects`.

Four distinct situations are separated: **absent**, **present with an incompatible
type**, **present and empty**, **present and non-empty**.

* `regionSource` declared and the field is an array (empty or not) → resolved and
  recorded; an empty array yields `regionCount: 0`, `matchCoverage.matched: 0` and
  `conclusion: 'no_matches'` — never `REGION_SOURCE_UNAVAILABLE`.
* `regionSource` declared but the field is absent or not an array → `invalid_input`
  with `REGION_SOURCE_UNAVAILABLE`. That code is used **only** for a missing field
  or an incompatible type — never for "zero regions".
* No `regionSource`: exactly one non-empty collection → it is used and recorded;
  two or more non-empty → `invalid_input` with `AMBIGUOUS_REGION_SOURCE`; no
  non-empty collection but several declared empty arrays → `invalid_input` with
  `AMBIGUOUS_REGION_SOURCE`, listing the empty collections; a single declared empty
  array → resolved with `no_matches`.
* Regions from different stages are never mixed.
* Always reported: `selectedRegionSource`, `availableRegionSources`,
  `declaredRegionSources`, `emptyRegionSources`, `invalidTypeRegionSources`,
  `countsByRegionSource`, `regionSourceReason`.

Which collection P0.3B will use is **not** assumed here.

## Identity policy

Every measured region gets `sourceIndex`, `declaredRegionId` and
`internalCandidateKey` (`<source>#<sourceIndex>:<id|no_id>`), always unique inside
the evaluation. The selected region is carried by its internal candidate (never
recovered later with `find(region.id === selectedRegionId)`).

`identityStatus`: `stable` | `duplicated_id` | `missing_id`. A non-stable identity
is rejected by the acceptance criteria (`UNSTABLE_IDENTITY`) and produces
`match.status: 'ambiguous'` with the candidate keys and an explicit reason — never
a global warning only, and never an attribution as if the identity were stable.

## Global assignment algorithm

`matchCasesToRegions({ seedCases, measuredCandidates, options })` runs an **exact
depth-first branch-and-bound** over one-to-one solutions (cases sorted by
`caseId`, candidates by `internalCandidateKey`, exploration ordered by fewest
options first; each case may also stay unmatched) and ranks them by:

1. number of valid matches (desc);
2. total score (desc);
3. total centre distance (asc);
4. signature `caseId → internalCandidateKey` (asc) as the deterministic tie-break.

The objective is declared in `assignmentSearch.objectivePriority`:
`['matchCount_desc', 'totalScore_desc', 'totalCenterDistance_asc', 'signature_asc']`.

**Pruning (exact conditions).** With `maxPossibleMatches = assignedSoFar +
suffixPossible[index]` and `maxPossibleScore = currentScore +
suffixBestScore[index]`:

1. `maxPossibleMatches < best.matchCount` → prune (`byMatchCount`).
2. `maxPossibleMatches === best.matchCount` **and**
   `maxPossibleScore < best.totalScore − ambiguityScoreMargin − 1e-9` → prune
   (`byScore`). The 1e-9 slack absorbs floating-point summation error so a branch
   exactly at the margin is never lost.
3. `maxPossibleMatches > best.matchCount` → **never pruned**, whatever its score
   bound: a branch that can match more cases always survives (e.g. a provisional
   4-match / 4.00 solution never prunes a 5-match / 3.75 branch).
4. Distance and signature are never used as bounds — no admissible bound exists for
   them — so `pruning.byDistance` and `pruning.byOther` stay 0.

**Optimality proof.** Both bounds are admissible upper bounds on the lexicographic
objective, so no optimal or equally good solution can be discarded; a naive greedy
is never used. The proof is checked **independently** in
`src/tests/hatchLab/aWidthsEvaluator.test.js` by `bruteForceAssignmentOracle`,
which enumerates every one-to-one assignment without pruning, without
`maximumBranches` and without `candidatesPerCaseLimit`, and never calls the
branch-and-bound code: match count, score, distance, signature, assignments,
ambiguous cases and alternative counts must agree on the adversarial fixture and on
100 deterministic instances.

`solveAssignmentOptions({ caseOptions, ambiguityScoreMargin, maximumBranches })`
exposes the solver alone, over already evaluated options
(`{ caseId, options: [{ internalCandidateKey, score, centerDistanceMm }] }`), so the
assignment problem is testable without any geometry.

`assignmentSearch` reports the proof: `searchComplete`, `optimalityProven`,
`solutionsExplored`, `branchesExplored`, `branchesPruned`,
`pruning { byMatchCount, byScore, byDistance, byOther, total }`,
`objectivePriority`, `estimatedSearchSpace`, `candidateLimitApplied`,
`solutionLimitApplied`, `stoppedEarly`, `stopReason`, `candidatesExcludedTotal`,
`proofMethod`. It is also mirrored at the top level of the report together with
`optimalityProven`.

`candidateCountsByCase` reports, per case: `evaluatedCandidates`,
`acceptedCandidates`, `rejectedCandidates`, `candidatesUsedByAssignment`,
`candidatesExcluded` (0 in a complete run) and `exclusionReason`.

**Resource guards.** `candidatesPerCaseLimit` and `maximumBranches` exist only as
safety guards. If either is hit, `searchComplete` and `optimalityProven` are
`false`, `assignmentMethod` becomes `exact_branch_and_bound_interrupted`, the error
`ASSIGNMENT_SEARCH_INCOMPLETE` (with cause, candidates per case, estimated space,
explored amount and the recommendation to repeat the run with higher limits) is
added, and the global conclusion is `inconclusive`.

## Suppression of comparisons when the search is not proven

`searchProven` is decided immediately after the assignment and **before** any
`actual`, reference comparison or delta is built. When it is false:

* the provisional pairs are never used to attribute a region to a case;
* `assignment` is `null` and the pairs are kept only under
  `provisionalAssignment` (explicitly labelled PROVISIONAL, NOT CONFIRMED);
* every case is `unavailable`, with `emptyActual` values (no `widthMm`, no
  `technique`, no `heightMm`);
* every comparison carries `comparisonStatus: 'assignment_search_incomplete'`,
  `comparable: false`, `actualValue: null`, `delta: null`, `absoluteDelta: null`,
  `relativeDelta: null` — no `equal`, `different`, `informational` or
  `source_conflict` status is produced;
* `comparisonSuppressed: true`, `comparisonSuppressionReason:
  'ASSIGNMENT_SEARCH_INCOMPLETE'`, `matchConclusion: 'unavailable'`,
  `dataConclusion: 'unavailable'`, `conclusion: 'inconclusive'`.

`assignment_search_incomplete` means exclusively "the assignment search was not
completed" and is never reused for `unmatched`, `ambiguous_match`,
`unavailable_actual` or `source_conflict`.

Kept for diagnostics only: candidate evaluations, `candidateCountsByCase`,
`assignmentSearch`, `mergeDiagnostics` and `provisionalAssignment`.

Other output: `assignments`, `unassignedCases`, `unassignedRegions`,
`collisionsPrevented`, `totalScore`, `assignmentMethod`, `deterministicTieBreak`,
`ambiguousCaseIds`, `alternativeSolutionCount`, `tolerancesUsed`. The result does
not depend on case order or region order.

When several equally good global solutions (same match count, total score within
`ambiguityScoreMargin`) assign different regions to a case, that case becomes
`ambiguous` and no value is attributed.

## Search vs acceptance

Being inside the search radius is never enough to return `matched`.

| Option | Role | Default |
|---|---|---|
| `maximumCenterDistanceMm` | **search** radius — which candidates are examined | 6.0 |
| `acceptedCenterDistanceMm` | acceptance — centre distance | 1.0 |
| `minimumAcceptedScore` | acceptance — minimum score | 0.75 |
| `maximumAcceptedHeightDifferenceMm` | acceptance — height | 2.0 |
| `maximumAcceptedAspectDifference` | acceptance — aspect (optional) | null |
| `requireCompatibleRegionRole` | acceptance — contour/auxiliary rejected | true |
| `requireStableIdentity` | acceptance — stable identity | true |
| `widthToleranceMm`, `heightToleranceMm`, `aspectToleranceRatio` | scoring normalizers only | 1.0 / 2.0 / 0.5 |
| `ambiguityScoreMargin` | ambiguity margin between global solutions | 0.05 |
| `mergeWidthFactor` | merge diagnostic | 3.0 |
| `valueToleranceMm`, `angleToleranceDeg`, `densityToleranceMm` | numeric comparison / agreement | 0.01 / 0 / 0.001 |
| `requiredActualFields` | data coverage required | `['widthMm','heightMm','technique']` |
| `conflictInRequiredFieldPolicy` | conflict in a required field | `'ambiguous'` |
| `candidatesPerCaseLimit` | safety guard; exceeding it marks the search incomplete | 64 |
| `maximumBranches` | safety guard on explored branches; exceeding it marks the search incomplete | 2000000 |

There are no hidden constants: every value appears in `tolerancesUsed`, in
`inputSummary.optionsUsed` and in each acceptance / rejection reason.

Width participates in the **score** (and in the merge diagnostic) but is never an
acceptance filter — the engine width is precisely what we want to measure, so the
result is never forced to agree with Hatch beforehand.

Each candidate reports `eligibility` (`accepted` | `rejected`), `acceptedBy`,
`rejectedBy` (`OUTSIDE_SEARCH_RADIUS`, `OUTSIDE_ACCEPTED_CENTER_DISTANCE`,
`SCORE_BELOW_MINIMUM`, `HEIGHT_DIFFERENCE_EXCEEDED`, `ASPECT_DIFFERENCE_EXCEEDED`,
`REGION_ROLE_INCOMPATIBLE`, `UNSTABLE_IDENTITY`), `rejectionReasons`,
`scoreComponents`, distances and differences.

Unassigned cases resolve to `ambiguous` when several weak candidates, only
contour/auxiliary candidates, or unstable identities are involved, and to
`unmatched` when no candidate qualifies.

## Possible merged regions (diagnostic)

`detectPossibleMergedRegions` reports, per candidate: `possibleMergedRegion`
(true/false), `coveredCaseIds`, `centersInside`, `boundingWidthMm`, `widthFactor`
and `reason`. Indicators: the bounding box contains the declared centres of two or
more cases, or the width exceeds `mergeWidthFactor` × nominal width. A merge is
**never asserted as a fact** and never produces pass/fail.

## Plan integrity

`planIntegrity: { status, duplicatedRegionIds, missingRegionIds,
orphanPlanEntries, regionsWithoutPlan, warnings }`. Entries are never overwritten:
all entries per `regionId` are kept. When a region has two plan entries, the last
one is **not** taken — plan-sourced values are marked `unavailable` with the reason,
and `planStatus` is `duplicated` (`single` / `missing` otherwise).

## Provenance reconciliation

`resolveFieldSources({ fieldName, sources, normalizer, tolerance })` reconciles
`region.stitch_type` vs `plan.stitchType`, `region.density` vs `plan.density`,
`region.angle` / `region.fill_angle` vs `plan.optimalAngle`, and
`region.recommended_underlay` vs `plan.underlay`. No source has priority.

Each field keeps `sourceValues`, `normalizedSourceValues`, `selectedValue`,
`selectedSource`, `sourceAgreement` (`single_source` | `consistent` | `conflict` |
`unavailable`), `conflictDetails` and `selectionPolicy`. On disagreement the
availability becomes `conflict`, no value is selected and the value is **not**
compared (`comparisonStatus: 'source_conflict'`). Numbers use an explicit
tolerance; normalized strings require exact equality. `fieldCoverage.sourceConflicts`
counts conflicts per field.

## density / spacing policy

`treatDensityAsSpacing` was **removed**; passing it truthy returns `invalid_input`
with `UNVERIFIED_DENSITY_SPACING_EQUIVALENCE`.

* `region.density` → `densityMm` (mm), preserved.
* `plan.sequence[].density` → `planDensityMm`, kept separate.
* `spacingMode` → `unavailable` (no such engine field).
* `spacingMm` → `unavailable`; never derived from density, no identity formula and
  no `1/density` conversion.
* `densityMm` is never compared against the Hatch `spacingMm`.

The equivalence between engine density and the Hatch spacing column remains
**pending a real semantic validation**.

## Underlay

`underlayEnabled`, `primaryUnderlay` (type), `underlayDensityMm` (from
`region.recommended_underlay.density_mm`, mm) and `underlayAngleDeg`.
`underlayDensityMm` is **not** interpreted as the Hatch "underlay 2 spacing".
`secondaryUnderlay`, `primaryLengthMm`, `secondaryLengthMm` and
`secondarySpacingMm` stay `unavailable` while the engine does not expose them —
`secondarySpacingMm` is deliberately never fed by `density_mm`.

## Informative deltas

Numeric comparisons — including `comparisonStatus: 'informational'` — keep
`referenceValue`, `actualValue`, `delta`, `absoluteDelta`, `relativeDelta` (when
the reference is non-zero), `tolerance` and `withinTolerance`. Preserved for
nominal width vs engine, Hatch-observed width vs engine, nominal height vs engine
and observed height vs engine. No `pass`, `fail`, `improved` or `regressed` is ever
emitted.

## Coverage and conclusions

`fieldCoverage` counts `available` / `unavailable` / `unknown` / `conflict` for
`widthMm`, `heightMm`, `technique`, `densityMm`, `pullCompensationMm`,
`stitchAngleDeg`, `underlayEnabled`, `underlayType`, `underlayDensityMm`,
`spacingMode`, `spacingMm`, `autoSplit`, plus `sourceConflicts` and
`stableIdentity`.

Three separate conclusions:

* `matchConclusion`: `all_assigned` | `partial_assignment` | `ambiguous_assignment` | `no_assignment` | `unavailable`.
* `dataConclusion`: `complete` | `incomplete` | `conflicted` | `unavailable`.
* `conclusion` (global):
  * `evaluated` — every case uniquely assigned, every selected identity stable, no
    provenance conflict in `requiredActualFields`, all `requiredActualFields`
    available, coordinate system resolved **and** the assignment search proven
    complete (`searchComplete`, `optimalityProven`, `stoppedEarly === false`,
    `candidateLimitApplied === false`, `solutionLimitApplied === false`);
  * `partial` — at least one valid match, but a case or a required field is missing;
  * `ambiguous` — an assignment, identity or provenance ambiguity prevents attributing
    data (documented policy: a conflict in a required field yields `ambiguous`);
  * `no_matches` — no valid match;
  * `inconclusive` — cannot measure (coordinates / provenance) or the assignment
    search could not be completed (`ASSIGNMENT_SEARCH_INCOMPLETE`);
  * `invalid_input` — ambiguous region source, invalid structure, forbidden option,
    duplicated `caseId`, incompatible input.

Fields the engine does not expose (`spacingMode`, `spacingMm`, `autoSplit`) are
never required to declare the basic extraction complete.

## Duplicated seed cases

`seedCases` is validated before matching. Duplicated `caseId` → `invalid_input`
with `DUPLICATED_SEED_CASE_ID`; no case is ignored and the evaluation stops.

## Coordinate systems

Only `mm`, `normalized_0_1` and `pixels`. Priority: `design.coordinateSpace` →
verified result metadata (opt-in only, since the base engine declares none) →
`options.coordinateSpace`. The space is **never** inferred from values between 0
and 1. `normalized_0_1` requires `widthMm` + `heightMm`; `pixels` also requires
`widthPx` + `heightPx`. Anything missing → `unavailable`, no measurement, and
`conclusion: 'inconclusive'`. Applied conversions are listed in
`coordinateSystem.conversions`; mm, pixels and normalized values are never mixed.

## Measurement method

`measurementMethod: "bounding_box_width"`, with `centerXMm`, `centerYMm`,
`boundingWidthMm`, `boundingHeightMm`, `areaMm2`, `aspectRatio`, `pointCount` and
the bounding-box extremes. No internal rounding. Valid as the main measurement for
straight bars (`barra_recta`) only — **not** a universal local width profile for
curved, tapered or capsule shapes; a warning is raised when `geometryClass` is not
`barra_recta`.

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
| technique | `region.stitch_type` + `plan.sequence[].stitchType` | stitching technique | — | adaptiveEngine / planner | yes | no | `'fill' \| 'satin' \| 'running_stitch'`; the engine never emits `'tatami'`; both sources reconciled |
| density | `region.density` + `plan.sequence[].density` | row spacing (fill) / column spacing (satin) | **mm** (`pipeline/types.js:107`, `regionBuilder.js:26`) | adaptiveEngine | yes | yes | equivalence with the Hatch "spacing" column **not verified** |
| stitch length | `region.stitch_length_mm` | stitch length | mm | adaptiveEngine | yes | yes | — |
| pull compensation | `region.pull_compensation` | pull compensation | mm | adaptiveEngine | yes | yes | `0` is a valid value |
| angle | `region.angle` = `region.fill_angle` + `plan.sequence[].optimalAngle` | stitch angle | degrees `[0,180)` | adaptiveEngine | yes | yes | `0` is a valid value; sources reconciled |
| underlay | `region.recommended_underlay` `{ enabled, type, density_mm, angle_deg }`, `region.underlay`, `plan.sequence[].underlay` | underlay | mm / degrees | adaptiveEngine ← `eieUnderlay` | yes | yes | real types: `centre_walk`, `zigzag_centre`, `edge_walk`, `edge_walk_zigzag`, `zigzag`, `full_coverage`; planner: `center_run` / `edge_run`; **no lengths**, **never two entries** |
| colour | `region.color` / `region.hex` | hex colour | — | regionNormalize | yes | yes | never a matching criterion |
| design dimensions | `config.width_mm`, `config.height_mm` (evaluator: `design.widthMm/heightMm`) | sheet size | mm | pipeline config | yes | no | the pipeline defaults to 100×100 — never assumed here |
| plan entry | `plan.sequence[]` `{ regionId, stitchType, optimalAngle, density, underlay, layerOrder, estimatedStitches, areaMm2 }` | planner decision | mm / degrees | stitch_planner | yes | yes | linked by `regionId`; duplicates never overwritten |

### Unavailable data (verified absent, never invented)

| Requested data | Status | Reason |
|---|---|---|
| spacing mode (auto/manual) | `unavailable` | exhaustive search over `src/lib` + `src/tests`: **0** occurrences of `spacing_mode` / `spacingMode` |
| spacing value (mm) | `unavailable` | no spacing field; only `density`, unverified equivalence |
| automatic split | `unavailable` | **0** occurrences of `auto_split` / `autoSplit` |
| underlay lengths | `unavailable` | `eieUnderlay` returns `type` / `density_mm` / `angle_deg` only |
| secondary underlay | `unavailable` | a single combined type is emitted, never two |
| coordinate space metadata | `unavailable` | no region or result declares it |

### Ambiguous fields (reported, never resolved silently)

`region_class` (several vocabularies), absence of `region.type` on fills, `density`
semantics vs Hatch spacing, `full_coverage` underlay (no equivalent → `unknown`),
`name` / `color` / array order (never criteria).

## Extracted vs derived vs inferred

* **Extracted** — read from verified fields (`technique`, `densityMm`,
  `pullCompensationMm`, `stitchAngleDeg`, underlay type/enabled/density).
* **Derived** — computed with a documented formula and `derived: true` (`widthMm`,
  `heightMm`, coordinate conversions).
* **Inferred** — not produced. Missing or unverifiable data is `unavailable`,
  `unknown` or `conflict` with a reason.

Every value carries `rawValue`, `normalizedValue`, `sourceField`, `availability`,
`derived`, `unit` and `reason`. `0` and `false` are values: `value || null` is never used.

## Seed reference

Read for information only: `observation.measured`, `configuration.documented`,
`input`, `ruleScope`. `candidateRules` are **never** expected truth. Hatch values
never fill gaps in the engine result. `spacingMm: null` on automatic spacing means
"not documented", never zero.

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
// report.cases[0].actual.spacing.spacingMm.availability === 'unavailable'
```

## Remaining limitations

* Nothing is measured without a declared coordinate space.
* Spacing mode, spacing value and automatic split do not exist in the engine; the
  density ↔ spacing equivalence is still unvalidated.
* Bounding-box width is only the main measurement for straight bars.
* Merge detection is a diagnostic; it cannot prove that a region merges two objects.
* Region ids are not guaranteed unique; affected candidates are treated as
  non-stable identities instead of being attributed values.
* The 78 A_WIDTHS screenshots stay unmapped, so no visual cross-check is possible.
* No physical validation exists for this sheet; no criterion is applied and no
  pass/fail is emitted.
* No baseline has been executed: nothing here says anything about engine quality.

## Future baseline execution requirements

1. A **stable source file** for `HATCH-A-WIDTHS-EXACT-100x80mm-300dpi.png`
   (permanent storage plus SHA-256).
2. Design dimensions fixed at **100 × 80 mm**, declared with `widthPx` / `heightPx`
   and the coordinate space used.
3. The exact configuration: digitize mode, fabric profile (Pure Cotton), adaptive
   engine on/off, contour safe mode, experimental flags, machine settings.
4. A complete capture of the result: `regions`, `plan`, `optimized`, `commands`,
   `meta`, `config`, `stageLog` — as plain data — plus the explicit
   `options.regionSource` to be evaluated.
5. The resulting regions / context stored alongside the run for reproducibility.
6. The base engine version (and EIE version) used for the run.