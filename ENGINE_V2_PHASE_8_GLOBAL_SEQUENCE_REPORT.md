# Engine V2 Phase 8 Global Sequence Report

- Active branch: `engine-v2`
- Starting commit: `ae3b93a29cf5dde4f81275424441cbf2b9041536`
- Ending commit: commit containing this report; exact immutable hash is reported after commit creation
- Repository: `C:\Users\lucas\Documents\Codex\stitchpath-engine-v2-clean`
- Previous test count: 836
- New test count: 194
- Total test count: 1030
- Engine V2 tests: 63 files, 1030 tests passed
- Full tests: 63 files, 1030 tests passed
- Engine V2 scoped lint: passed
- Build result: passed
- `realReferenceFixtureAvailable=false`

## Files Created

- `src/lib/engineV2/sequencing/sequencePlanningModel.js`
- `src/lib/engineV2/sequencing/sequencePlanningConfig.js`
- `src/lib/engineV2/sequencing/sequenceCostModel.js`
- `src/lib/engineV2/sequencing/candidatePairSelector.js`
- `src/lib/engineV2/sequencing/dependencyAwareScheduler.js`
- `src/lib/engineV2/sequencing/threadBlockBuilder.js`
- `src/lib/engineV2/sequencing/globalSequencePlanner.js`
- `src/lib/engineV2/sequencing/sequencePlanningValidation.js`
- `src/lib/engineV2/sequencing/sequencePlanningDiagnostics.js`
- `src/lib/engineV2/fixtures/simpleSequenceFixture.js`
- `src/lib/engineV2/fixtures/threadChangeOptimizationFixture.js`
- `src/lib/engineV2/fixtures/dependencyThreadRevisitFixture.js`
- `src/lib/engineV2/fixtures/candidateTravelFixture.js`
- `src/lib/engineV2/fixtures/unscheduledDependencyFixture.js`
- `src/lib/engineV2/fixtures/sequenceTieFixture.js`
- `src/lib/engineV2/fixtures/largeSequenceFixture.js`
- `src/lib/engineV2/fixtures/genericMascotSequenceFixture.js`
- `src/lib/engineV2/__tests__/sequencePlanningModel.test.js`
- `src/lib/engineV2/__tests__/sequencePlanningConfig.test.js`
- `src/lib/engineV2/__tests__/sequenceCostModel.test.js`
- `src/lib/engineV2/__tests__/candidatePairSelector.test.js`
- `src/lib/engineV2/__tests__/dependencyAwareScheduler.test.js`
- `src/lib/engineV2/__tests__/threadBlockBuilder.test.js`
- `src/lib/engineV2/__tests__/globalSequencePlanner.test.js`
- `src/lib/engineV2/__tests__/sequencePlanningValidation.test.js`
- `src/lib/engineV2/__tests__/sequencePlanningDiagnostics.test.js`
- `ENGINE_V2_PHASE_8_GLOBAL_SEQUENCE_REPORT.md`

## Files Modified

- `src/lib/engineV2/index.js`
- `src/lib/engineV2/README.md`

## Sequencing Configuration

```json
{
  "strategy": "dependency_thread_travel",
  "algorithm": "auto",
  "exactSearchObjectLimit": 9,
  "beamWidth": 128,
  "maximumExpandedStates": 200000,
  "maximumEntryCandidatesPerObject": 8,
  "maximumExitCandidatesPerObject": 8,
  "minimizeThreadChanges": true,
  "minimizeThreadRevisits": true,
  "minimizeEstimatedTravel": true,
  "allowDependencyRequiredThreadRevisit": true,
  "allowTravelOnlyThreadRevisit": false,
  "blockOnUnscheduledDependency": true,
  "selectFinalEntryExitPairs": true,
  "createThreadBlocks": true,
  "startAnchorMm": null,
  "endAnchorMm": null,
  "blackLast": false,
  "rolePriority": [],
  "forceOutlinesLast": false,
  "generatePhysicalStitches": false,
  "generatePhysicalUnderlay": false,
  "generateCanonicalCommands": false,
  "machineAdaptation": false,
  "encoding": false,
  "conservativeMode": true
}
```

The cost is compared lexicographically as dependency violations, unscheduled schedulable objects, thread changes, thread revisits, estimated Euclidean travel, and stable signature. No weighted score is used.

## Exact Search and Generic Mascot

- Fixture provenance: deterministic synthetic fixture; not Yoshi, Wilcom, or a real design
- Final objects: 7
- Dispositions: 7 scheduled, 0 manual-required, 0 blocked
- Threads: 5
- Thread blocks: 5
- Algorithm requested: `auto`
- Algorithm used: `exact`
- `optimalityGuaranteed=true`
- Expanded states: 823
- Pruned states: 761
- Maximum state limit reached: false
- Deterministic repeat verification: passed

Execution order:

1. `object:mascot-base`
2. `object:mascot-foreground`
3. `object:mascot-satin`
4. `object:mascot-highlight`
5. `object:mascot-dark`
6. `object:mascot-inner-outline`
7. `object:mascot-outer-outline`

Thread-block order:

1. `thread:synthetic:green`: `object:mascot-base`
2. `thread:synthetic:white`: `object:mascot-foreground`
3. `thread:synthetic:red`: `object:mascot-satin`
4. `thread:synthetic:yellow`: `object:mascot-highlight`
5. `thread:synthetic:black`: `object:mascot-dark`, `object:mascot-inner-outline`, `object:mascot-outer-outline`

Selected entry/exit candidate IDs:

- `object:mascot-base`: `boundary_vertex:0` to `interior_point:4`
- `object:mascot-foreground`: `interior_point:4` to `interior_point:4`
- `object:mascot-satin`: `interior_point:4` to `boundary_vertex:2`
- `object:mascot-highlight`: `boundary_vertex:1` to `boundary_vertex:0`
- `object:mascot-dark`: `boundary_vertex:1` to `boundary_vertex:0`
- `object:mascot-inner-outline`: `cardinal_boundary:0` to `cardinal_boundary:1`
- `object:mascot-outer-outline`: `cardinal_boundary:1` to `cardinal_boundary:0`

Estimated transition distances in execution order: `0.500000`, `1.500000`, `6.324555`, `4.123106`, `4.472136`, `11.313708` mm.

- Baseline thread changes: 5
- Optimized thread changes: 4
- Baseline thread revisits: 1
- Optimized thread revisits: 0
- Repeated-thread reasons: none required in the generic mascot optimum
- Baseline estimated travel: 55.261750 mm
- Optimized estimated travel: 28.233505 mm
- Estimated travel reduction: 48.909498%

## Revisit Fixture

The synthetic dependency chain green -> red -> green requires one thread revisit. The final block records `dependency_gated_revisit`; no object is merged and no dependency is removed.

- Objects: 3
- Thread blocks: 3
- Thread changes: 2
- Thread revisits: 1
- Repeated-thread reason count: 1
- Dependency violations: 0

## Beam Search Fixture

- Fixture provenance: deterministic synthetic fixture above the exact-search limit
- Objects: 10
- Threads: 5
- Algorithm used: `beam`
- `optimalityGuaranteed=false`
- Expanded states: 60750
- Pruned states: 59782
- Thread changes: 4
- Thread revisits: 0
- Dependency violations: 0
- Deterministic repeat verification: passed
- Warning: beam search is bounded and does not claim a global optimum

The beam result uses fewer thread blocks than the stable-ID diagnostic baseline, but its estimated Euclidean travel is higher. This is expected under the required lexicographic policy because thread changes are minimized before estimated travel.

## Coverage and Preservation

- `defaultBehaviorChanged=false`
- `applicationImportsEngineV2=false`
- `v2InvokedByApplication=false`
- `globalSequenceCreated=true`
- `threadBlocksCreated=true`
- `finalEntryExitPairsSelected=true`
- `sequenceDispositionCoveragePercent=100`
- `silentFinalObjectDropCount=0`
- `duplicateDispositionCount=0`
- `dependencyViolationCount=0`
- `dependencyCycleCount=0`
- `selectedEntryExitPairCount=scheduledObjectCount`
- `objectsWithoutSelectedEntry=0`
- `objectsWithoutSelectedExit=0`
- `objectGeometryModified=false`
- `objectHolesModified=false`
- `objectVisualColorsModified=false`
- `threadIdsModified=false`
- `rolesModified=false`
- `stitchTypesModified=false`
- `layersModified=false`
- `dependenciesModified=false`
- `technicalSpecificationsModified=false`
- Input mutation verification: passed by before/after snapshots and source fingerprints
- Object preservation verification: passed
- Technical-specification preservation: passed
- `physicalStitchesGenerated=false`
- `physicalUnderlayGenerated=false`
- `jumpCommandsGenerated=false`
- `trimCommandsGenerated=false`
- `colorChangeCommandsGenerated=false`
- `canonicalCommandsGenerated=false`
- `machineAdaptationAdded=false`
- `encodingAdded=false`
- V1 files touched: none
- Protected files touched: `[]`

## Known Limitations

- Estimated transitions are straight-line diagnostics between selected candidates, not physical stitch or machine routes.
- Beam search is deterministic but bounded and cannot guarantee optimality.
- The planner does not create explicit sequence overrides; `explicit_sequence_override` remains reserved.
- There is no suitable real V2 sequence fixture in the repository, so all Phase 8 fixtures are labelled synthetic.
- Entry/exit quality is limited to valid candidates supplied by Phase 7.
- Phase 8 intentionally does not decide jumps, trims, color-change commands, or machine behavior.

## Recommended Phase 9

Add machine-independent physical stitch-path generation that consumes the immutable Phase 8 sequence without changing object order, selected candidate identities, thread blocks, or structural dependencies. Keep canonical command compilation and machine adaptation as later, separate boundaries.

## Exact Git Diff Summary

- Scope: `src/lib/engineV2/**` and `ENGINE_V2_PHASE_8_GLOBAL_SEQUENCE_REPORT.md` only
- Created: 27 files
- Modified: 2 files
- Diff stat: 29 files changed, 1643 insertions
- Protected files touched: none
