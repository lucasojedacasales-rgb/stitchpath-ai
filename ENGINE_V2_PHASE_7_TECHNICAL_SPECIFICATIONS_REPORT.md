# Engine V2 Phase 7 Technical Specifications Report

- Active branch: `engine-v2`
- Starting commit: `62eb8f286cb6e24d3166d49d278db2575537d5f8`
- Ending commit: commit containing this report; exact immutable hash is reported after commit creation
- Repository: `C:\Users\lucas\Documents\Codex\stitchpath-engine-v2-clean`
- Previous test count: 600
- New test count: 236
- Total test count: 836
- Engine V2 tests: 54 files, 836 tests passed
- Full tests: 54 files, 836 tests passed
- Engine V2 scoped lint: passed
- Build result: passed
- `realReferenceFixtureAvailable=false`

## Files Created

- `src/lib/engineV2/technical/technicalPlanningModel.js`
- `src/lib/engineV2/technical/technicalPlanningConfig.js`
- `src/lib/engineV2/technical/materialProfileModel.js`
- `src/lib/engineV2/technical/objectGeometryMetrics.js`
- `src/lib/engineV2/technical/fillAnglePlanner.js`
- `src/lib/engineV2/technical/underlayPlanner.js`
- `src/lib/engineV2/technical/pullCompensationPlanner.js`
- `src/lib/engineV2/technical/entryExitCandidatePlanner.js`
- `src/lib/engineV2/technical/stitchParameterPlanner.js`
- `src/lib/engineV2/technical/technicalPlanningPipeline.js`
- `src/lib/engineV2/technical/technicalPlanningValidation.js`
- `src/lib/engineV2/technical/technicalPlanningDiagnostics.js`
- `src/lib/engineV2/fixtures/tatamiTechnicalFixture.js`
- `src/lib/engineV2/fixtures/satinTechnicalFixture.js`
- `src/lib/engineV2/fixtures/runningTechnicalFixture.js`
- `src/lib/engineV2/fixtures/outlineTechnicalFixture.js`
- `src/lib/engineV2/fixtures/materialProfilesFixture.js`
- `src/lib/engineV2/fixtures/entryExitCandidateFixture.js`
- `src/lib/engineV2/fixtures/technicalBlockingFixture.js`
- `src/lib/engineV2/fixtures/genericMascotTechnicalFixture.js`
- `src/lib/engineV2/__tests__/technicalPlanningModel.test.js`
- `src/lib/engineV2/__tests__/technicalPlanningConfig.test.js`
- `src/lib/engineV2/__tests__/materialProfileModel.test.js`
- `src/lib/engineV2/__tests__/objectGeometryMetrics.test.js`
- `src/lib/engineV2/__tests__/fillAnglePlanner.test.js`
- `src/lib/engineV2/__tests__/underlayPlanner.test.js`
- `src/lib/engineV2/__tests__/pullCompensationPlanner.test.js`
- `src/lib/engineV2/__tests__/entryExitCandidatePlanner.test.js`
- `src/lib/engineV2/__tests__/stitchParameterPlanner.test.js`
- `src/lib/engineV2/__tests__/technicalPlanningPipeline.test.js`
- `src/lib/engineV2/__tests__/technicalPlanningValidation.test.js`
- `src/lib/engineV2/__tests__/technicalPlanningDiagnostics.test.js`
- `ENGINE_V2_PHASE_7_TECHNICAL_SPECIFICATIONS_REPORT.md`

## Files Modified

- `src/lib/engineV2/index.js`: exports stable Phase 7 APIs.
- `src/lib/engineV2/README.md`: documents technical planning and deferred-stage boundaries.

## Material Profile Verification

Five immutable internal profiles validate successfully: generic medium woven, lightweight woven, knit/stretch, heavy woven, and high-loft. Explicit custom profiles are validated for category, stability, stretch, thickness, surface, positive technical defaults, metadata, and forbidden machine fields. No profile claims manufacturer certification or includes hoop, encoder, machine, or CE01 settings.

All default embroidery planning numbers are centralized in `materialProfileModel.js` and consumed through resolved configuration. Fast, balanced, and detailed profiles adjust candidate resolution only; they do not select engines or enable physical generation.

## Geometry Metric Verification

- Millimetre area, perimeter, bounds, aspect ratio, compactness, centroid, and PCA-style axes: deterministic.
- Explicit hole area is subtracted from effective area.
- Valid interior points are outside explicit holes.
- Principal-axis and width estimates are stable under polygon orientation reversal.
- Width measurements are explicitly estimates, not satin rails or exact column widths.
- Degenerate, self-intersecting, non-finite, and invalid-hole geometry is reported.
- No geometry is smoothed, simplified, offset, rewritten, or mutated.

## Fixture Results

Tatami fixture:

- medium fill: planned and generator-ready
- explicit-hole fill: planned and generator-ready with hole preservation
- tiny fill: blocked below minimum area
- degenerate fill: blocked for invalid geometry
- planned underlay: edge run plus sparse tatami lattice

Satin fixture:

- valid narrow column: planned and generator-ready with center-run underlay
- below-minimum width: blocked
- above-maximum width: blocked
- excessive estimated width variation: blocked
- no rails, rungs, or physical underlay generated

Running and outline fixtures:

- genuine open detail: planned and generator-ready using source endpoints
- closed region-backed outline: planned and generator-ready using boundary start candidates
- broad filled polygon marked running: `manual_required`; no centerline invented
- manual stitch object: `manual_required`
- disconnected outlines remain separate objects and candidate sets

## Generic Mascot Technical Plan

The seven-object, five-thread synthetic fixture produces:

- source final objects: 7
- technical specifications: 7
- planned: 7
- manual-required: 0
- blocked: 0
- tatami ready: 2
- satin ready: 1
- running ready: 4
- generator not ready: 0
- underlay planned: 3
- pull compensation planned: 3
- fill angles planned: 3
- entry candidates: 27
- exit candidates: 27
- rejected candidates: 0
- structural dependency cycles: 0
- `technicalDispositionCoveragePercent=100`
- `silentFinalObjectDropCount=0`
- `duplicateTechnicalSpecificationCount=0`

Underlay distribution:

- edge run plus tatami lattice: 2 objects
- center run: 1 object
- disabled: 4 running objects

Fill-angle distribution:

- perpendicular to principal axis: 1 base fill
- alternate from structural parent: 2 dependent fill/satin objects
- not applicable: 4 running objects

Pull-compensation distribution:

- axis-aware: 3 tatami/satin objects
- none: 4 running objects

## Preservation And Safety

- deterministic planning: passed
- input mutation detection: false
- `objectGeometryModified=false`
- `objectHolesModified=false`
- `objectVisualColorsModified=false`
- `threadIdsModified=false`
- `rolesModified=false`
- `stitchTypesModified=false`
- `layersModified=false`
- `dependenciesModified=false`
- `dependencyCycleCount=0`
- `threadBlocksCreated=0`
- `physicalStitchesGenerated=false`
- `physicalUnderlayGenerated=false`
- `finalEntryExitPairsSelected=false`
- `globalSequencingAdded=false`
- `travelOptimizationAdded=false`
- `canonicalCommandsGenerated=false`
- `machineAdaptationAdded=false`
- `encodingAdded=false`
- `defaultBehaviorChanged=false`
- `applicationImportsEngineV2=false`
- `v2InvokedByApplication=false`
- `technicalSpecificationsCreated=true`
- `V1 files touched=false`
- `protectedFilesTouched=[]`

## Scope Verification

- All implementation changes are confined to `src/lib/engineV2` and this report.
- No V1 pipeline, application component, encoder, exporter, simulator, machine adapter, backend function, or routing file was modified.
- No application import of Engine V2 was added.
- No suitable real V2 reference fixture was found; all Phase 7 fixtures are explicitly synthetic.

## Known Limitations

- Width analysis is a deterministic estimate and does not construct satin rails.
- Material profiles are internal assumptions, not certified production recipes.
- Fill angles, underlay, and compensation are plans only.
- Entry and exit candidates are not globally selected and contain no travel route.
- Thread blocks, global sequencing, travel optimization, physical stitches, commands, machine adaptation, and encoding remain deferred.
- Engine V2 remains disconnected from the application.

## Recommended Phase 8

Create structural global object sequencing and thread-block planning from final objects plus Phase 7 specifications. Select entry/exit candidates globally while preserving dependencies, but continue to defer physical stitch generation, machine adaptation, and encoding.

## Exact Git Diff Summary

- 35 files changed, 1469 insertions, 0 deletions.
