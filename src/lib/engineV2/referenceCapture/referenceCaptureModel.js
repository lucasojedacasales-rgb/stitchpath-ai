const clone = value => value == null ? value : structuredClone(value);
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value) || ArrayBuffer.isView(value) || value instanceof ArrayBuffer || (typeof Blob !== 'undefined' && value instanceof Blob)) return value;
  Object.values(value).forEach(deepFreeze); return Object.freeze(value);
}

export const REFERENCE_SOURCE_KINDS = Object.freeze(['synthetic', 'real']);
export const REFERENCE_EVIDENCE_TYPES = Object.freeze(['synthetic_fixture', 'uploaded_source', 'application_capture', 'binary_reference', 'physical_machine_test', 'combined']);
export const PHYSICAL_MACHINE_TEST_STATUSES = Object.freeze(['not_tested', 'recognized', 'sew_started', 'sew_completed', 'rejected']);

export function createReferenceSourceProvenanceV2(input = {}) {
  return deepFreeze({
    sourceKind: input.sourceKind ?? null,
    sourceName: input.sourceName ?? null,
    sourceFingerprint: input.sourceFingerprint ?? null,
    evidenceType: input.evidenceType ?? null,
    evidenceReference: input.evidenceReference ?? null,
    verified: input.verified === true,
    notes: input.notes ?? null,
  });
}

export function createPhysicalMachineTestV2(input = {}) {
  return deepFreeze({
    status: input.status ?? 'not_tested',
    machineName: input.machineName ?? null,
    format: input.format ?? null,
    artifactFingerprint: input.artifactFingerprint ?? null,
    recognized: input.recognized === true,
    sewStarted: input.sewStarted === true,
    sewCompleted: input.sewCompleted === true,
    trimBehaviorObserved: input.trimBehaviorObserved ?? null,
    notes: input.notes ?? null,
    evidenceReference: input.evidenceReference ?? null,
  });
}

export function createReferenceCaptureGateResultV2(input = {}) {
  return deepFreeze({
    captureAllowed: input.captureAllowed === true,
    sourceKind: input.sourceKind ?? null,
    reasonCode: input.reasonCode ?? null,
    realReferenceFixtureAvailable: false,
    realReferenceFixtureCaptured: false,
    syntheticReferenceCaptured: input.syntheticReferenceCaptured === true,
    physicalMachineAcceptanceVerified: false,
    readyForApplicationIntegration: false,
    readyForProductionRelease: false,
    blockingReasons: clone(input.blockingReasons ?? []),
    warnings: clone(input.warnings ?? []),
  });
}

export function createEngineV2ReferenceCaptureManifest(input = {}) {
  return deepFreeze({
    version: input.version ?? '2-reference-capture-manifest',
    sourceProvenance: clone(input.sourceProvenance ?? null),
    requestFingerprint: input.requestFingerprint ?? null,
    stageFingerprints: clone(input.stageFingerprints ?? {}),
    regionCount: input.regionCount ?? 0,
    proposalCount: input.proposalCount ?? 0,
    draftCount: input.draftCount ?? 0,
    finalObjectCount: input.finalObjectCount ?? 0,
    threadCount: input.threadCount ?? 0,
    technicalSpecificationCount: input.technicalSpecificationCount ?? 0,
    executionStepCount: input.executionStepCount ?? 0,
    threadBlockCount: input.threadBlockCount ?? 0,
    physicalPointCount: input.physicalPointCount ?? 0,
    physicalStitchCount: input.physicalStitchCount ?? 0,
    canonicalCommandCount: input.canonicalCommandCount ?? 0,
    machineCommandCount: input.machineCommandCount ?? 0,
    requestedFormat: input.requestedFormat ?? null,
    binaryAccepted: input.binaryAccepted === true,
    binaryByteLength: input.binaryByteLength ?? 0,
    binaryChecksum: input.binaryChecksum ?? null,
    parserRoundtripPassed: input.parserRoundtripPassed === true,
    deterministicBytesVerified: input.deterministicBytesVerified === true,
    limitations: clone(input.limitations ?? []),
    readiness: clone(input.readiness ?? null),
    physicalMachineTest: createPhysicalMachineTestV2(input.physicalMachineTest),
    valid: input.valid === true,
    errors: clone(input.errors ?? []),
    warnings: clone(input.warnings ?? []),
    metadata: clone(input.metadata ?? {}),
  });
}
