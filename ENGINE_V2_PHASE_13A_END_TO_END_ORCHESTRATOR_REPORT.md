# Engine V2 Phase 13A End-to-End Orchestrator Report

## Repository verification

- Repository: `lucasojedacasales-rgb/stitchpath-ai`
- Branch: `engine-v2`
- Starting commit: `14329dc5291ad390c7c48f961499df902f3ec287`
- Ending commit: Phase 13A commit created after report finalization; the authoritative hash is reported with the push result.
- Starting work tree: clean
- Pipeline boundary: validated `RegionV2`
- Raw-image processing: not included
- Application integration: not included

## Implementation scope

Phase 13A adds a disconnected coordinator above the existing stable Phase 2 through 12D APIs. It does not replace a stage, invoke application state, create a browser download, or call an encoder outside the existing unified binary facade.

Existing APIs invoked, in fixed order:

1. `ingestRegionsV2`, `buildRegionGraphV2` through ingestion, and `validateRegionGraphV2`
2. `analyzeSemanticRegionRoles`, `validateSemanticAnalysisResult`
3. `buildEmbroideryObjectProposalPlan`, `validateEmbroideryObjectProposalPlan`
4. `materializeEmbroideryObjectDrafts`, `validateObjectDraftMaterialization`
5. `materializeThreadedEmbroideryObjects`, `validateThreadedObjectMaterialization`
6. `buildTechnicalEmbroideryPlan`, `validateTechnicalEmbroideryPlan`
7. `buildGlobalSequencePlan`, `validateGlobalSequencePlan`
8. `buildMachineIndependentPhysicalStitchPlan`, `validateMachineIndependentPhysicalStitchPlan`
9. `compileCanonicalCommandStream`, `validateCanonicalCommandCompilationV2`
10. `adaptCanonicalCommandsForMachine`, `validateMachineAdaptedCommandStreamV2`
11. `exportMachineAdaptedStreamV2`, `validateUnifiedBinaryExportResultV2`

The existing ingestion export is a V1 adapter alias. The public Phase 13A entry still requires validated RegionV2. A private, cloned ingestion view supplies the existing adapter contract, then verifies exact geometry, hole, visual-color, ID, and coverage preservation. No V1 input is accepted by the public orchestrator.

## Transactional model

- Fixed stage count: 11
- Every stage receives one `completed`, `blocked`, or `skipped` result.
- A validation failure blocks the invoked stage and marks all downstream stages `upstream_blocked` without invoking them.
- DSB strict trim policy is an invoked, architecture-valid `policy_blocked` binary outcome, not an internal stage failure.
- No optimizer, reorder pass, thread compaction, contour cleanup, or fallback is inserted.
- Stage inputs and the source request are snapshotted and checked for mutation.
- The binary facade remains authoritative and no cross-format fallback is allowed.

## Configuration

The conservative defaults require validation, complete stage coverage, immutable inputs, preserved stage results and diagnostics, preserved binary limitations, and verified provenance. Application connection, Base44, browser download, fixture persistence, physical acceptance, and root-level raw-image, encoder, trim, or machine settings are forbidden.

## Fingerprinting

`stableSerializeEngineV2Value` recursively sorts object keys, preserves array order, normalizes negative zero, represents `Uint8Array` deterministically, and rejects functions, symbols, and circular input. `fingerprintEngineV2Value` applies a deterministic 32-bit FNV-1a fingerprint to that serialization.

This is a reproducibility fingerprint. It is not cryptographic, is not SHA-256, and must not be used as a security hash.

## A. DST RegionV2-to-binary run

| Metric | Value |
|---|---:|
| pipelineCompleted | true |
| binaryAccepted | true |
| policyBlocked | false |
| regions / proposals / drafts / final objects | 2 / 2 / 2 / 2 |
| threads / technical specifications | 2 / 2 |
| execution steps / thread blocks | 2 / 2 |
| physical points / physical stitches | 363 / 285 |
| canonical commands / machine commands | 371 / 371 |
| binary bytes | 1665 |
| binary checksum | 26 |
| parser roundtrip | true |
| deterministic bytes | true |
| manual/direct parity | 100% |

| Stage | Status | Outcome | Output fingerprint |
|---|---|---|---|
| region_ingestion | completed | accepted | `d439238d` |
| semantic_analysis | completed | accepted | `fbcc6cea` |
| object_planning | completed | accepted | `fb6d6acf` |
| draft_materialization | completed | accepted | `b0014b27` |
| thread_resolution | completed | accepted | `6ceae64e` |
| technical_planning | completed | accepted | `0a7b03ce` |
| global_sequence | completed | accepted | `dd9efd37` |
| physical_generation | completed | accepted | `48d9fecf` |
| canonical_compilation | completed | accepted | `93b66a3c` |
| machine_adaptation | completed | accepted | `accd31f9` |
| binary_export | completed | accepted | `2d398f54` |

## B. DSB strict policy-blocked run

All first ten stage metrics and fingerprints equal the DST run. The binary stage was invoked and completed with `outcomeCategory=policy_blocked`, output fingerprint `650b20d2`. The pipeline architecture completed, but `binaryAccepted=false`, `policyBlocked=true`, artifact is null, byte length is 0, checksum is null, and no DST fallback or cross-format invocation occurred.

## C. DSB explicit accepted run

| Metric | Value |
|---|---:|
| pipelineCompleted | true |
| binaryAccepted | true |
| policyBlocked | false |
| regions / proposals / drafts / final objects | 2 / 2 / 2 / 2 |
| threads / technical specifications | 2 / 2 |
| execution steps / thread blocks | 2 / 2 |
| physical points / physical stitches | 363 / 285 |
| canonical commands / machine commands | 371 / 371 |
| binary bytes | 1611 |
| binary checksum | 17 |
| parser roundtrip | true |
| deterministic bytes | true |
| physical trim encoded | false |
| physical trim support verified | false |
| manual/direct parity | 100% |

The first ten stage fingerprints equal the DST run. `binary_export` is `completed/accepted` with fingerprint `1883d9fb`. The explicit no-output trim acknowledgement is preserved; no physical DSB trim representation is claimed.

## D. Invalid-upstream blocked run

The invalid RegionV2 fixture blocks `region_ingestion` and skips all ten downstream stages. Stage disposition coverage remains 100%, no downstream function is invoked, and no binary artifact is created.

| Stage | Status | Outcome | Output fingerprint |
|---|---|---|---|
| region_ingestion | blocked | validation_failed | `5c91931d` |
| semantic_analysis | skipped | upstream_blocked | `4c113562` |
| object_planning | skipped | upstream_blocked | `3fda81cc` |
| draft_materialization | skipped | upstream_blocked | `48f03606` |
| thread_resolution | skipped | upstream_blocked | `265852ca` |
| technical_planning | skipped | upstream_blocked | `7e7f298e` |
| global_sequence | skipped | upstream_blocked | `cb548288` |
| physical_generation | skipped | upstream_blocked | `907fa8cf` |
| canonical_compilation | skipped | upstream_blocked | `b89fa5c9` |
| machine_adaptation | skipped | upstream_blocked | `fa825330` |
| binary_export | skipped | upstream_blocked | `de8a12ff` |

## E. Synthetic reference capture

The accepted DST run creates one immutable, in-memory synthetic manifest with the request fingerprint, all eleven output fingerprints, stage counts, binary metrics, limitations, readiness, and `physicalMachineTest.status=not_tested`. The manifest is not persisted. `syntheticReferenceCaptured=true`, while real-reference, physical-machine, application, and production claims remain false.

## F. Invalid real-reference claim

Incomplete real provenance is rejected with `captureAllowed=false` and `reasonCode=REAL_REFERENCE_PROVENANCE_INCOMPLETE`. Even structurally complete real provenance is blocked because no genuine tracked real fixture exists. Synthetic evidence cannot be relabelled real, and parser roundtrip cannot establish machine acceptance.

## Parity and mutation verification

- Manual direct execution invokes the same eleven existing APIs independently from the orchestrator fixture.
- All eleven direct output fingerprints equal the orchestrated stage output fingerprints.
- DST bytes and checksum are identical between manual direct and orchestrated execution.
- `manualDirectStageParityPercent=100`
- `manualDirectBinaryParity=true`
- `crossStageReferenceCoveragePercent=100`
- `crossStageReferenceMismatchCount=0`
- `sourceRequestMutationCount=0`
- `stageInputMutationCount=0`
- `objectOrderMutationCount=0`
- `threadBlockOrderMutationCount=0`
- `threadIdMutationCount=0`
- `geometryMutationCount=0`
- `holeMutationCount=0`
- `visualColorMutationCount=0`

## Verification

- Baseline before implementation: 120 test files, 2,573 tests, all passing.
- Phase 13A scoped suite: 13 test files, 466 tests, all passing.
- Final Engine V2 suite: 133 test files, 3,039 tests, all passing.
- Final repository suite: 133 test files, 3,039 tests, all passing.
- Build: passed; Vite transformed 2,021 modules. Only the pre-existing mixed static/dynamic import and chunk-size warnings were emitted.
- Scoped ESLint: passed for every Phase 13A implementation, fixture, test, and `src/lib/engineV2/index.js`.

## Files created

- Seven orchestration modules in `src/lib/engineV2/orchestration/`
- Six reference-capture modules in `src/lib/engineV2/referenceCapture/`
- Seven deterministic synthetic fixtures in `src/lib/engineV2/fixtures/`
- Thirteen Phase 13A test files in `src/lib/engineV2/__tests__/`
- `ENGINE_V2_PHASE_13A_END_TO_END_ORCHESTRATOR_REPORT.md`

## Files modified

- `src/lib/engineV2/index.js`
- `src/lib/engineV2/README.md`

Exact staged diff summary: 36 files changed, 1,502 insertions, 34 files created, and 2 existing Engine V2 documentation/public-API files modified.

## Required final values

```text
defaultBehaviorChanged=false
applicationImportsEngineV2=false
v2InvokedByApplication=false
endToEndOrchestratorCreated=true
pipelineStartingBoundary=RegionV2
pipelineStageCount=11
pipelineStageDispositionCoveragePercent=100
silentPipelineStageDropCount=0
DSTEndToEndAccepted=true
DSBStrictEndToEndPolicyBlocked=true
DSBExplicitEndToEndAccepted=true
manualDirectStageParityPercent=100
manualDirectBinaryParity=true
crossStageReferenceCoveragePercent=100
crossStageReferenceMismatchCount=0
sourceRequestMutationCount=0
stageInputMutationCount=0
objectOrderMutationCount=0
threadBlockOrderMutationCount=0
threadIdMutationCount=0
geometryMutationCount=0
holeMutationCount=0
visualColorMutationCount=0
referenceCaptureInfrastructureCreated=true
syntheticReferenceCaptured=true
realReferenceFixtureAvailable=false
realReferenceFixtureCaptured=false
syntheticFixtureMislabelledAsReal=false
physicalMachineAcceptanceVerified=false
readyForApplicationIntegration=false
readyForProductionRelease=false
Base44InvocationCount=0
browserDownloadCreationCount=0
applicationConnected=false
protectedFilesTouched=[]
```

## Known limitations and Phase 13B recommendation

Phase 13A begins after RegionV2 creation and therefore does not prove raw-image segmentation, vectorization, or application parity. All tracked fixtures are synthetic. Binary parser acceptance proves deterministic structure, not physical-machine behavior. DSB explicit mode still has no physical trim representation. The ingestion bridge exists only because the current stable `ingestRegionsV2` export retains its historical adapter signature; preservation checks prevent it from becoming a public V1 fallback.

Phase 13B should capture a genuinely supplied, fingerprinted RegionV2 reference and corresponding binary evidence under explicit provenance review, then record separately witnessed machine recognition and sewing results. It must not infer those results from parser roundtrip and must not connect the production application without a later approved integration phase.
