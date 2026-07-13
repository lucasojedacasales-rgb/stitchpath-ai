# Engine V2 Phase 12B DST Format Adapter Report

## Repository and verification

- activeBranch: `engine-v2`
- startingCommit: `8507cc370982133d1690683eb82507485eb64b45`
- endingCommit: commit containing this report; immutable hash is reported after commit/push
- previousTestCount: `1618`
- newTestCount: `323`
- totalTestCount: `1941`
- totalTestFileCount: `103`
- phase12BTestFileCount: `8`
- engineV2TestsPassed: `true` (`1941/1941`)
- repositoryTestsPassed: `true` (`1941/1941`)
- buildResult: `passed` (`2021` modules transformed)
- scopedLintPassed: `true` (`npx eslint src/lib/engineV2`)
- repositoryWideLintPassed: `not rerun`
- repositoryWideLintNote: `25` known pre-existing unused-import failures outside Engine V2 remain protected
- realReferenceFixtureAvailable: `false`; no tracked `.dst` or `.dsb` binary fixture exists

## Files and scope

Created eight modules under `src/lib/engineV2/formatAdaptation`, eight deterministic synthetic fixtures, eight Phase 12B test files, and this report. Modified files are limited to `src/lib/engineV2/index.js` and `src/lib/engineV2/README.md`.

- defaultBehaviorChanged: `false`
- applicationImportsEngineV2: `false`
- v2InvokedByApplication: `false`
- V1FilesTouched: `[]`
- protectedFilesTouched: `[]`
- existingEncoderFilesVerifiedUnchanged: `true`
- sourceStreamMutationCount: `0`
- encoderSourceFileModificationCount: `0`

## Existing encoder boundary

- existingEncoderEntryPoint: `buildDSTFromCommands(commands, { label, ce01Strict })`
- existingEncoderFile: `src/lib/dstDirectExport.js`
- existingRecordEncoderFile: `src/lib/dstEncoder.js`
- selectedCe01Strict: `true`
- ce01StrictExactEffect: appends the existing validated final EOF byte `0x1A`; it does not alter artwork, geometry, object order, thread order, movement records, or header interpretation
- outputType: existing `{ bytes: Uint8Array, blob: Blob, meta }`
- DSTEncoderInvoked: `true`
- DSBEncoderInvoked: `false`
- Base44Invoked: `false`
- binaryOutputGenerated: `true`
- applicationConnected: `false`

## Adapter contract

Phase 11 absolute integer units are accepted only at `0.1 mm` resolution and converted using `x=xUnits/10`, `y=yUnits/10`. There is no transform or requantization. The adapter limit is exactly `+/-121` units per axis. Cumulative integer target partitioning occurs before encoder invocation, preserves movement type and exact endpoint, and prevents unreported encoder-side movement splitting.

Default zero-stitch policy is `encode_penetration`; default zero-jump policy is `explicit_no_output`. A zero jump receives a complete source disposition and binary span with zero expected records and never reaches the trim convention. Default trim policy is `legacy_three_zero_jumps`: one source trim remains one legacy encoder trim command, and the unchanged encoder owns the exact 1-to-3 record expansion.

The initial thread is implicit. Source color changes preserve their authoritative `threadId` tokens and order. Exactly one final source END is required, and the encoder fallback is not relied upon. Invalid resolution, units, deltas, thread identity, color sequence, END structure, movement split, lineage, or conservative configuration rejects the transaction before encoder invocation.

## Synthetic fixture results

- positive/negative boundary: `+/-121` accepted without split
- positive/negative/diagonal long movement: deterministic, bounded, exact endpoint
- 350-unit jump: `3` bounded adapter records
- zero stitch encode policy: explicit penetration verified
- zero stitch block policy: transaction rejected
- zero jump default policy: explicit zero-output disposition verified
- zero jump block policy: transaction rejected
- one trim: `3` zero-jump records
- seventeen trims: `51` zero-jump records
- five thread blocks: `4` STOP records
- END records: `1`
- final EOF: present
- headerByteLength: `512`
- parserRoundtripPassed: `true`
- deterministicBytesVerified: `true`

## Generic mascot DST acceptance

- sourceMachineCommandCount: `1550`
- sourceDispositionCount: `1550`
- sourceCommandDispositionCoveragePercent: `100`
- silentSourceCommandDropCount: `0`
- duplicateSourceDispositionCount: `0`
- blockedSourceCommandCount: `0`
- adapterEncoderCommandCount: `1559`
- sourceStitchCommandCount: `1510`
- adapterStitchCommandCount: `1510`
- sourceJumpCommandCount: `18`
- adapterJumpCommandCount: `27`
- zeroDeltaStitchCount: `0`
- encodedZeroDeltaPenetrationCount: `0`
- zeroDeltaJumpCount: `1`
- zeroJumpNoOutputCount: `1`
- sourceTrimCommandCount: `17`
- adapterTrimCommandCount: `17`
- expectedTrimBinaryRecordCount: `51`
- actualTrimBinaryRecordCount: `51`
- sourceColorChangeCount: `4`
- adapterColorChangeCount: `4`
- binarySTOPRecordCount: `4`
- sourceEndCommandCount: `1`
- adapterEndCommandCount: `1`
- binaryENDRecordCount: `1`
- splitSourceMovementCount: `7`
- generatedSplitMovementCount: `17`
- maximumAdapterDeltaUnits: `117`
- exactFinalEndpointVerified: `true`
- expectedBinaryRecordCount: `1593`
- actualBinaryRecordCount: `1593`
- adapterCommandDistribution: `{ stitch: 1510, jump: 27, trim: 17, colorChange: 4, end: 1 }`
- binaryRecordDistribution: `{ stitch: 1510, jump: 78, colorChange: 4, end: 1 }`
- binaryLineageCoveragePercent: `100`
- silentBinaryLineageDropCount: `0`
- duplicateBinaryLineageMappingCount: `0`
- binaryByteLength: `5292`
- checksum: `174` (deterministic XOR diagnostic)

## Header, bounds, and parser

- label: `GENERIC_MASCOT`
- ST: `1593`
- CO: `4`
- +X/-X/+Y/-Y: `300/0/350/0` in 0.1 mm units
- parsedStitchTargetBounds: `{ plusX: 300, minusX: 0, plusY: 350, minusY: 0 }`
- parsedFinalPositionUnits: `{ x: 0, y: 0 }`
- headerTerminatorPresent: `true`
- finalEOFPresent: `true`
- parserRoundtripPassed: `true`
- deterministicBytesVerified: `true`

Every source command has one disposition and one binary span. Split stitches and jumps map to one binary record per adapter command; the zero jump maps to zero records; each trim maps to three verified records; each color change maps to one STOP; END maps to one final END. No source or binary lineage disappears silently.

## Known limitations and next phase

All Phase 12B fixtures are synthetic. No tracked machine-recognized binary is available for byte comparison, and this phase does not claim physical machine acceptance. The existing protected header inspector does not parse explicitly signed zero AX/AY values into numbers, so final position is independently verified from decoded records. The existing encoder logs diagnostic color information during tests. Phase 12B remains disconnected from production UI and Base44.

Recommended next task: `ENGINE_V2_PHASE_12C_TRANSACTIONAL_DSB_FORMAT_ADAPTER_AND_BINARY_ACCEPTANCE`, with an explicit blocking/default disposition for unsupported DSB trim intent and no modification to the existing encoders.

## Exact diff summary

- filesCreated: `25` including this report
- filesModified: `2`
- protectedFilesTouched: `[]`
- encoderFilesTouched: `[]`
- applicationFilesTouched: `[]`

