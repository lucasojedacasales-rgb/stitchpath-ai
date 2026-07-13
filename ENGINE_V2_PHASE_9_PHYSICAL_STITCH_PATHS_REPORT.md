# Engine V2 Phase 9 Physical Stitch Paths Report

## Repository and verification

- activeBranch: `engine-v2`
- startingCommit: `e2e074505fbff8bb903b2d4f4f420eee3739c391`
- endingCommit: commit containing this report; immutable hash is reported after commit/push because a commit cannot contain its own hash
- previousTestCount: `1030`
- newTestCount: `214`
- totalTestCount: `1244`
- phase9TestFiles: `13`
- phase9TargetedTestsPassed: `true` (`214/214`)
- changedScopeLintPassed: `true`
- repositoryWideLintPassed: `false` (25 pre-existing unused-import errors outside `src/lib/engineV2`)
- finalEngineV2Tests: `76` files and `1244` tests passed
- finalRepositoryTests: `76` files and `1244` tests passed
- buildResult: `passed` (`2021` modules transformed)
- realReferenceFixtureAvailable: `false`

## Files

Created implementation files:

- `src/lib/engineV2/stitchGeneration/physicalStitchModel.js`
- `src/lib/engineV2/stitchGeneration/physicalGenerationConfig.js`
- `src/lib/engineV2/stitchGeneration/stitchGeometry.js`
- `src/lib/engineV2/stitchGeneration/stitchLengthDistribution.js`
- `src/lib/engineV2/stitchGeneration/polygonScanlineClipper.js`
- `src/lib/engineV2/stitchGeneration/runningStitchGenerator.js`
- `src/lib/engineV2/stitchGeneration/tatamiStitchGenerator.js`
- `src/lib/engineV2/stitchGeneration/satinStitchGenerator.js`
- `src/lib/engineV2/stitchGeneration/physicalUnderlayGenerator.js`
- `src/lib/engineV2/stitchGeneration/objectPathAssembler.js`
- `src/lib/engineV2/stitchGeneration/physicalStitchPipeline.js`
- `src/lib/engineV2/stitchGeneration/physicalStitchValidation.js`
- `src/lib/engineV2/stitchGeneration/physicalStitchDiagnostics.js`

Created fixtures:

- `runningPhysicalFixture.js`
- `closedOutlinePhysicalFixture.js`
- `tatamiPhysicalFixture.js`
- `tatamiHolePhysicalFixture.js`
- `satinPhysicalFixture.js`
- `satinBlockingFixture.js`
- `underlayPhysicalFixture.js`
- `compensationPhysicalFixture.js`
- `pathDiscontinuityFixture.js`
- `physicalPointLimitFixture.js`
- `genericMascotPhysicalFixture.js`

Created tests:

- `physicalStitchModel.test.js`
- `physicalGenerationConfig.test.js`
- `stitchGeometry.test.js`
- `stitchLengthDistribution.test.js`
- `polygonScanlineClipper.test.js`
- `runningStitchGenerator.test.js`
- `tatamiStitchGenerator.test.js`
- `satinStitchGenerator.test.js`
- `physicalUnderlayGenerator.test.js`
- `objectPathAssembler.test.js`
- `physicalStitchPipeline.test.js`
- `physicalStitchValidation.test.js`
- `physicalStitchDiagnostics.test.js`

Modified files:

- `src/lib/engineV2/index.js`
- `src/lib/engineV2/README.md`

## Physical generation configuration

The default balanced profile preserves Phase 7/8 decisions, enables physical top stitches and underlay, permits compensation only within a `0.6mm` envelope, and uses explicit high safety limits: `500000` points per object, `2000000` total points, and `100000` scanlines per object. All command, machine-adaptation, and encoding flags are false. Unknown configuration fields are retained in `extras`. Limits block rather than truncate; no hidden 12,000-point or stitch cap exists.

## Generator fixture results

| Fixture | Valid | Physical points | Physical stitches | Top stitches | Underlay stitches | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Open running | true | 9 | 6 | 6 | 0 | Source vertices and selected endpoints preserved; no centerline invented |
| Tatami rectangle | true | 257 | 205 | 140 | 65 | 40 clipped rows; approximate coverage 0.933333 |
| Tatami with hole | true | 261 | 192 | 120 | 72 | 13 split rows; zero hole crossings |
| Satin column | true | 72 | 68 | 34 | 34 | 35 cross-sections; center-run underlay |

Running generation preserves open source vertices and endpoints. Closed outlines retain closed source geometry; distinct closed anchors produce complementary arcs. Tatami uses the Phase 7 angle, spacing, stitch-length bounds, stagger, edge inset, and compensation plan. Satin uses alternating cross-sections and blocks unsupported width, branching, and hole cases without tatami fallback. Underlay follows the Phase 7 sequence and remains inside the same object path and thread.

Compensation changes generated endpoints only. The generic fixture contains `249` compensation-adjusted points while source geometry fingerprints remain unchanged. The explicit-hole fixture reports one hole, `0` hole-crossing stitch segments, and `0` invalid outside points. Hole boundaries are not compensated as outer boundaries.

Entry and exit anchors are explicit one-point subpaths. Every adjacent subpath pair has one diagnostic transition. Hole-crossing transitions are marked discontinuous and are never converted into hidden straight stitches or commands.

Both object-level and total-point limit fixtures produce one blocked disposition with `PHYSICAL_GENERATION_LIMIT_EXCEEDED`, zero accepted object paths, zero truncations, and zero partially accepted failed paths.

## Generic mascot physical plan

Execution order:

1. `object:mascot-base`
2. `object:mascot-foreground`
3. `object:mascot-satin`
4. `object:mascot-highlight`
5. `object:mascot-dark`
6. `object:mascot-inner-outline`
7. `object:mascot-outer-outline`

Thread-block references are preserved exactly: green/base, white/foreground, red/satin, yellow/highlight, and black/dark plus two separate outline objects.

| Object | Generator | Points | Top stitches | Underlay stitches | Subpaths | Discontinuities | Length mm |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `object:mascot-base` | tatami | 1028 | 693 | 236 | 99 | 98 | 2834.729187 |
| `object:mascot-foreground` | tatami | 350 | 210 | 91 | 49 | 48 | 883.188054 |
| `object:mascot-satin` | satin | 52 | 24 | 24 | 4 | 3 | 91.762765 |
| `object:mascot-highlight` | running | 5 | 2 | 0 | 3 | 2 | 4.472136 |
| `object:mascot-dark` | running | 5 | 2 | 0 | 3 | 2 | 4.472136 |
| `object:mascot-inner-outline` | running | 32 | 28 | 0 | 4 | 3 | 64.000000 |
| `object:mascot-outer-outline` | running | 64 | 60 | 0 | 4 | 3 | 130.000000 |

Aggregate diagnostics:

- physicalDispositionCoveragePercent: `100`
- silentScheduledObjectDropCount: `0`
- duplicatePhysicalDispositionCount: `0`
- sourceScheduledObjectCount: `7`
- generatedObjectPathCount: `7`
- manualRequiredCount: `0`
- blockedCount: `0`
- generatorDistribution: `{ running: 4, tatami: 2, satin: 1 }`
- physicalSubpathCount: `166`
- physicalDiscontinuityCount: `159`
- physicalPointCount: `1536`
- physicalStitchCount: `1370`
- topPointCount: `1138`
- topStitchCount: `1019`
- underlayPointCount: `384`
- underlayStitchCount: `351`
- minimumGeneratedStitchLengthMm: `0.3999999999999986`
- maximumGeneratedStitchLengthMm: `3.4234485537247368`
- averageGeneratedStitchLengthMm: `2.928922830962777`
- totalGeneratedStitchLengthMm: `4012.6242784190044`
- compensationAdjustedPointCount: `249`
- holeCrossingSegmentCount: `0`
- invalidOutsidePointCount: `0`

## Preservation and determinism

- selectedCandidateIdentityMutationCount: `0`
- entryAnchorMismatchCount: `0`
- exitAnchorMismatchCount: `0`
- deterministicRepeatVerification: `true`
- inputMutationVerification: `true`
- globalSequenceModified: `false`
- threadBlocksModified: `false`
- selectedEntryExitModified: `false`
- objectGeometryModified: `false`
- objectHolesModified: `false`
- objectVisualColorsModified: `false`
- threadIdsModified: `false`
- rolesModified: `false`
- stitchTypesModified: `false`
- layersModified: `false`
- dependenciesModified: `false`
- technicalSpecificationsModified: `false`

## Architectural boundary

- defaultBehaviorChanged: `false`
- applicationImportsEngineV2: `false`
- v2InvokedByApplication: `false`
- V1FilesTouched: `false`
- protectedFilesTouched: `[]`
- physicalStitchesGenerated: `true`
- physicalUnderlayGenerated: `true`
- pathsTruncated: `0`
- partialFailedPathsAccepted: `0`
- canonicalCommandsGenerated: `false`
- jumpCommandsGenerated: `false`
- trimCommandsGenerated: `false`
- colorChangeCommandsGenerated: `false`
- endCommandsGenerated: `false`
- machineAdaptationAdded: `false`
- encodingAdded: `false`

## Known limitations and Phase 10 recommendation

The scanline clipper targets valid simple polygons and explicit holes; it does not repair malformed or self-intersecting geometry. Coverage is an explicitly approximate geometric estimate. Satin rejects holes, branching, multiple cross-section intervals, and unsupported width variation. Underlay edge inset is conservative and geometry-derived. Discontinuities are diagnostic only and intentionally have no jump/trim/travel classification.

Recommended Phase 10: compile validated physical subpaths and discontinuities into universal canonical commands while preserving all Phase 8/9 identities, then validate command coverage before any machine adapter, hoop transform, CE01 policy, or DST/DSB encoder is introduced.

## Git diff summary

The change creates 13 physical-generation modules, 11 deterministic synthetic fixtures, 13 test files with 214 tests, and this report. It modifies only the Engine V2 public index and README. No V1, application, export, simulator, CE01, DST, or DSB file is changed.
