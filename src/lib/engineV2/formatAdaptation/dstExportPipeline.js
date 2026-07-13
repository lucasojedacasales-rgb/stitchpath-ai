import { parseDST } from '../../exportedFileBinaryRoundtripForensics.js';
import { adaptMachineCommandStreamToDST } from './dstCommandAdapter.js';
import { encodeDSTFormatAdaptation, validateDSTBinaryAcceptance } from './dstBinaryAcceptance.js';
import { resolveDSTFormatConfig } from './dstFormatConfig.js';
import { createDSTFormatDiagnostic } from './dstFormatDiagnostics.js';
import { validateDSTBinaryAcceptanceResultV2, validateDSTFormatAdaptationV2 } from './dstFormatValidation.js';

function frozenResult(input) {
  Object.freeze(input.errors); Object.freeze(input.warnings); Object.freeze(input.summary); Object.freeze(input.metadata); Object.freeze(input.config);
  return Object.freeze(input);
}

export function buildEngineV2DSTExport({ machineAdaptedStream, metadata = {}, config: rawConfig = {} }) {
  const sourceBefore = JSON.stringify(machineAdaptedStream); const config = resolveDSTFormatConfig(rawConfig);
  const draftAdaptation = adaptMachineCommandStreamToDST(machineAdaptedStream, config);
  const adaptationValidation = validateDSTFormatAdaptationV2(draftAdaptation, machineAdaptedStream);
  if (!draftAdaptation.valid || !adaptationValidation.valid) {
    const result = frozenResult({
      version: '2-dst-export-pipeline', format: 'DST', filename: `${draftAdaptation.headerMetadata?.label || config.label}.dst`, mimeType: 'application/octet-stream',
      adaptation: draftAdaptation, binary: null, valid: false, errors: [...draftAdaptation.errors, ...adaptationValidation.errors], warnings: [...draftAdaptation.warnings],
      summary: { ...draftAdaptation.summary, actualBinaryRecordCount: 0, binaryByteLength: 0, parserRoundtripPassed: false, deterministicBytesVerified: false },
      config, metadata: { ...structuredClone(metadata), DSTEncoderInvoked: false, DSBEncoderInvoked: false, Base44Invoked: false, binaryOutputGenerated: false, applicationConnected: false },
    });
    return frozenResult({ ...result, diagnostic: createDSTFormatDiagnostic({ machineAdaptedStream, exportResult: result }) });
  }
  const encoderOptions = { machineAdaptedStream, label: draftAdaptation.headerMetadata.label };
  const firstEncoding = encodeDSTFormatAdaptation({ adaptation: draftAdaptation, encoderOptions });
  const secondEncoding = encodeDSTFormatAdaptation({ adaptation: draftAdaptation, encoderOptions });
  const parsed = firstEncoding.valid ? parseDST(firstEncoding.bytes) : null;
  const sourceStreamMutationCount = sourceBefore === JSON.stringify(machineAdaptedStream) ? 0 : 1;
  const binary = validateDSTBinaryAcceptance({ adaptation: draftAdaptation, encoderResult: firstEncoding, parsedResult: parsed, comparisonEncoderResult: secondEncoding, sourceStreamMutationCount });
  const binaryValidation = validateDSTBinaryAcceptanceResultV2(binary);
  const valid = binary.valid && binaryValidation.valid; const acceptedAdaptation = binary.adaptation || draftAdaptation;
  const result = frozenResult({
    version: '2-dst-export-pipeline', format: 'DST', filename: binary.filename, mimeType: binary.mimeType,
    adaptation: acceptedAdaptation, binary, valid, errors: [...binary.errors, ...binaryValidation.errors], warnings: [...binary.warnings],
    summary: { ...binary.summary }, config,
    metadata: { ...structuredClone(metadata), DSTEncoderInvoked: true, DSBEncoderInvoked: false, Base44Invoked: false, binaryOutputGenerated: binary.byteLength > 0, applicationConnected: false },
  });
  return frozenResult({ ...result, diagnostic: createDSTFormatDiagnostic({ machineAdaptedStream, exportResult: result }) });
}

