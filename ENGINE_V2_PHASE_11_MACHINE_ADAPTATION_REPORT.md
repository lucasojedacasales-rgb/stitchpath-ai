# Engine V2 Phase 11 Machine Adaptation Report

## Repository and verification

- activeBranch: `engine-v2`
- startingCommit: `4f6289e6ed0f31d5f39bd39b881fe1190670fba4`
- endingCommit: commit containing this report; immutable hash is reported after commit/push
- previousTestCount: `1438`
- newTestCount: `180`
- totalTestCount: `1618`
- totalTestFileCount: `95`
- phase11TestFileCount: `10`
- engineV2TestsPassed: `true` (`1618/1618`)
- repositoryTestsPassed: `true` (`1618/1618`)
- buildResult: `passed` (`2021` modules transformed)
- scopedLintPassed: `true`
- repositoryWideLintPassed: `false`
- repositoryWideLintNote: `25` known pre-existing unused-import errors outside Engine V2; protected files are not modified
- realReferenceFixtureAvailable: `false`

## Files

Created ten modules under `src/lib/engineV2/machineAdaptation`: machine profile, configuration, coordinate transform, absolute quantizer, integer movement splitter, trim adapter, adapted models, command adapter, validation, and diagnostics. Nine deterministic synthetic fixtures and ten Phase 11 test files were added. Modified files are limited to `src/lib/engineV2/index.js` and `src/lib/engineV2/README.md`.

## Built-in profile and validation

`generic_dst` uses 0.1 mm integer units, unbounded stitch and jump deltas, no hoop, initial units `(0,0)`, intent-only trims, color changes and end support, and an identity preserve-origin transform. It is internal preparation only, not manufacturer certified, and declares no encoder contract. Invalid IDs, resolution, movement limits, bounds, starting positions, transforms, non-uniform scaling, automatic fit, encoding, encoder invocation, CE01 logic, and partial streams are rejected.

## Transform and quantization fixtures

Identity, translation, positive and normalized negative rotation, X/Y inversion, explicit uniform scale, preserve-origin, design-center, and custom-origin transforms are deterministic and invertible within floating-point tolerance. There is no automatic fit, shrink, translation, or clipping.

Half-away-from-zero rounding returns `2` for `1.5` and `-2` for `-1.5`. Absolute transformed coordinates are quantized before deltas are derived, preventing accumulated rounding drift. The generic mascot maximum quantization error is `0.07071067811865826` mm and average error is `0.038128893398894935` mm.

## Movement splitting

The bounded stitch fixture maps a 50-unit source component into five stitch segments with maximum adapted component 10 and an exact final endpoint. The bounded jump fixture maps a 47-unit source component into four jump segments with maximum adapted component 12 and an exact final endpoint. Integer cumulative targets prevent floating drift and zero split segments; command types and lineage remain unchanged.

## Trim and hoop behavior

Native trim is preserved. Intent-only trim is preserved with `TRIM_INTENT_REQUIRES_ENCODER_OR_MACHINE_INTERPRETATION`. Unsupported trim either preserves with `TRIM_UNSUPPORTED_BUT_INTENT_PRESERVED` or blocks transactionally. Unknown capability preserves with a warning. Trim intent is never silently deleted.

Hoop checks cover transformed pre-quantization and dequantized post-quantization targets. Out-of-bounds output blocks transactionally by default or remains with a warning when explicitly configured. No automatic scaling, translation, compensation removal, or clipping occurs.

## Generic mascot adaptation

- machineProfileId: `generic_dst`
- coordinateResolutionMm: `0.1`
- sourceCanonicalCommandCount: `1550`
- adaptationSpanCount: `1550`
- canonicalCommandAdaptationCoveragePercent: `100`
- silentCanonicalCommandDropCount: `0`
- duplicateCanonicalCommandSpanCount: `0`
- adaptedCommandCount: `1550`
- source/adapted stitch commands: `1510 / 1510`
- source/adapted jump commands: `18 / 18`
- trimCommandCount: `17`
- colorChangeCommandCount: `4`
- endCommandCount: `1`
- splitSourceMovementCount: `0`
- generatedSplitSegmentCount: `0`
- stitchMovementSplitCount: `0`
- jumpMovementSplitCount: `0`
- maximumAdaptedStitchDeltaUnits: `48`
- maximumAdaptedJumpDeltaUnits: `350`
- transformedBoundsMm: `{ minX: 0, maxX: 30, minY: 0, maxY: 35 }`
- quantizedBoundsUnits: `{ minX: 0, maxX: 300, minY: 0, maxY: 350 }`
- outOfBoundsCoordinateCount: `0`
- preservedTrimIntentCount: `17`
- unsupportedTrimIntentCount: `0`

## Coverage and preservation

- commandOrderMutationCount: `0`
- threadBlockOrderMutationCount: `0`
- objectOrderMutationCount: `0`
- threadIdMutationCount: `0`
- commandTypeMutationCount: `0`
- trimIntentMutationCount: `0`
- colorChangeMutationCount: `0`
- canonicalCompilationMutationCount: `0`
- deterministicRepeatVerification: `true`
- defaultBehaviorChanged: `false`
- applicationImportsEngineV2: `false`
- v2InvokedByApplication: `false`
- V1FilesTouched: `false`
- protectedFilesTouched: `[]`

## Architectural boundary

- machineAdaptationApplied: `true`
- commandCoordinatesQuantized: `true`
- movementSplittingSupported: `true`
- trimIntentPreserved: `true`
- canonicalCommandsModified: `false`
- DSTEncoderInvoked: `false`
- DSBEncoderInvoked: `false`
- binaryOutputGenerated: `false`
- CE01LogicAdded: `false`
- encodingAdded: `false`

## Known limitations and Phase 12 recommendation

`generic_dst` intentionally supplies no exact movement limit, binary byte contract, manufacturer certification, or physical trim guarantee. Custom bounded profiles must provide validated limits. Quantization may collapse a very short canonical movement to a zero integer delta, but the canonical command and its span remain preserved. Hoop checks validate targets rather than swept-path containment.

Recommended Phase 12: add isolated encoder adapters that consume only validated machine-adapted streams, enforce exact format byte contracts and movement representations, and never reach back into artwork, object planning, physical stitch generation, canonical compilation, or machine adaptation.

## Git diff summary

The change creates 10 machine-adaptation modules, 9 deterministic synthetic fixtures, 10 test files with 180 tests, and this report. It modifies only the Engine V2 public index and README. No V1, application, export, simulator, CE01, DST, or DSB file changes.
