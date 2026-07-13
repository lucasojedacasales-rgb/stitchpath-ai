export function createUnifiedBinaryExportDiagnostic({ machineAdaptedStream, unifiedResult }) {
  const summary = unifiedResult?.summary || {};
  return Object.freeze({
    valid: unifiedResult?.valid === true, requestedFormat: summary.requestedFormat ?? null, normalizedFormat: summary.normalizedFormat ?? null,
    selectedAdapter: unifiedResult?.selectedAdapter ?? null, statusCategory: unifiedResult?.status?.category ?? null,
    exportAccepted: summary.exportAccepted === true, transactionBlocked: summary.transactionBlocked === true,
    binaryGenerated: summary.binaryGenerated === true, artifactByteLength: summary.artifactByteLength ?? 0,
    artifactChecksum: summary.artifactChecksum ?? null, sourceCommandDispositionCoveragePercent: summary.sourceCommandDispositionCoveragePercent ?? 0,
    binaryLineageCoveragePercent: summary.binaryLineageCoveragePercent ?? 0, parserRoundtripPassed: summary.parserRoundtripPassed === true,
    deterministicBytesVerified: summary.deterministicBytesVerified === true, finalEOFPresent: summary.finalEOFPresent === true,
    trimIntentPresent: summary.trimIntentPresent === true, trimBinaryRepresentationPresent: summary.trimBinaryRepresentationPresent === true,
    physicalTrimEncoded: summary.physicalTrimEncoded === true, physicalTrimSupportVerified: summary.physicalTrimSupportVerified === true,
    physicalMachineAcceptanceVerified: summary.physicalMachineAcceptanceVerified === true, readiness: unifiedResult?.readiness ?? null,
    limitations: unifiedResult?.limitations ?? [], DSTAdapterInvocationCount: summary.DSTAdapterInvocationCount ?? 0,
    DSBAdapterInvocationCount: summary.DSBAdapterInvocationCount ?? 0, totalFormatAdapterInvocationCount: summary.totalFormatAdapterInvocationCount ?? 0,
    crossFormatInvocationCount: summary.crossFormatInvocationCount ?? 0, formatFallbackCount: summary.formatFallbackCount ?? 0,
    formatResultParityPercent: summary.formatResultParityPercent ?? 0, formatMetricMutationCount: summary.formatMetricMutationCount ?? 0,
    formatWarningSuppressionCount: summary.formatWarningSuppressionCount ?? 0, formatErrorSuppressionCount: summary.formatErrorSuppressionCount ?? 0,
    sourceMutationsDetected: (summary.sourceStreamMutationCount ?? 0) > 0, Base44Invoked: (summary.Base44InvocationCount ?? 0) > 0,
    applicationConnected: (summary.applicationInvocationCount ?? 0) > 0, browserDownloadCreated: (summary.browserDownloadCreationCount ?? 0) > 0,
    sourceMachineCommandCount: machineAdaptedStream?.commands?.length ?? 0,
    errors: Object.freeze([...(unifiedResult?.errors || [])]), warnings: Object.freeze([...(unifiedResult?.warnings || [])]),
  });
}
