import { dsbDispositionId, dsbRecordPlanId, DSB_SOURCE_DISPOSITION_STATUSES } from './dsbFormatModel.js';

const COMMAND_BYTES = Object.freeze({ stitch: 0x80, jump: 0x81, colorChange: 0x88, end: 0xF8 });
const issue = (code, path, message) => ({ code, path, message });
const duplicates = values => values.filter((value, index) => values.indexOf(value) !== index).filter((value, index, all) => all.indexOf(value) === index);

export function validateDSBSourceCommandDispositionV2(disposition) {
  const errors = [];
  if (!disposition?.sourceMachineCommandId) errors.push(issue('DSB_DISPOSITION_SOURCE_REQUIRED', 'sourceMachineCommandId', 'Source machine command is required.'));
  if (disposition?.id !== dsbDispositionId(disposition?.sourceMachineCommandId)) errors.push(issue('DSB_DISPOSITION_ID_NONDETERMINISTIC', 'id', 'Disposition ID is not deterministic.'));
  if (!DSB_SOURCE_DISPOSITION_STATUSES.includes(disposition?.status)) errors.push(issue('DSB_DISPOSITION_STATUS_INVALID', 'status', 'Disposition status is invalid.'));
  if (!Number.isInteger(disposition?.sourceAdaptedIndex) || disposition.sourceAdaptedIndex < 0) errors.push(issue('DSB_DISPOSITION_SOURCE_INDEX_INVALID', 'sourceAdaptedIndex', 'Source index must be non-negative.'));
  if (!Number.isInteger(disposition?.recordPlanCount) || disposition.recordPlanCount < 0 || !Number.isInteger(disposition?.expectedBinaryRecordCount) || disposition.expectedBinaryRecordCount < 0) errors.push(issue('DSB_DISPOSITION_COUNT_INVALID', 'counts', 'Disposition counts must be non-negative integers.'));
  if (['zero_output', 'blocked'].includes(disposition?.status) && (disposition.recordPlanCount !== 0 || disposition.expectedBinaryRecordCount !== 0)) errors.push(issue('DSB_NO_OUTPUT_DISPOSITION_HAS_OUTPUT', 'counts', 'Zero-output and blocked dispositions cannot declare output.'));
  if (disposition?.status === 'adapted' && disposition.recordPlanCount < 1) errors.push(issue('DSB_ADAPTED_DISPOSITION_EMPTY', 'recordPlanCount', 'Adapted disposition requires a record-plan entry.'));
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function validateDSBRecordPlanV2(record) {
  const errors = [];
  if (record?.id !== dsbRecordPlanId(record?.recordPlanIndex, record?.type)) errors.push(issue('DSB_RECORD_PLAN_ID_NONDETERMINISTIC', 'id', 'Record-plan ID is not deterministic.'));
  if (!Object.hasOwn(COMMAND_BYTES, record?.type)) errors.push(issue('DSB_RECORD_PLAN_TYPE_INVALID', 'type', 'Record-plan type is invalid.'));
  if (!Number.isInteger(record?.recordPlanIndex) || record.recordPlanIndex < 0) errors.push(issue('DSB_RECORD_PLAN_INDEX_INVALID', 'recordPlanIndex', 'Record-plan index must be non-negative.'));
  if (!Number.isInteger(record?.dxUnits) || !Number.isInteger(record?.dyUnits)) errors.push(issue('DSB_RECORD_PLAN_DELTA_INVALID', 'deltas', 'Record-plan deltas must be integers.'));
  if (Math.abs(record?.dxUnits) > 127 || Math.abs(record?.dyUnits) > 127) errors.push(issue('DSB_RECORD_PLAN_DELTA_OUT_OF_RANGE', 'deltas', 'Record-plan movement exceeds 127 units.'));
  if (!record?.sourceMachineCommandId || !Number.isInteger(record?.sourceAdaptedIndex)) errors.push(issue('DSB_RECORD_PLAN_LINEAGE_REQUIRED', 'source', 'Source command lineage is required.'));
  if (!Number.isInteger(record?.splitIndex) || !Number.isInteger(record?.splitCount) || record.splitIndex < 0 || record.splitCount < 1 || record.splitIndex >= record.splitCount) errors.push(issue('DSB_RECORD_PLAN_SPLIT_INVALID', 'split', 'Split indexes are invalid.'));
  if (record?.expectedCommandByte !== COMMAND_BYTES[record?.type]) errors.push(issue('DSB_RECORD_PLAN_COMMAND_BYTE_INVALID', 'expectedCommandByte', 'Expected command byte does not match record type.'));
  if (['colorChange', 'end'].includes(record?.type) && (record.dxUnits !== 0 || record.dyUnits !== 0)) errors.push(issue('DSB_NON_MOVEMENT_RECORD_HAS_DELTA', 'deltas', 'Color change and END records cannot move.'));
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function validateDSBFormatAdaptationV2(adaptation, machineAdaptedStream) {
  const errors = []; const sourceCommands = machineAdaptedStream?.commands || []; const dispositions = adaptation?.dispositions || [];
  const recordPlan = adaptation?.recordPlan || []; const spans = adaptation?.binaryRecordSpans || [];
  dispositions.forEach((item, index) => errors.push(...validateDSBSourceCommandDispositionV2(item).errors.map(entry => ({ ...entry, path: `dispositions[${index}].${entry.path}` }))));
  recordPlan.forEach((item, index) => errors.push(...validateDSBRecordPlanV2(item).errors.map(entry => ({ ...entry, path: `recordPlan[${index}].${entry.path}` }))));
  duplicates(dispositions.map(item => item.sourceMachineCommandId)).forEach(id => errors.push(issue('DSB_DUPLICATE_SOURCE_DISPOSITION', 'dispositions', `Duplicate disposition for ${id}.`)));
  duplicates(recordPlan.map(item => item.id)).forEach(id => errors.push(issue('DSB_DUPLICATE_RECORD_PLAN', 'recordPlan', `Duplicate record-plan entry ${id}.`)));
  sourceCommands.forEach(source => {
    if (!dispositions.some(item => item.sourceMachineCommandId === source.id)) errors.push(issue('DSB_SOURCE_DISPOSITION_MISSING', 'dispositions', `No disposition for ${source.id}.`));
    if (!spans.some(item => item.sourceMachineCommandId === source.id)) errors.push(issue('DSB_BINARY_SPAN_MISSING', 'binaryRecordSpans', `No binary span for ${source.id}.`));
  });
  dispositions.forEach(item => { if (!sourceCommands.some(source => source.id === item.sourceMachineCommandId)) errors.push(issue('DSB_UNKNOWN_DISPOSITION_SOURCE', 'dispositions', `Unknown source ${item.sourceMachineCommandId}.`)); });
  recordPlan.forEach(item => { if (!sourceCommands.some(source => source.id === item.sourceMachineCommandId)) errors.push(issue('DSB_UNKNOWN_RECORD_PLAN_SOURCE', 'recordPlan', `Unknown source ${item.sourceMachineCommandId}.`)); });
  if (machineAdaptedStream?.machineProfile?.coordinateResolutionMm !== 0.1) errors.push(issue('DSB_ADAPTATION_RESOLUTION_INVALID', 'machineProfile.coordinateResolutionMm', 'DSB requires 0.1 mm source units.'));
  if (adaptation?.config?.maximumDeltaUnits !== 127) errors.push(issue('DSB_ADAPTATION_LIMIT_INVALID', 'config.maximumDeltaUnits', 'DSB limit must equal 127.'));
  const sourceIds = dispositions.map(item => item.sourceMachineCommandId);
  if (JSON.stringify(sourceIds) !== JSON.stringify(sourceCommands.map(command => command.id))) errors.push(issue('DSB_SOURCE_ORDER_CHANGED', 'dispositions', 'Source command order changed.'));
  recordPlan.forEach((record, index) => { if (record.recordPlanIndex !== index) errors.push(issue('DSB_RECORD_PLAN_INDEX_NONCONTIGUOUS', `recordPlan[${index}]`, 'Record-plan indexes must be contiguous.')); });

  if (adaptation?.valid) {
    if (dispositions.some(item => item.status === 'blocked')) errors.push(issue('DSB_PARTIAL_ADAPTATION_MARKED_VALID', 'valid', 'Blocked dispositions cannot appear in valid adaptation.'));
    const endRecords = recordPlan.filter(record => record.type === 'end');
    if (endRecords.length !== 1 || recordPlan.at(-1)?.type !== 'end') errors.push(issue('DSB_RECORD_PLAN_END_INVALID', 'recordPlan', 'Exactly one final END record is required.'));
    const sourceColorOrder = sourceCommands.filter(command => command.type === 'colorChange').map(command => command.threadId);
    const planColorOrder = recordPlan.filter(record => record.type === 'colorChange').map(record => record.source?.threadId);
    if (JSON.stringify(sourceColorOrder) !== JSON.stringify(planColorOrder)) errors.push(issue('DSB_COLOR_CHANGE_ORDER_CHANGED', 'recordPlan', 'Color-change order changed.'));
    sourceCommands.forEach(source => {
      const disposition = dispositions.find(item => item.sourceMachineCommandId === source.id); const records = recordPlan.filter(item => item.sourceMachineCommandId === source.id);
      if (disposition?.status === 'zero_output' && records.length) errors.push(issue('DSB_ZERO_OUTPUT_RECORD_EMITTED', 'recordPlan', `Zero-output source ${source.id} emitted records.`));
      if (['stitch', 'jump'].includes(source.type) && records.length) {
        const sumX = records.reduce((sum, record) => sum + record.dxUnits, 0); const sumY = records.reduce((sum, record) => sum + record.dyUnits, 0);
        if (sumX !== source.dxUnits || sumY !== source.dyUnits) errors.push(issue('DSB_SPLIT_SUM_MISMATCH', 'recordPlan', `Split records do not reproduce ${source.id}.`));
        if ((source.dxUnits !== 0 || source.dyUnits !== 0) && records.some(record => record.dxUnits === 0 && record.dyUnits === 0)) errors.push(issue('DSB_ZERO_LENGTH_SPLIT_SEGMENT', 'recordPlan', `Nonzero source ${source.id} contains a zero segment.`));
      }
    });
    if (adaptation.config.trimPolicy === 'explicit_no_output') {
      if (typeof adaptation.config.trimNoOutputAcknowledgement !== 'string' || !adaptation.config.trimNoOutputAcknowledgement.trim()) errors.push(issue('DSB_TRIM_ACKNOWLEDGEMENT_MISSING', 'config.trimNoOutputAcknowledgement', 'Acknowledgement is required for trim no-output.'));
      sourceCommands.filter(command => command.type === 'trim').forEach(source => {
        const disposition = dispositions.find(item => item.sourceMachineCommandId === source.id);
        if (disposition?.status !== 'zero_output' || disposition.reasonCode !== 'DSB_TRIM_EXPLICIT_NO_OUTPUT') errors.push(issue('DSB_TRIM_LINEAGE_INVALID', 'dispositions', `Trim ${source.id} lacks explicit zero-output lineage.`));
      });
    }
  }
  if (adaptation?.summary?.sourceCommandDispositionCoveragePercent !== 100 || adaptation?.summary?.silentSourceCommandDropCount !== 0) errors.push(issue('DSB_SOURCE_COVERAGE_BELOW_100', 'summary', 'Source disposition coverage must be complete.'));
  if (adaptation?.metadata?.sourceStreamMutationCount) errors.push(issue('DSB_SOURCE_MUTATION_DETECTED', 'metadata', 'Source stream mutation detected.'));
  if (adaptation?.metadata?.DSTInvocationCount || adaptation?.metadata?.Base44InvocationCount) errors.push(issue('DSB_FORBIDDEN_INVOCATION', 'metadata', 'DST and Base44 invocations are forbidden.'));
  return { valid: errors.length === 0, errors, warnings: adaptation?.warnings || [] };
}

export function validateDSBBinaryAcceptanceResultV2(result) {
  const errors = [];
  if (!(result?.bytes instanceof Uint8Array)) errors.push(issue('DSB_BINARY_BYTES_REQUIRED', 'bytes', 'Binary bytes must be Uint8Array.'));
  if (result?.format !== 'DSB') errors.push(issue('DSB_BINARY_FORMAT_INVALID', 'format', 'Binary format must be DSB.'));
  if (result?.byteLength !== result?.bytes?.length) errors.push(issue('DSB_BINARY_LENGTH_MISMATCH', 'byteLength', 'Byte length does not match bytes.'));
  if (result?.summary?.headerByteLength !== 512) errors.push(issue('DSB_BINARY_HEADER_SIZE_INVALID', 'summary.headerByteLength', 'DSB header must be 512 bytes.'));
  if (result?.summary?.binaryEndRecordCount !== 1) errors.push(issue('DSB_BINARY_END_COUNT_INVALID', 'summary.binaryEndRecordCount', 'Exactly one binary END is required.'));
  if (result?.summary?.finalEOFPresent !== true) errors.push(issue('DSB_BINARY_EOF_MISSING', 'summary.finalEOFPresent', 'Final EOF is required.'));
  if (result?.summary?.parserRoundtripPassed !== true) errors.push(issue('DSB_BINARY_PARSER_ROUNDTRIP_FAILED', 'summary.parserRoundtripPassed', 'Parser roundtrip must pass.'));
  if (result?.summary?.deterministicBytesVerified !== true) errors.push(issue('DSB_BINARY_NONDETERMINISTIC', 'summary.deterministicBytesVerified', 'Deterministic bytes are required.'));
  if (result?.summary?.binaryLineageCoveragePercent !== 100 || result?.summary?.silentBinaryLineageDropCount !== 0) errors.push(issue('DSB_BINARY_LINEAGE_INCOMPLETE', 'summary', 'Binary lineage must be complete.'));
  if (result?.summary?.physicalTrimEncoded !== false || result?.summary?.physicalTrimSupportVerified !== false) errors.push(issue('DSB_PHYSICAL_TRIM_CLAIM_INVALID', 'summary', 'Phase 12C cannot claim physical trim support.'));
  if (result?.valid && errors.length) errors.push(issue('DSB_INVALID_BINARY_MARKED_VALID', 'valid', 'Invalid binary cannot be accepted.'));
  return { valid: errors.length === 0, errors, warnings: result?.warnings || [] };
}
