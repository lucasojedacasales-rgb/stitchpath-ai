import { createEngineV2ReferenceCaptureManifest, createPhysicalMachineTestV2, createReferenceSourceProvenanceV2 } from './referenceCaptureModel.js';
import { validateEngineV2ReferenceCaptureManifest } from './referenceCaptureValidation.js';

export function buildEngineV2ReferenceCaptureManifest({ pipelineResult, provenance, physicalMachineTest, gateResult, metadata = {} }) {
  if (gateResult?.captureAllowed !== true) return null;
  const summary = pipelineResult?.summary || {}; const binary = pipelineResult?.binaryExport;
  const draft = createEngineV2ReferenceCaptureManifest({
    sourceProvenance: createReferenceSourceProvenanceV2(provenance),
    requestFingerprint: pipelineResult?.request?.sourceFingerprint,
    stageFingerprints: Object.fromEntries((pipelineResult?.stageResults || []).map(stage => [stage.stageId, stage.outputFingerprint])),
    regionCount: summary.regionCount, proposalCount: summary.proposalCount, draftCount: summary.draftCount,
    finalObjectCount: summary.finalObjectCount, threadCount: summary.threadDefinitionCount,
    technicalSpecificationCount: summary.technicalSpecificationCount, executionStepCount: summary.executionStepCount,
    threadBlockCount: summary.threadBlockCount, physicalPointCount: summary.physicalPointCount,
    physicalStitchCount: summary.physicalStitchCount, canonicalCommandCount: summary.canonicalCommandCount,
    machineCommandCount: summary.machineAdaptedCommandCount, requestedFormat: summary.requestedFormat,
    binaryAccepted: summary.binaryAccepted, binaryByteLength: summary.binaryByteLength, binaryChecksum: summary.binaryChecksum,
    parserRoundtripPassed: summary.parserRoundtripPassed, deterministicBytesVerified: summary.deterministicBytesVerified,
    limitations: binary?.limitations ?? [], readiness: binary?.readiness ?? null,
    physicalMachineTest: createPhysicalMachineTestV2(physicalMachineTest), valid: true, errors: [], warnings: gateResult.warnings,
    metadata: { ...structuredClone(metadata), captureInMemoryOnly: true, persisted: false, realReferenceFixtureAvailable: false, physicalMachineAcceptanceVerified: false },
  });
  const validation = validateEngineV2ReferenceCaptureManifest(draft);
  return createEngineV2ReferenceCaptureManifest({ ...draft, valid: validation.valid, errors: validation.errors, warnings: [...draft.warnings, ...validation.warnings] });
}
