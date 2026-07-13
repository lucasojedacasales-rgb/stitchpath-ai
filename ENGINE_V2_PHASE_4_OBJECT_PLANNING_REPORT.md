# Engine V2 Phase 4 Object Planning Report

- Active branch: `engine-v2`
- Starting commit: `168efcc587a4983131e358597fff207226a8e32d`
- Ending commit: commit containing this report; exact immutable hash is reported after commit creation
- Repository: `C:\Users\lucas\Documents\Codex\stitchpath-engine-v2-clean`
- Previous test count: 145
- New test count: 114
- Total test count: 259
- Engine V2 tests: 25 files, 259 tests passed
- Full tests: 25 files, 259 tests passed
- Engine V2 scoped lint: passed
- Global lint: existing 25 unused-import errors remain in protected application files; none were modified
- Build result: passed
- `realReferenceFixtureAvailable=false`

## Files Created

- `src/lib/engineV2/semantics/sourceSemanticVocabulary.js`
- `src/lib/engineV2/planning/embroideryPlanningModel.js`
- `src/lib/engineV2/planning/planningConfig.js`
- `src/lib/engineV2/planning/normalizedToMillimeterGeometry.js`
- `src/lib/engineV2/planning/outlineEligibility.js`
- `src/lib/engineV2/planning/embroideryRolePlanner.js`
- `src/lib/engineV2/planning/dependencyPlanner.js`
- `src/lib/engineV2/planning/objectPlanningPipeline.js`
- `src/lib/engineV2/planning/objectPlanningValidation.js`
- `src/lib/engineV2/planning/objectPlanningDiagnostics.js`
- `src/lib/engineV2/fixtures/multilingualSemanticFixture.js`
- `src/lib/engineV2/fixtures/embroideryPlanningFixture.js`
- `src/lib/engineV2/fixtures/outlineEligibilityFixture.js`
- `src/lib/engineV2/fixtures/planningDependenciesFixture.js`
- `src/lib/engineV2/fixtures/planningAmbiguityFixture.js`
- `src/lib/engineV2/__tests__/multilingualSemanticEvidence.test.js`
- `src/lib/engineV2/__tests__/normalizedToMillimeterGeometry.test.js`
- `src/lib/engineV2/__tests__/outlineEligibility.test.js`
- `src/lib/engineV2/__tests__/embroideryRolePlanner.test.js`
- `src/lib/engineV2/__tests__/dependencyPlanner.test.js`
- `src/lib/engineV2/__tests__/objectPlanningPipeline.test.js`
- `src/lib/engineV2/__tests__/objectPlanningValidation.test.js`
- `src/lib/engineV2/__tests__/objectPlanningDiagnostics.test.js`
- `ENGINE_V2_PHASE_4_OBJECT_PLANNING_REPORT.md`

## Files Modified

- `src/lib/engineV2/semantics/sourceSemanticEvidence.js`: controlled multilingual vocabulary integration and planning-only outline evidence.
- `src/lib/engineV2/index.js`: stable Phase 4 public API.
- `src/lib/engineV2/README.md`: Phase 4 contracts and deferred production boundaries.

## Vocabulary Verification

- Equivalent English and Spanish labels map to the same artwork concepts.
- Accented `línea` and `vacío` normalize safely while exact source values and original tokens remain recorded.
- Space, hyphen, and underscore forms of controlled compounds are accepted.
- `handmade`, `backgrounder`, `bodywork`, and `eyelash` do not produce substring matches.
- Outline-intent and stitch-planning words remain evidence only and do not overwrite artwork semantic roles.
- Existing Phase 3 English behavior remains covered and passing.

## Fixture Planning Results

| Synthetic fixture | Result |
| --- | --- |
| English/Spanish body | both support `primary_shape` |
| English/Spanish face | both support `secondary_shape` |
| English/Spanish eye and mouth | all support `internal_feature` |
| Spanish línea, nariz, mejilla, pie, mano | controlled concepts recognized with accents preserved |
| Spanish fondo and brillo | `background` and `highlight` recognized |
| Explicit English outline / Spanish contorno | planning-only outline intent recorded |
| Dark external without outline evidence | rejected as outline |
| Outline without dark-stroke support | rejected as outline |
| Explicit supported border | accepted as one region-backed `outer_outline` proposal |
| Eye labelled outline | rejected because facial details cannot become outlines |
| Negative space | explicitly excluded with stitch type `none` |
| Background | excluded by default; included only by explicit config |
| Unknown low-confidence region | retained as `manual_review` |
| Disconnected same-color regions | two separate proposals, never merged |
| Nested fill/internal feature | nearest stitchable containing fill dependency added |
| Three-level structure | deterministic ancestor chain and execution layers |
| Overlapping siblings | no arbitrary sibling dependency |
| Explicit hole | converted and preserved in `holesMm` |
| Generic mascot planning structure | complete decisions with no silent drops |

The primary seven-region planning fixture produced 7 decisions: 4 active, 2 excluded, and 1 manual review. Role distribution was `base_fill=1`, `foreground_fill=1`, `internal_detail=1`, `highlight=1`, `excluded=2`, and `manual_review=1`. Proposed stitch-type distribution was `tatami=3`, `running=1`, `manual=1`, and `none=2`.

## Outline Eligibility Results

- Dark regions evaluated in the primary fixture: 1
- Dark regions rejected as outlines in the primary fixture: 1
- Explicit supported border fixture: accepted
- Dark region without intent: rejected
- Explicit outline without support: rejected
- Facial outline conflict: rejected
- Geometry derived from a fill boundary: rejected
- Explicit nested inner outline: accepted conservatively
- Disconnected explicit outline regions remain separate
- `syntheticOutlineProposalCount=0`

## Dependency Results

- Nested foreground fill depends on its containing base fill.
- Internal detail and highlight depend on the nearest stitchable containing fill.
- Outer outline dependencies cover active non-outline proposals in its connected component.
- Excluded and manual-review proposals do not become automatic dependencies.
- Overlapping siblings receive no dependency based on array order.
- Input reversal produces the same proposal order and execution layers.
- `dependencyCount=3` for the primary planning fixture.
- `dependencyCycleCount=0`.

## Safety And Coverage

- `decisionCoveragePercent=100`
- `silentRegionDropCount=0`
- Deterministic plan verification: passed
- Input mutation verification: passed
- Normalized-to-millimetre conversion uses independent declared dimensions without centering, offsets, clamping, or guessing.
- Invalid dimensions and out-of-range geometry produce explicit validation errors.
- Proposal validation rejects thread fields, machine colors, stitch arrays, commands, unsupported outlines, unknown dependencies, self-dependencies, cycles, and incomplete coverage.

## Required Final Values

- `defaultBehaviorChanged=false`
- `applicationImportsEngineV2=false`
- `v2InvokedByApplication=false`
- `objectProposalsGenerated=true`
- `embroideryObjectsMaterialized=false`
- `threadIdsAssigned=false`
- `syntheticOutlinesGenerated=0`
- `stitchCoordinatesGenerated=false`
- `commandGenerationAdded=false`
- `machineAdaptationAdded=false`
- `encodingAdded=false`
- `decisionCoveragePercent=100`
- `silentRegionDropCount=0`
- `dependencyCycleCount=0`
- `protectedFilesTouched=[]`
- `V1FilesTouched=[]`

## Known Limitations

- All Phase 4 fixtures are synthetic; no suitable saved real `RegionV2` reference fixture exists in the repository.
- Proposals recommend roles and stitch types but do not materialize production `EmbroideryObjectV2` records.
- Structural dependencies are not a global sequence, color grouping, or travel route.
- Outline eligibility requires existing region geometry and supported topology; it does not infer missing contours.
- Ambiguous geometry and low-confidence semantics deliberately remain manual review.

## Recommended Phase 5

Add an explicit proposal-review/materialization boundary that converts only validated, accepted proposals into immutable embroidery objects. Keep thread assignment, stitch generation, global routing, machine adaptation, and encoding as later isolated phases.

## Git Diff Summary

- Scope: 24 files created, 3 files modified.
- Protected files touched: none.
- Exact staged diff: 27 files changed, 1,363 insertions, 55 deletions.
