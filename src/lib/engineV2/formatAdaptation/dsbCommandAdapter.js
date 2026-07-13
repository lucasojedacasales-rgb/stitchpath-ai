import { validateMachineAdaptedCommandStreamV2, validateMachineAdaptedCommandV2, validateMachineProfileV2 } from '../machineAdaptation/machineAdaptationValidation.js';
import { resolveDSBFormatConfig, validateDSBFormatConfig } from './dsbFormatConfig.js';
import { splitDSBIntegerMovement } from './dsbIntegerMovementSplitter.js';
import { createDSBBinaryRecordSpanV2, createDSBFormatAdaptationV2, createDSBRecordPlanV2, createDSBSourceCommandDispositionV2 } from './dsbFormatModel.js';

const COMMAND_BYTES = Object.freeze({ stitch: 0x80, jump: 0x81, colorChange: 0x88, end: 0xF8 });
const issue = (code, path, message, sourceMachineCommandId = null) => ({ code, path, message, sourceMachineCommandId });
const count = (items, type) => items.filter(item => item.type === type).length;

export function sanitizeDSBLabel(label) {
  const safe = String(label || 'design').replace(/[^\x20-\x7E]/g, '_').trim();
  return (safe || 'design').slice(0, 16);
}

function maxRecordDelta(recordPlan) {
  return recordPlan.filter(record => ['stitch', 'jump'].includes(record.type)).reduce((max, record) => Math.max(max, Math.abs(record.dxUnits), Math.abs(record.dyUnits)), 0);
}

function buildSummary(sourceCommands, dispositions, recordPlan, spans, metadata) {
  const ids = dispositions.map(item => item.sourceMachineCommandId); const unique = new Set(ids);
  return {
    sourceMachineCommandCount: sourceCommands.length, sourceDispositionCount: dispositions.length,
    sourceCommandDispositionCoveragePercent: sourceCommands.length ? unique.size / sourceCommands.length * 100 : 100,
    silentSourceCommandDropCount: sourceCommands.filter(command => !unique.has(command.id)).length,
    duplicateSourceDispositionCount: ids.length - unique.size, recordPlanCount: recordPlan.length,
    sourceStitchCommandCount: count(sourceCommands, 'stitch'), recordPlanStitchCount: count(recordPlan, 'stitch'),
    sourceJumpCommandCount: count(sourceCommands, 'jump'), recordPlanJumpCount: count(recordPlan, 'jump'),
    zeroDeltaStitchCount: metadata.zeroDeltaStitchCount, encodedZeroDeltaPenetrationCount: metadata.encodedZeroDeltaPenetrationCount,
    zeroDeltaJumpCount: metadata.zeroDeltaJumpCount, zeroJumpNoOutputCount: dispositions.filter(item => item.sourceType === 'jump' && item.status === 'zero_output').length,
    sourceTrimCommandCount: count(sourceCommands, 'trim'), blockedTrimCount: dispositions.filter(item => item.sourceType === 'trim' && item.status === 'blocked').length,
    trimZeroOutputCount: dispositions.filter(item => item.sourceType === 'trim' && item.status === 'zero_output').length, trimBinaryRecordCount: 0,
    sourceColorChangeCount: count(sourceCommands, 'colorChange'), recordPlanColorChangeCount: count(recordPlan, 'colorChange'),
    sourceEndCommandCount: count(sourceCommands, 'end'), recordPlanEndCount: count(recordPlan, 'end'),
    splitSourceMovementCount: metadata.splitSourceMovementCount, generatedSplitMovementCount: metadata.generatedSplitMovementCount,
    maximumRecordDeltaUnits: maxRecordDelta(recordPlan), exactFinalEndpointVerified: metadata.exactFinalEndpointVerified,
    expectedBinaryRecordCount: recordPlan.length, binaryLineageCoveragePercent: sourceCommands.length ? spans.length / sourceCommands.length * 100 : 100,
    silentBinaryLineageDropCount: sourceCommands.filter(command => !spans.some(span => span.sourceMachineCommandId === command.id)).length,
    trimIntentPresent: count(sourceCommands, 'trim') > 0, physicalTrimEncoded: false, physicalTrimSupportVerified: false,
    transactionBlocked: metadata.transactionBlocked === true, binaryOutputGenerated: false,
    sourceStreamMutationCount: metadata.sourceStreamMutationCount, encoderSourceFileModificationCount: 0, DSTInvocationCount: 0, Base44InvocationCount: 0,
  };
}

function rejectedAdaptation({ sourceCommands, dispositions, config, errors, warnings, metadata }) {
  const blocked = sourceCommands.map(command => {
    const prior = dispositions.find(item => item.sourceMachineCommandId === command.id);
    const trimBlocked = command.type === 'trim' && prior?.reasonCode === 'DSB_TRIM_UNSUPPORTED';
    return createDSBSourceCommandDispositionV2({
      sourceMachineCommandId: command.id, sourceAdaptedIndex: command.adaptedIndex, sourceType: command.type, status: 'blocked',
      reasonCode: trimBlocked ? 'DSB_TRIM_UNSUPPORTED' : prior?.status === 'blocked' ? prior.reasonCode : 'DSB_TRANSACTION_REJECTED',
      reason: trimBlocked ? prior.reason : prior?.reason || 'The DSB adaptation transaction was rejected.', expectedBinaryRecordCount: 0,
      source: { adapter: 'engine-v2-phase12c', rejectedPriorDisposition: prior || null },
    });
  });
  const spans = blocked.map(item => createDSBBinaryRecordSpanV2({ sourceMachineCommandId: item.sourceMachineCommandId, source: { adapter: 'engine-v2-phase12c', transactionRejected: true } }));
  const finalMetadata = { ...metadata, transactionBlocked: true, partialAdapterOutputRejected: true };
  return createDSBFormatAdaptationV2({
    dispositions: blocked, recordPlan: [], binaryRecordSpans: spans, valid: false, errors, warnings,
    summary: buildSummary(sourceCommands, blocked, [], spans, finalMetadata), config, metadata: finalMetadata,
  });
}

function movementReason(splitApplied, zeroStitch) {
  if (zeroStitch) return 'ENCODED_ZERO_DELTA_PENETRATION';
  return splitApplied ? 'DSB_MOVEMENT_SPLIT_TO_LIMIT' : 'DSB_MOVEMENT_WITHIN_LIMIT';
}

export function adaptMachineCommandStreamToDSB(machineAdaptedStream, rawConfig = {}) {
  const before = JSON.stringify(machineAdaptedStream); const config = resolveDSBFormatConfig(rawConfig); const configValidation = validateDSBFormatConfig(config);
  const sourceCommands = machineAdaptedStream?.commands || []; const errors = [...configValidation.errors]; const warnings = [];
  if (machineAdaptedStream?.valid !== true) errors.push(issue('INVALID_MACHINE_ADAPTED_STREAM', 'machineAdaptedStream.valid', 'A valid Phase 11 stream is required.'));
  errors.push(...validateMachineProfileV2(machineAdaptedStream?.machineProfile).errors);
  const canonicalContract = { commands: sourceCommands.map(command => ({ id: command.sourceCanonicalCommandId, type: command.type })) };
  errors.push(...validateMachineAdaptedCommandStreamV2(machineAdaptedStream, canonicalContract).errors.map(entry => issue(entry.code, `machineAdaptedStream.${entry.path}`, entry.message)));
  if (machineAdaptedStream?.machineProfile?.coordinateResolutionMm !== config.requiredCoordinateResolutionMm) errors.push(issue('DSB_SOURCE_RESOLUTION_INCOMPATIBLE', 'machineProfile.coordinateResolutionMm', 'Source stream must use 0.1 mm integer units.'));
  if (machineAdaptedStream?.machineProfile?.initialMachinePositionUnits?.x !== 0 || machineAdaptedStream?.machineProfile?.initialMachinePositionUnits?.y !== 0) errors.push(issue('DSB_INITIAL_MACHINE_POSITION_UNSUPPORTED', 'machineProfile.initialMachinePositionUnits', 'The DSB binary record stream starts at integer origin 0,0.'));
  const endIndexes = sourceCommands.map((command, index) => command.type === 'end' ? index : -1).filter(index => index >= 0);
  if (endIndexes.length !== 1) errors.push(issue('DSB_SOURCE_END_COUNT_INVALID', 'commands', 'Exactly one source END is required.'));
  if (endIndexes.length === 1 && endIndexes[0] !== sourceCommands.length - 1) errors.push(issue('DSB_SOURCE_COMMAND_AFTER_END', `commands[${endIndexes[0]}]`, 'END must be final.'));
  if (sourceCommands[0]?.type === 'colorChange') errors.push(issue('DSB_INITIAL_COLOR_MUST_BE_IMPLICIT', 'commands[0]', 'Initial thread cannot begin with colorChange.'));
  sourceCommands.forEach((command, index) => {
    const validation = validateMachineAdaptedCommandV2(command);
    errors.push(...validation.errors.map(entry => issue(entry.code, `commands[${index}].${entry.path}`, entry.message, command?.id)));
    if (index && command.type === 'colorChange' && sourceCommands[index - 1]?.type === 'colorChange') errors.push(issue('DSB_ADJACENT_COLOR_CHANGES', `commands[${index}]`, 'Adjacent color changes are forbidden.', command.id));
    if (command.type === 'colorChange' && sourceCommands[index + 1]?.type === 'end') errors.push(issue('DSB_TRAILING_COLOR_CHANGE', `commands[${index}]`, 'A color change cannot immediately precede END.', command.id));
    if (['stitch', 'jump', 'trim', 'colorChange'].includes(command.type) && !command.threadId) errors.push(issue('DSB_THREAD_ID_REQUIRED', `commands[${index}].threadId`, 'Thread identity is required.', command.id));
  });

  const dispositions = []; const recordPlan = []; const spanDrafts = [];
  let currentXUnits = 0; let currentYUnits = 0; let expectedRecordIndex = 0;
  let zeroDeltaStitchCount = 0; let encodedZeroDeltaPenetrationCount = 0; let zeroDeltaJumpCount = 0;
  let splitSourceMovementCount = 0; let generatedSplitMovementCount = 0; let exactFinalEndpointVerified = true;

  for (let sourceIndex = 0; sourceIndex < sourceCommands.length; sourceIndex += 1) {
    const sourceCommand = sourceCommands[sourceIndex]; const firstPlanIndex = recordPlan.length; const commandErrors = [];
    const expectedX = currentXUnits + sourceCommand.dxUnits; const expectedY = currentYUnits + sourceCommand.dyUnits;
    if (sourceCommand.xUnits !== expectedX || sourceCommand.yUnits !== expectedY) commandErrors.push(issue('DSB_SOURCE_ABSOLUTE_DELTA_INCONSISTENT', `commands[${sourceIndex}]`, 'Absolute and delta unit coordinates are inconsistent.', sourceCommand.id));
    if (!['stitch', 'jump'].includes(sourceCommand.type) && (sourceCommand.xUnits !== currentXUnits || sourceCommand.yUnits !== currentYUnits)) commandErrors.push(issue('DSB_NON_MOVEMENT_POSITION_CHANGED', `commands[${sourceIndex}]`, 'Non-movement command changed position.', sourceCommand.id));
    const zeroMovement = ['stitch', 'jump'].includes(sourceCommand.type) && sourceCommand.dxUnits === 0 && sourceCommand.dyUnits === 0;
    if (sourceCommand.type === 'stitch' && zeroMovement) zeroDeltaStitchCount += 1;
    if (sourceCommand.type === 'jump' && zeroMovement) zeroDeltaJumpCount += 1;

    if (sourceCommand.type === 'jump' && zeroMovement && config.zeroDeltaJumpPolicy === 'explicit_no_output') {
      dispositions.push(createDSBSourceCommandDispositionV2({ sourceMachineCommandId: sourceCommand.id, sourceAdaptedIndex: sourceCommand.adaptedIndex, sourceType: 'jump', status: 'zero_output', reasonCode: 'ZERO_DISTANCE_JUMP_NO_BINARY_RECORD', reason: 'Zero-distance jump has explicit no-output DSB lineage.', source: { adapter: 'engine-v2-phase12c' } }));
      spanDrafts.push({ sourceMachineCommandId: sourceCommand.id, sourceRecordPlanIds: [], expectedBinaryRecordCount: 0 });
      continue;
    }
    if (!commandErrors.length && sourceCommand.type === 'trim' && config.trimPolicy === 'explicit_no_output' && typeof config.trimNoOutputAcknowledgement === 'string' && config.trimNoOutputAcknowledgement.trim()) {
      dispositions.push(createDSBSourceCommandDispositionV2({ sourceMachineCommandId: sourceCommand.id, sourceAdaptedIndex: sourceCommand.adaptedIndex, sourceType: 'trim', status: 'zero_output', reasonCode: 'DSB_TRIM_EXPLICIT_NO_OUTPUT', reason: 'Trim intent retained without a DSB binary record under acknowledged policy.', warnings: ['Physical trim is not encoded or verified.'], source: { adapter: 'engine-v2-phase12c', trimNoOutputAcknowledgement: config.trimNoOutputAcknowledgement } }));
      spanDrafts.push({ sourceMachineCommandId: sourceCommand.id, sourceRecordPlanIds: [], expectedBinaryRecordCount: 0 });
      warnings.push(issue('DSB_PHYSICAL_TRIM_NOT_ENCODED', `commands[${sourceIndex}]`, 'Trim intent has no binary representation or verified physical support.', sourceCommand.id));
      continue;
    }
    if (sourceCommand.type === 'jump' && zeroMovement) commandErrors.push(issue('DSB_ZERO_JUMP_BLOCKED', `commands[${sourceIndex}]`, 'Zero-distance jump blocked by policy.', sourceCommand.id));
    if (sourceCommand.type === 'stitch' && zeroMovement && config.zeroDeltaStitchPolicy === 'block') commandErrors.push(issue('DSB_ZERO_STITCH_BLOCKED', `commands[${sourceIndex}]`, 'Zero-distance stitch blocked by policy.', sourceCommand.id));
    if (sourceCommand.type === 'trim' && config.trimPolicy === 'block') commandErrors.push(issue('DSB_TRIM_UNSUPPORTED', `commands[${sourceIndex}]`, 'The verified DSB contract has no physical trim representation.', sourceCommand.id));
    if (!['stitch', 'jump', 'trim', 'colorChange', 'end'].includes(sourceCommand.type)) commandErrors.push(issue('DSB_SOURCE_COMMAND_UNSUPPORTED', `commands[${sourceIndex}]`, 'Source command type is unsupported.', sourceCommand.id));

    if (!commandErrors.length && ['stitch', 'jump'].includes(sourceCommand.type)) {
      const split = zeroMovement
        ? { valid: true, segments: [{ dxUnits: 0, dyUnits: 0, splitIndex: 0, splitCount: 1 }], splitApplied: false, errors: [] }
        : splitDSBIntegerMovement({ dxUnits: sourceCommand.dxUnits, dyUnits: sourceCommand.dyUnits, maximumDeltaUnits: config.maximumDeltaUnits, commandType: sourceCommand.type });
      if (!split.valid) commandErrors.push(...split.errors.map(entry => issue(entry.code, `commands[${sourceIndex}]`, entry.message, sourceCommand.id)));
      else {
        if (split.splitApplied) { splitSourceMovementCount += 1; generatedSplitMovementCount += split.segments.length; }
        for (const segment of split.segments) {
          recordPlan.push(createDSBRecordPlanV2({
            recordPlanIndex: recordPlan.length, type: sourceCommand.type, dxUnits: segment.dxUnits, dyUnits: segment.dyUnits,
            sourceMachineCommandId: sourceCommand.id, sourceAdaptedIndex: sourceCommand.adaptedIndex,
            sourceCanonicalCommandId: sourceCommand.sourceCanonicalCommandId, splitIndex: segment.splitIndex, splitCount: segment.splitCount,
            expectedCommandByte: COMMAND_BYTES[sourceCommand.type], reasonCode: movementReason(split.splitApplied, zeroMovement && sourceCommand.type === 'stitch'),
            source: { adapter: 'engine-v2-phase12c', threadId: sourceCommand.threadId, objectId: sourceCommand.objectId, regionId: sourceCommand.regionId },
          }));
        }
        if (sourceCommand.type === 'stitch' && zeroMovement) encodedZeroDeltaPenetrationCount += 1;
      }
    } else if (!commandErrors.length && ['colorChange', 'end'].includes(sourceCommand.type)) {
      recordPlan.push(createDSBRecordPlanV2({
        recordPlanIndex: recordPlan.length, type: sourceCommand.type, dxUnits: 0, dyUnits: 0,
        sourceMachineCommandId: sourceCommand.id, sourceAdaptedIndex: sourceCommand.adaptedIndex,
        sourceCanonicalCommandId: sourceCommand.sourceCanonicalCommandId, expectedCommandByte: COMMAND_BYTES[sourceCommand.type],
        reasonCode: sourceCommand.type === 'colorChange' ? 'DSB_COLOR_CHANGE_RECORD' : 'DSB_FINAL_END',
        source: { adapter: 'engine-v2-phase12c', threadId: sourceCommand.threadId, objectId: sourceCommand.objectId, regionId: sourceCommand.regionId },
      }));
    }

    errors.push(...commandErrors); const produced = recordPlan.length - firstPlanIndex; const producedRecords = recordPlan.slice(firstPlanIndex);
    dispositions.push(createDSBSourceCommandDispositionV2({
      sourceMachineCommandId: sourceCommand.id, sourceAdaptedIndex: sourceCommand.adaptedIndex, sourceType: sourceCommand.type,
      status: commandErrors.length ? 'blocked' : 'adapted', reasonCode: commandErrors[0]?.code || producedRecords[0]?.reasonCode,
      reason: commandErrors[0]?.message || null, firstDSBRecordPlanIndex: produced ? firstPlanIndex : null,
      lastDSBRecordPlanIndex: produced ? recordPlan.length - 1 : null, recordPlanCount: produced, expectedBinaryRecordCount: produced,
      source: { adapter: 'engine-v2-phase12c' },
    }));
    spanDrafts.push({
      sourceMachineCommandId: sourceCommand.id, sourceRecordPlanIds: producedRecords.map(record => record.id),
      expectedFirstBinaryRecordIndex: produced ? expectedRecordIndex : null,
      expectedLastBinaryRecordIndex: produced ? expectedRecordIndex + produced - 1 : null, expectedBinaryRecordCount: produced,
    });
    expectedRecordIndex += produced;
    if (['stitch', 'jump'].includes(sourceCommand.type) && !commandErrors.length) {
      currentXUnits = sourceCommand.xUnits; currentYUnits = sourceCommand.yUnits;
      const sumX = producedRecords.reduce((sum, record) => sum + record.dxUnits, 0); const sumY = producedRecords.reduce((sum, record) => sum + record.dyUnits, 0);
      exactFinalEndpointVerified = exactFinalEndpointVerified && sumX === sourceCommand.dxUnits && sumY === sourceCommand.dyUnits;
    }
  }

  const sourceStreamMutationCount = before === JSON.stringify(machineAdaptedStream) ? 0 : 1;
  if (sourceStreamMutationCount) errors.push(issue('DSB_SOURCE_STREAM_MUTATED', 'machineAdaptedStream', 'Source stream changed during adaptation.'));
  const metadata = {
    adapterApplied: true, trimPolicy: config.trimPolicy, trimNoOutputAcknowledgement: config.trimNoOutputAcknowledgement,
    sourceStreamMutationCount, splitSourceMovementCount, generatedSplitMovementCount, zeroDeltaStitchCount,
    encodedZeroDeltaPenetrationCount, zeroDeltaJumpCount, exactFinalEndpointVerified, transactionBlocked: errors.length > 0,
    physicalTrimEncoded: false, physicalTrimSupportVerified: false, DSBLowLevelEncoderInvoked: false,
    DSTInvocationCount: 0, Base44InvocationCount: 0, applicationConnected: false,
  };
  if (errors.length) return rejectedAdaptation({ sourceCommands, dispositions, config, errors, warnings, metadata });

  const binaryRecordSpans = spanDrafts.map(createDSBBinaryRecordSpanV2);
  const headerMetadata = {
    label: sanitizeDSBLabel(config.label), expectedBinaryRecordCount: recordPlan.length,
    expectedColorChangeCount: count(recordPlan, 'colorChange'), expectedEndRecordCount: count(recordPlan, 'end'),
    expectedFinalPosition: { xUnits: currentXUnits, yUnits: currentYUnits },
    trimNoOutputAcknowledgement: config.trimNoOutputAcknowledgement,
  };
  const validMetadata = { ...metadata, transactionBlocked: false };
  return createDSBFormatAdaptationV2({
    dispositions, recordPlan, binaryRecordSpans, headerMetadata, valid: true, errors, warnings,
    summary: buildSummary(sourceCommands, dispositions, recordPlan, binaryRecordSpans, validMetadata), config, metadata: validMetadata,
  });
}
