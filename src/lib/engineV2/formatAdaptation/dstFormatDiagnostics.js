const distribution = (items, key = 'type') => items.reduce((result, item) => ({ ...result, [item[key]]: (result[item[key]] || 0) + 1 }), {});

export function createDSTFormatDiagnostic({ machineAdaptedStream, exportResult }) {
  const binary = exportResult?.binary; const adaptation = exportResult?.adaptation; const summary = exportResult?.summary || {};
  const sourceCommands = machineAdaptedStream?.commands || [];
  return Object.freeze({
    valid: exportResult?.valid === true,
    sourceMachineCommandCount: sourceCommands.length,
    sourceCommandDispositionCoveragePercent: summary.sourceCommandDispositionCoveragePercent ?? 0,
    silentSourceCommandDropCount: summary.silentSourceCommandDropCount ?? sourceCommands.length,
    adapterCommandTypeDistribution: distribution(adaptation?.encoderCommands || []),
    binaryRecordTypeDistribution: distribution(binary?.records || []),
    splitSourceMovementCount: summary.splitSourceMovementCount ?? 0,
    maximumAdapterDeltaUnits: summary.maximumAdapterDeltaUnits ?? 0,
    zeroDeltaStitchCount: summary.zeroDeltaStitchCount ?? 0,
    encodedZeroDeltaPenetrationCount: summary.encodedZeroDeltaPenetrationCount ?? 0,
    zeroDeltaJumpCount: summary.zeroDeltaJumpCount ?? 0,
    zeroJumpNoOutputCount: summary.zeroJumpNoOutputCount ?? 0,
    sourceTrimCommandCount: summary.sourceTrimCommandCount ?? 0,
    trimBinaryRecordCount: summary.actualTrimBinaryRecordCount ?? 0,
    sourceColorChangeCount: summary.sourceColorChangeCount ?? 0,
    binarySTOPRecordCount: summary.binarySTOPRecordCount ?? 0,
    binaryENDRecordCount: summary.binaryENDRecordCount ?? 0,
    finalEOFPresent: summary.finalEOFPresent === true,
    header: binary?.header || null,
    parsedBounds: binary?.header?.bounds || null,
    parsedFinalPosition: binary?.header?.finalPosition || null,
    binaryLineageCoveragePercent: summary.binaryLineageCoveragePercent ?? 0,
    parserRoundtripPassed: summary.parserRoundtripPassed === true,
    deterministicBytesVerified: summary.deterministicBytesVerified === true,
    sourceMutationsDetected: (summary.sourceStreamMutationCount ?? 0) > 0,
    encoderFilesModified: (summary.encoderSourceFileModificationCount ?? 0) > 0,
    DSBInvoked: (summary.DSBInvocationCount ?? 0) > 0,
    Base44Invoked: (summary.Base44InvocationCount ?? 0) > 0,
    DSTEncoderInvoked: binary?.metadata?.DSTEncoderInvoked === true,
    binaryOutputGenerated: binary?.metadata?.binaryOutputGenerated === true,
    errors: Object.freeze([...(exportResult?.errors || [])]),
    warnings: Object.freeze([...(exportResult?.warnings || [])]),
  });
}

