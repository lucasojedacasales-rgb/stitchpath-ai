function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze); return Object.freeze(value);
}

export function createBinaryExportReadinessV2(input = {}) {
  return deepFreeze({
    format: input.format ?? null, structurallyAccepted: input.structurallyAccepted === true,
    parserRoundtripPassed: input.parserRoundtripPassed === true, deterministicBytesVerified: input.deterministicBytesVerified === true,
    binaryGenerated: input.binaryGenerated === true, trimIntentPresent: input.trimIntentPresent === true,
    trimBinaryRepresentationPresent: input.trimBinaryRepresentationPresent === true, physicalTrimEncoded: input.physicalTrimEncoded === true,
    physicalTrimSupportVerified: input.physicalTrimSupportVerified === true, physicalMachineAcceptanceVerified: input.physicalMachineAcceptanceVerified === true,
    realReferenceBinaryAvailable: input.realReferenceBinaryAvailable === true,
    readyForDisconnectedBinaryTesting: input.readyForDisconnectedBinaryTesting === true,
    readyForApplicationIntegration: input.readyForApplicationIntegration === true, readyForProductionRelease: input.readyForProductionRelease === true,
    blockingReasons: structuredClone(input.blockingReasons ?? []), warnings: structuredClone(input.warnings ?? []), source: structuredClone(input.source ?? null),
  });
}

export function buildBinaryExportReadiness({ format, status, artifact, formatResult, limitations = [] }) {
  const summary = formatResult?.summary || {}; const trimIntentPresent = summary.trimIntentPresent === true || (summary.sourceTrimCommandCount || 0) > 0;
  const trimBinaryRepresentationPresent = format === 'DST'
    ? !trimIntentPresent || (summary.actualTrimBinaryRecordCount || 0) > 0
    : summary.trimBinaryRepresentationPresent === true;
  const structurallyAccepted = status?.accepted === true && artifact != null;
  const readyForDisconnectedBinaryTesting = structurallyAccepted && artifact.parserRoundtripPassed && artifact.deterministicBytesVerified && artifact.finalEOFPresent;
  return createBinaryExportReadinessV2({
    format, structurallyAccepted, parserRoundtripPassed: artifact?.parserRoundtripPassed === true,
    deterministicBytesVerified: artifact?.deterministicBytesVerified === true, binaryGenerated: artifact != null,
    trimIntentPresent, trimBinaryRepresentationPresent, physicalTrimEncoded: false, physicalTrimSupportVerified: false,
    physicalMachineAcceptanceVerified: false, realReferenceBinaryAvailable: false, readyForDisconnectedBinaryTesting,
    readyForApplicationIntegration: false, readyForProductionRelease: false,
    blockingReasons: limitations.filter(item => item.severity === 'blocking').map(item => item.code),
    warnings: limitations.filter(item => item.severity === 'warning').map(item => item.code),
    source: { facade: 'engine-v2-phase12d', formatResultVersion: formatResult?.version ?? null },
  });
}
