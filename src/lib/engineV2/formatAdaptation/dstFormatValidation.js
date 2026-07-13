import { dstDispositionId, dstEncoderCommandId, DST_SOURCE_DISPOSITION_STATUSES } from './dstFormatModel.js';

const issue = (code, path, message) => ({ code, path, message });
const duplicates = values => values.filter((value, index) => values.indexOf(value) !== index).filter((value, index, all) => all.indexOf(value) === index);

export function validateDSTSourceCommandDispositionV2(disposition) {
  const errors = [];
  if (!disposition?.sourceMachineCommandId) errors.push(issue('DST_DISPOSITION_SOURCE_REQUIRED', 'sourceMachineCommandId', 'Source machine command is required.'));
  if (disposition?.id !== dstDispositionId(disposition?.sourceMachineCommandId)) errors.push(issue('DST_DISPOSITION_ID_NONDETERMINISTIC', 'id', 'Disposition ID is not deterministic.'));
  if (!DST_SOURCE_DISPOSITION_STATUSES.includes(disposition?.status)) errors.push(issue('DST_DISPOSITION_STATUS_INVALID', 'status', 'Disposition status is invalid.'));
  if (!Number.isInteger(disposition?.sourceAdaptedIndex) || disposition.sourceAdaptedIndex < 0) errors.push(issue('DST_DISPOSITION_SOURCE_INDEX_INVALID', 'sourceAdaptedIndex', 'Source index must be non-negative.'));
  if (!Number.isInteger(disposition?.dstCommandCount) || disposition.dstCommandCount < 0 || !Number.isInteger(disposition?.expectedBinaryRecordCount) || disposition.expectedBinaryRecordCount < 0) errors.push(issue('DST_DISPOSITION_COUNT_INVALID', 'counts', 'Disposition counts must be non-negative integers.'));
  if (disposition?.status === 'zero_output' && (disposition.dstCommandCount !== 0 || disposition.expectedBinaryRecordCount !== 0)) errors.push(issue('DST_ZERO_OUTPUT_HAS_OUTPUT', 'counts', 'Zero-output disposition cannot declare output.'));
  if (disposition?.status === 'adapted' && disposition.dstCommandCount < 1) errors.push(issue('DST_ADAPTED_DISPOSITION_EMPTY', 'dstCommandCount', 'Adapted disposition requires an encoder command.'));
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function validateDSTEncoderCommandV2(command) {
  const errors = []; const movement = ['stitch', 'jump'].includes(command?.type);
  if (command?.id !== dstEncoderCommandId(command?.dstCommandIndex, command?.type)) errors.push(issue('DST_COMMAND_ID_NONDETERMINISTIC', 'id', 'DST command ID is not deterministic.'));
  if (!['stitch', 'jump', 'trim', 'colorChange', 'end'].includes(command?.type)) errors.push(issue('DST_ENCODER_COMMAND_TYPE_INVALID', 'type', 'DST command type is invalid.'));
  if (!Number.isInteger(command?.dstCommandIndex) || command.dstCommandIndex < 0) errors.push(issue('DST_ENCODER_COMMAND_INDEX_INVALID', 'dstCommandIndex', 'DST command index must be non-negative.'));
  if (!Number.isFinite(command?.x) || !Number.isFinite(command?.y) || !Number.isInteger(command.x * 10) || !Number.isInteger(command.y * 10)) errors.push(issue('DST_ENCODER_COORDINATE_INVALID', 'coordinates', 'Coordinates must be exact 0.1 mm values.'));
  if (!command?.sourceMachineCommandId || !Number.isInteger(command?.sourceAdaptedIndex)) errors.push(issue('DST_ENCODER_LINEAGE_REQUIRED', 'source', 'Source command lineage is required.'));
  if (command?.type !== 'end' && !command?.color) errors.push(issue('DST_ENCODER_THREAD_REQUIRED', 'color', 'Stable thread token is required.'));
  if (!Number.isInteger(command?.splitIndex) || !Number.isInteger(command?.splitCount) || command.splitIndex < 0 || command.splitCount < 1 || command.splitIndex >= command.splitCount) errors.push(issue('DST_ENCODER_SPLIT_INVALID', 'split', 'Split indexes are invalid.'));
  const expected = command?.type === 'trim' ? 3 : 1;
  if (command?.expectedBinaryRecordCount !== expected) errors.push(issue('DST_ENCODER_EXPECTED_RECORD_COUNT_INVALID', 'expectedBinaryRecordCount', 'Expected record expansion is invalid.'));
  if (movement && (!Number.isInteger(command?.source?.adapterDeltaUnits?.dxUnits) || !Number.isInteger(command?.source?.adapterDeltaUnits?.dyUnits))) errors.push(issue('DST_ENCODER_DELTA_LINEAGE_REQUIRED', 'source.adapterDeltaUnits', 'Movement delta lineage is required.'));
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function validateDSTFormatAdaptationV2(adaptation, machineAdaptedStream) {
  const errors = []; const sourceCommands = machineAdaptedStream?.commands || []; const dispositions = adaptation?.dispositions || []; const commands = adaptation?.encoderCommands || []; const spans = adaptation?.binaryRecordSpans || [];
  dispositions.forEach((item, index) => errors.push(...validateDSTSourceCommandDispositionV2(item).errors.map(entry => ({ ...entry, path: `dispositions[${index}].${entry.path}` }))));
  commands.forEach((item, index) => errors.push(...validateDSTEncoderCommandV2(item).errors.map(entry => ({ ...entry, path: `encoderCommands[${index}].${entry.path}` }))));
  duplicates(dispositions.map(item => item.sourceMachineCommandId)).forEach(id => errors.push(issue('DST_DUPLICATE_SOURCE_DISPOSITION', 'dispositions', `Duplicate disposition for ${id}.`)));
  duplicates(commands.map(item => item.id)).forEach(id => errors.push(issue('DST_DUPLICATE_ENCODER_COMMAND', 'encoderCommands', `Duplicate DST command ${id}.`)));
  sourceCommands.forEach(source => {
    if (!dispositions.some(item => item.sourceMachineCommandId === source.id)) errors.push(issue('DST_SOURCE_DISPOSITION_MISSING', 'dispositions', `No disposition for ${source.id}.`));
    if (!spans.some(item => item.sourceMachineCommandId === source.id)) errors.push(issue('DST_BINARY_SPAN_MISSING', 'binaryRecordSpans', `No binary span for ${source.id}.`));
  });
  dispositions.forEach(item => { if (!sourceCommands.some(source => source.id === item.sourceMachineCommandId)) errors.push(issue('DST_UNKNOWN_DISPOSITION_SOURCE', 'dispositions', `Unknown source ${item.sourceMachineCommandId}.`)); });
  if (machineAdaptedStream?.machineProfile?.coordinateResolutionMm !== 0.1) errors.push(issue('DST_ADAPTATION_RESOLUTION_INVALID', 'machineProfile.coordinateResolutionMm', 'DST requires 0.1 mm source units.'));
  if (adaptation?.config?.maximumDeltaUnits !== 121) errors.push(issue('DST_ADAPTATION_LIMIT_INVALID', 'config.maximumDeltaUnits', 'DST limit must equal 121.'));
  const initial = machineAdaptedStream?.machineProfile?.initialMachinePositionUnits || { x: 0, y: 0 }; let x = initial.x; let y = initial.y;
  commands.forEach((command, index) => {
    if (['stitch', 'jump'].includes(command.type)) {
      const dx = command.source.adapterDeltaUnits.dxUnits; const dy = command.source.adapterDeltaUnits.dyUnits;
      if (Math.abs(dx) > 121 || Math.abs(dy) > 121) errors.push(issue('DST_ADAPTER_DELTA_OUT_OF_RANGE', `encoderCommands[${index}]`, 'Adapter movement exceeds 121 units.'));
      if (dx === 0 && dy === 0 && command.type === 'jump' && adaptation.config.zeroDeltaJumpPolicy === 'explicit_no_output') errors.push(issue('DST_ZERO_JUMP_EMITTED', `encoderCommands[${index}]`, 'Zero jump cannot reach encoder.'));
      x += dx; y += dy;
      if (Math.round(command.x * 10) !== x || Math.round(command.y * 10) !== y) errors.push(issue('DST_ADAPTER_ENDPOINT_INCONSISTENT', `encoderCommands[${index}]`, 'Encoder endpoint does not match adapter delta.'));
    } else if (Math.round(command.x * 10) !== x || Math.round(command.y * 10) !== y) errors.push(issue('DST_NON_MOVEMENT_ENDPOINT_CHANGED', `encoderCommands[${index}]`, 'Non-movement command changed position.'));
  });
  const ends = commands.filter(command => command.type === 'end');
  if (adaptation?.valid && (ends.length !== 1 || commands.at(-1)?.type !== 'end')) errors.push(issue('DST_ADAPTER_END_INVALID', 'encoderCommands', 'Exactly one final END is required.'));
  const sourceColorOrder = sourceCommands.filter(command => command.type === 'colorChange').map(command => command.threadId);
  const adapterColorOrder = commands.filter(command => command.type === 'colorChange').map(command => command.color);
  if (adaptation?.valid && JSON.stringify(sourceColorOrder) !== JSON.stringify(adapterColorOrder)) errors.push(issue('DST_COLOR_CHANGE_ORDER_CHANGED', 'encoderCommands', 'Color-change order changed.'));
  const sourceIds = dispositions.map(item => item.sourceMachineCommandId); if (JSON.stringify(sourceIds) !== JSON.stringify(sourceCommands.map(command => command.id))) errors.push(issue('DST_SOURCE_ORDER_CHANGED', 'dispositions', 'Source command order changed.'));
  if (adaptation?.summary?.sourceCommandDispositionCoveragePercent !== 100 || adaptation?.summary?.silentSourceCommandDropCount !== 0) errors.push(issue('DST_SOURCE_COVERAGE_BELOW_100', 'summary', 'Source disposition coverage must be complete.'));
  if (adaptation?.metadata?.sourceStreamMutationCount) errors.push(issue('DST_SOURCE_MUTATION_DETECTED', 'metadata', 'Source stream mutation detected.'));
  if (adaptation?.metadata?.DSBInvocationCount || adaptation?.metadata?.Base44InvocationCount) errors.push(issue('DST_FORBIDDEN_INVOCATION', 'metadata', 'DSB and Base44 invocations are forbidden.'));
  if (adaptation?.valid && dispositions.some(item => item.status === 'blocked')) errors.push(issue('DST_PARTIAL_ADAPTATION_MARKED_VALID', 'valid', 'Blocked dispositions cannot appear in valid adaptation.'));
  return { valid: errors.length === 0, errors, warnings: adaptation?.warnings || [] };
}

export function validateDSTBinaryAcceptanceResultV2(result) {
  const errors = [];
  if (!(result?.bytes instanceof Uint8Array)) errors.push(issue('DST_BINARY_BYTES_REQUIRED', 'bytes', 'Binary bytes must be Uint8Array.'));
  if (result?.format !== 'DST') errors.push(issue('DST_BINARY_FORMAT_INVALID', 'format', 'Binary format must be DST.'));
  if (result?.byteLength !== result?.bytes?.length) errors.push(issue('DST_BINARY_LENGTH_MISMATCH', 'byteLength', 'Byte length does not match bytes.'));
  if (result?.summary?.headerByteLength !== 512) errors.push(issue('DST_BINARY_HEADER_SIZE_INVALID', 'summary.headerByteLength', 'DST header must be 512 bytes.'));
  if (result?.summary?.binaryENDRecordCount !== 1) errors.push(issue('DST_BINARY_END_COUNT_INVALID', 'summary.binaryENDRecordCount', 'Exactly one binary END is required.'));
  if (result?.summary?.finalEOFPresent !== true) errors.push(issue('DST_BINARY_EOF_MISSING', 'summary.finalEOFPresent', 'Final EOF is required.'));
  if (result?.summary?.parserRoundtripPassed !== true) errors.push(issue('DST_BINARY_PARSER_ROUNDTRIP_FAILED', 'summary.parserRoundtripPassed', 'Parser roundtrip must pass.'));
  if (result?.summary?.deterministicBytesVerified !== true) errors.push(issue('DST_BINARY_NONDETERMINISTIC', 'summary.deterministicBytesVerified', 'Deterministic bytes are required.'));
  if (result?.summary?.binaryLineageCoveragePercent !== 100 || result?.summary?.silentBinaryLineageDropCount !== 0) errors.push(issue('DST_BINARY_LINEAGE_INCOMPLETE', 'summary', 'Binary lineage must be complete.'));
  if (result?.valid && errors.length) errors.push(issue('DST_INVALID_BINARY_MARKED_VALID', 'valid', 'Invalid binary cannot be accepted.'));
  return { valid: errors.length === 0, errors, warnings: result?.warnings || [] };
}
