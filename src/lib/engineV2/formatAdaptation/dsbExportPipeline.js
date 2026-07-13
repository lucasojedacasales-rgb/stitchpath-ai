import { adaptMachineCommandStreamToDSB } from './dsbCommandAdapter.js';
import { buildDSBBinaryFromRecordPlan } from './dsbBinaryBuilder.js';
import { parseEngineV2DSBBinary } from './dsbBinaryParser.js';
import { validateDSBBinaryAcceptance } from './dsbBinaryAcceptance.js';
import { resolveDSBFormatConfig } from './dsbFormatConfig.js';
import { createDSBFormatDiagnostic } from './dsbFormatDiagnostics.js';
import { validateDSBBinaryAcceptanceResultV2, validateDSBFormatAdaptationV2 } from './dsbFormatValidation.js';

function frozenResult(input) {
  Object.freeze(input.errors); Object.freeze(input.warnings); Object.freeze(input.summary); Object.freeze(input.metadata); Object.freeze(input.config);
  return Object.freeze(input);
}

export function buildEngineV2DSBExport({ machineAdaptedStream, metadata = {}, config: rawConfig = {} }) {
  const sourceBefore = JSON.stringify(machineAdaptedStream); const config = resolveDSBFormatConfig(rawConfig);
  const draftAdaptation = adaptMachineCommandStreamToDSB(machineAdaptedStream, config);
  const adaptationValidation = validateDSBFormatAdaptationV2(draftAdaptation, machineAdaptedStream);
  if (!draftAdaptation.valid || !adaptationValidation.valid) {
    const result = frozenResult({
      version: '2-dsb-export-pipeline', format: 'DSB', filename: `${draftAdaptation.headerMetadata?.label || config.label}.dsb`, mimeType: 'application/octet-stream',
      adaptation: draftAdaptation, binary: null, valid: false, errors: [...draftAdaptation.errors, ...adaptationValidation.errors], warnings: [...draftAdaptation.warnings],
      summary: {
        ...draftAdaptation.summary, actualBinaryRecordCount: 0, binaryByteLength: 0, binaryColorChangeRecordCount: 0,
        binaryEndRecordCount: 0, finalEOFPresent: false, parserRoundtripPassed: false, deterministicBytesVerified: false,
        transactionBlocked: true, binaryOutputGenerated: false,
      },
      config,
      metadata: {
        ...structuredClone(metadata), DSBLowLevelEncoderInvoked: false, DSTEncoderInvoked: false, Base44Invoked: false,
        binaryOutputGenerated: false, applicationConnected: false, trimPolicy: config.trimPolicy,
        trimNoOutputAcknowledgement: config.trimNoOutputAcknowledgement, physicalTrimEncoded: false, physicalTrimSupportVerified: false,
      },
    });
    return frozenResult({ ...result, diagnostic: createDSBFormatDiagnostic({ machineAdaptedStream, exportResult: result }) });
  }

  const firstBinary = buildDSBBinaryFromRecordPlan({ adaptation: draftAdaptation, config });
  const secondBinary = buildDSBBinaryFromRecordPlan({ adaptation: draftAdaptation, config });
  const parsed = firstBinary.valid ? parseEngineV2DSBBinary(firstBinary.bytes) : null;
  const sourceStreamMutationCount = sourceBefore === JSON.stringify(machineAdaptedStream) ? 0 : 1;
  const binary = validateDSBBinaryAcceptance({ adaptation: draftAdaptation, binaryResult: firstBinary, parsedResult: parsed, comparisonBinaryResult: secondBinary, sourceStreamMutationCount });
  const binaryValidation = validateDSBBinaryAcceptanceResultV2(binary); const valid = binary.valid && binaryValidation.valid;
  const result = frozenResult({
    version: '2-dsb-export-pipeline', format: 'DSB', filename: binary.filename, mimeType: binary.mimeType,
    adaptation: binary.adaptation || draftAdaptation, binary, valid, errors: [...binary.errors, ...binaryValidation.errors], warnings: [...draftAdaptation.warnings, ...binary.warnings],
    summary: { ...binary.summary }, config,
    metadata: {
      ...structuredClone(metadata), DSBLowLevelEncoderInvoked: true, DSTEncoderInvoked: false, Base44Invoked: false,
      binaryOutputGenerated: binary.byteLength > 0, applicationConnected: false, trimPolicy: config.trimPolicy,
      trimNoOutputAcknowledgement: config.trimNoOutputAcknowledgement, physicalTrimEncoded: false, physicalTrimSupportVerified: false,
    },
  });
  return frozenResult({ ...result, diagnostic: createDSBFormatDiagnostic({ machineAdaptedStream, exportResult: result }) });
}
