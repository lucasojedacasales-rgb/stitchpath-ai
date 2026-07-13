const distribution = (items, key = 'type') => items.reduce((result, item) => ({ ...result, [item[key]]: (result[item[key]] || 0) + 1 }), {});

export function createDSBFormatDiagnostic({ machineAdaptedStream, exportResult }) {
  const binary = exportResult?.binary; const adaptation = exportResult?.adaptation; const summary = exportResult?.summary || {};
  const sourceCommands = machineAdaptedStream?.commands || [];
  return Object.freeze({
    valid: exportResult?.valid === true, trimPolicy: exportResult?.config?.trimPolicy || null,
    trimAcknowledgementPresent: typeof exportResult?.config?.trimNoOutputAcknowledgement === 'string' && Boolean(exportResult.config.trimNoOutputAcknowledgement.trim()),
    sourceMachineCommandCount: sourceCommands.length, sourceCommandDispositionCoveragePercent: summary.sourceCommandDispositionCoveragePercent ?? 0,
    silentSourceCommandDropCount: summary.silentSourceCommandDropCount ?? sourceCommands.length,
    recordPlanTypeDistribution: distribution(adaptation?.recordPlan || []), binaryRecordTypeDistribution: distribution(binary?.records || []),
    splitSourceMovementCount: summary.splitSourceMovementCount ?? 0, maximumRecordDeltaUnits: summary.maximumRecordDeltaUnits ?? 0,
    zeroDeltaStitchCount: summary.zeroDeltaStitchCount ?? 0, encodedZeroDeltaPenetrationCount: summary.encodedZeroDeltaPenetrationCount ?? 0,
    zeroDeltaJumpCount: summary.zeroDeltaJumpCount ?? 0, zeroJumpNoOutputCount: summary.zeroJumpNoOutputCount ?? 0,
    sourceTrimCommandCount: summary.sourceTrimCommandCount ?? 0, blockedTrimCount: summary.blockedTrimCount ?? 0,
    trimZeroOutputCount: summary.trimZeroOutputCount ?? 0, trimBinaryRecordCount: summary.trimBinaryRecordCount ?? 0,
    sourceColorChangeCount: summary.sourceColorChangeCount ?? 0, binaryColorChangeRecordCount: summary.binaryColorChangeRecordCount ?? 0,
    binaryEndRecordCount: summary.binaryEndRecordCount ?? 0, finalEOFPresent: summary.finalEOFPresent === true,
    header: binary?.header || null, parsedBounds: binary?.parsed?.decodedBounds || null, parsedFinalPosition: binary?.parsed?.finalPosition || null,
    binaryLineageCoveragePercent: summary.binaryLineageCoveragePercent ?? 0, parserRoundtripPassed: summary.parserRoundtripPassed === true,
    deterministicBytesVerified: summary.deterministicBytesVerified === true, trimIntentPresent: summary.trimIntentPresent === true,
    physicalTrimEncoded: false, physicalTrimSupportVerified: false, transactionBlocked: summary.transactionBlocked === true,
    binaryOutputGenerated: summary.binaryOutputGenerated === true, sourceMutationsDetected: (summary.sourceStreamMutationCount ?? 0) > 0,
    encoderFilesModified: (summary.encoderSourceFileModificationCount ?? 0) > 0, DSTInvoked: (summary.DSTInvocationCount ?? 0) > 0,
    Base44Invoked: (summary.Base44InvocationCount ?? 0) > 0, DSBLowLevelEncoderInvoked: exportResult?.metadata?.DSBLowLevelEncoderInvoked === true,
    errors: Object.freeze([...(exportResult?.errors || [])]), warnings: Object.freeze([...(exportResult?.warnings || [])]),
  });
}
