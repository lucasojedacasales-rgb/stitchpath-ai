import { validateMachineAdaptedCommandStreamV2, validateMachineAdaptedCommandV2, validateMachineProfileV2 } from '../machineAdaptation/machineAdaptationValidation.js';
import { resolveDSTFormatConfig, validateDSTFormatConfig } from './dstFormatConfig.js';
import { splitDSTIntegerMovement } from './dstIntegerMovementSplitter.js';
import { createDSTBinaryRecordSpanV2, createDSTEncoderCommandV2, createDSTFormatAdaptationV2, createDSTSourceCommandDispositionV2 } from './dstFormatModel.js';

const issue = (code, path, message, sourceMachineCommandId = null) => ({ code, path, message, sourceMachineCommandId });
const count = (items, type) => items.filter(item => item.type === type).length;
const maxDelta = commands => commands.filter(command => ['stitch', 'jump'].includes(command.type)).reduce((max, command, index, all) => {
  const previous = index ? all[index - 1] : null;
  const previousX = previous ? Math.round(previous.x * 10) : null;
  const previousY = previous ? Math.round(previous.y * 10) : null;
  const source = command.source?.adapterDeltaUnits;
  return Math.max(max, Math.abs(source?.dxUnits ?? (previousX == null ? 0 : Math.round(command.x * 10) - previousX)), Math.abs(source?.dyUnits ?? (previousY == null ? 0 : Math.round(command.y * 10) - previousY)));
}, 0);

export function sanitizeDSTLabel(label) {
  const safe = String(label || 'design').replace(/[^\x20-\x7E]/g, '_').trim();
  return (safe || 'design').slice(0, 16);
}

function commandReason(type, splitApplied, zeroStitch = false) {
  if (zeroStitch) return 'ENCODED_ZERO_DELTA_PENETRATION';
  if (type === 'trim') return 'DST_LEGACY_THREE_ZERO_JUMP_TRIM';
  if (type === 'colorChange') return 'DST_COLOR_CHANGE_STOP';
  if (type === 'end') return 'DST_FINAL_END';
  return splitApplied ? 'DST_MOVEMENT_SPLIT_TO_LIMIT' : 'DST_MOVEMENT_WITHIN_LIMIT';
}

function buildSummary(sourceCommands, dispositions, encoderCommands, spans, metadata) {
  const ids = dispositions.map(item => item.sourceMachineCommandId); const unique = new Set(ids);
  const expectedTrimBinaryRecordCount = dispositions.filter(item => item.sourceType === 'trim').reduce((sum, item) => sum + item.expectedBinaryRecordCount, 0);
  return {
    sourceMachineCommandCount: sourceCommands.length,
    sourceDispositionCount: dispositions.length,
    sourceCommandDispositionCoveragePercent: sourceCommands.length ? unique.size / sourceCommands.length * 100 : 100,
    silentSourceCommandDropCount: sourceCommands.filter(command => !unique.has(command.id)).length,
    duplicateSourceDispositionCount: ids.length - unique.size,
    blockedSourceCommandCount: dispositions.filter(item => item.status === 'blocked').length,
    adapterEncoderCommandCount: encoderCommands.length,
    sourceStitchCommandCount: count(sourceCommands, 'stitch'), adapterStitchCommandCount: count(encoderCommands, 'stitch'),
    sourceJumpCommandCount: count(sourceCommands, 'jump'), adapterJumpCommandCount: count(encoderCommands, 'jump'),
    zeroDeltaStitchCount: metadata.zeroDeltaStitchCount, encodedZeroDeltaPenetrationCount: metadata.encodedZeroDeltaPenetrationCount,
    zeroDeltaJumpCount: metadata.zeroDeltaJumpCount, zeroJumpNoOutputCount: dispositions.filter(item => item.status === 'zero_output').length,
    sourceTrimCommandCount: count(sourceCommands, 'trim'), adapterTrimCommandCount: count(encoderCommands, 'trim'), expectedTrimBinaryRecordCount,
    sourceColorChangeCount: count(sourceCommands, 'colorChange'), adapterColorChangeCount: count(encoderCommands, 'colorChange'),
    sourceEndCommandCount: count(sourceCommands, 'end'), adapterEndCommandCount: count(encoderCommands, 'end'),
    splitSourceMovementCount: metadata.splitSourceMovementCount, generatedSplitMovementCount: metadata.generatedSplitMovementCount,
    maximumAdapterDeltaUnits: maxDelta(encoderCommands), exactFinalEndpointVerified: metadata.exactFinalEndpointVerified,
    expectedBinaryRecordCount: encoderCommands.reduce((sum, command) => sum + command.expectedBinaryRecordCount, 0),
    binaryLineageCoveragePercent: sourceCommands.length ? spans.length / sourceCommands.length * 100 : 100,
    silentBinaryLineageDropCount: sourceCommands.filter(command => !spans.some(span => span.sourceMachineCommandId === command.id)).length,
    sourceStreamMutationCount: metadata.sourceStreamMutationCount,
    encoderSourceFileModificationCount: 0, DSBInvocationCount: 0, Base44InvocationCount: 0,
  };
}

function rejectedAdaptation({ sourceCommands, dispositions, config, errors, warnings, metadata }) {
  const blocked = sourceCommands.map(command => {
    const prior = dispositions.find(item => item.sourceMachineCommandId === command.id);
    return createDSTSourceCommandDispositionV2({
      sourceMachineCommandId: command.id, sourceAdaptedIndex: command.adaptedIndex, sourceType: command.type, status: 'blocked',
      reasonCode: prior?.status === 'blocked' ? prior.reasonCode : 'DST_TRANSACTION_REJECTED',
      reason: prior?.reason || 'The DST adaptation transaction was rejected.', expectedBinaryRecordCount: 0,
      warnings: prior?.warnings || [], source: { adapter: 'engine-v2-phase12b', rejectedPriorDisposition: prior || null },
    });
  });
  const spans = blocked.map(item => createDSTBinaryRecordSpanV2({ sourceMachineCommandId: item.sourceMachineCommandId, expectedRecordCount: 0, source: { adapter: 'engine-v2-phase12b', transactionRejected: true } }));
  const finalMetadata = { ...metadata, partialAdapterOutputRejected: true };
  return createDSTFormatAdaptationV2({ dispositions: blocked, encoderCommands: [], binaryRecordSpans: spans, valid: false, errors, warnings, summary: buildSummary(sourceCommands, blocked, [], spans, finalMetadata), config, metadata: finalMetadata });
}

export function adaptMachineCommandStreamToDST(machineAdaptedStream, rawConfig = {}) {
  const before = JSON.stringify(machineAdaptedStream); const config = resolveDSTFormatConfig(rawConfig); const configValidation = validateDSTFormatConfig(config);
  const sourceCommands = machineAdaptedStream?.commands || []; const errors = [...configValidation.errors]; const warnings = [];
  if (machineAdaptedStream?.valid !== true) errors.push(issue('INVALID_MACHINE_ADAPTED_STREAM', 'machineAdaptedStream.valid', 'A valid Phase 11 stream is required.'));
  errors.push(...validateMachineProfileV2(machineAdaptedStream?.machineProfile).errors);
  const canonicalContract = { commands: sourceCommands.map(command => ({ id: command.sourceCanonicalCommandId, type: command.type })) };
  errors.push(...validateMachineAdaptedCommandStreamV2(machineAdaptedStream, canonicalContract).errors.map(entry => issue(entry.code, `machineAdaptedStream.${entry.path}`, entry.message)));
  if (machineAdaptedStream?.machineProfile?.coordinateResolutionMm !== config.requiredCoordinateResolutionMm) errors.push(issue('DST_SOURCE_RESOLUTION_INCOMPATIBLE', 'machineProfile.coordinateResolutionMm', 'Source stream must use 0.1 mm units.'));
  if (machineAdaptedStream?.machineProfile?.initialMachinePositionUnits?.x !== 0 || machineAdaptedStream?.machineProfile?.initialMachinePositionUnits?.y !== 0) errors.push(issue('DST_INITIAL_MACHINE_POSITION_UNSUPPORTED', 'machineProfile.initialMachinePositionUnits', 'The existing DST encoder starts at integer origin 0,0.'));
  const endIndexes = sourceCommands.map((command, index) => command.type === 'end' ? index : -1).filter(index => index >= 0);
  if (endIndexes.length !== 1) errors.push(issue('DST_SOURCE_END_COUNT_INVALID', 'commands', 'Exactly one source END is required.'));
  if (endIndexes.length === 1 && endIndexes[0] !== sourceCommands.length - 1) errors.push(issue('DST_SOURCE_COMMAND_AFTER_END', `commands[${endIndexes[0]}]`, 'END must be final.'));
  if (sourceCommands[0]?.type === 'colorChange') errors.push(issue('DST_INITIAL_COLOR_MUST_BE_IMPLICIT', 'commands[0]', 'Initial thread cannot begin with colorChange.'));
  sourceCommands.forEach((command, index) => {
    const validation = validateMachineAdaptedCommandV2(command);
    errors.push(...validation.errors.map(entry => issue(entry.code, `commands[${index}].${entry.path}`, entry.message, command?.id)));
    if (index && command.type === 'colorChange' && sourceCommands[index - 1]?.type === 'colorChange') errors.push(issue('DST_ADJACENT_COLOR_CHANGES', `commands[${index}]`, 'Adjacent color changes are forbidden.', command.id));
    if (command.type === 'colorChange' && sourceCommands[index + 1]?.type === 'end') errors.push(issue('DST_TRAILING_COLOR_CHANGE', `commands[${index}]`, 'A color change cannot immediately precede END.', command.id));
    if (['stitch', 'jump', 'trim', 'colorChange'].includes(command.type) && !command.threadId) errors.push(issue('DST_THREAD_ID_REQUIRED', `commands[${index}].threadId`, 'Thread identity is required.', command.id));
  });

  const dispositions = []; const encoderCommands = []; const spanDrafts = [];
  const initial = machineAdaptedStream?.machineProfile?.initialMachinePositionUnits || { x: 0, y: 0 };
  let currentXUnits = initial.x; let currentYUnits = initial.y; let expectedRecordIndex = 0;
  let zeroDeltaStitchCount = 0; let encodedZeroDeltaPenetrationCount = 0; let zeroDeltaJumpCount = 0;
  let splitSourceMovementCount = 0; let generatedSplitMovementCount = 0; let exactFinalEndpointVerified = true;

  for (let sourceIndex = 0; sourceIndex < sourceCommands.length; sourceIndex += 1) {
    const sourceCommand = sourceCommands[sourceIndex]; const firstDSTCommandIndex = encoderCommands.length; const commandErrors = [];
    const expectedX = currentXUnits + sourceCommand.dxUnits; const expectedY = currentYUnits + sourceCommand.dyUnits;
    if (sourceCommand.xUnits !== expectedX || sourceCommand.yUnits !== expectedY) commandErrors.push(issue('DST_SOURCE_ABSOLUTE_DELTA_INCONSISTENT', `commands[${sourceIndex}]`, 'Absolute and delta unit coordinates are inconsistent.', sourceCommand.id));
    const zeroMovement = ['stitch', 'jump'].includes(sourceCommand.type) && sourceCommand.dxUnits === 0 && sourceCommand.dyUnits === 0;
    if (sourceCommand.type === 'stitch' && zeroMovement) zeroDeltaStitchCount += 1;
    if (sourceCommand.type === 'jump' && zeroMovement) zeroDeltaJumpCount += 1;

    if (sourceCommand.type === 'jump' && zeroMovement && config.zeroDeltaJumpPolicy === 'explicit_no_output') {
      dispositions.push(createDSTSourceCommandDispositionV2({ sourceMachineCommandId: sourceCommand.id, sourceAdaptedIndex: sourceCommand.adaptedIndex, sourceType: sourceCommand.type, status: 'zero_output', reasonCode: 'ZERO_DISTANCE_JUMP_NO_BINARY_RECORD', reason: 'Zero-distance jump has explicit no-output DST disposition.', expectedBinaryRecordCount: 0, source: { adapter: 'engine-v2-phase12b' } }));
      spanDrafts.push({ sourceMachineCommandId: sourceCommand.id, sourceDSTCommandIds: [], expectedFirstRecordIndex: null, expectedLastRecordIndex: null, expectedRecordCount: 0 });
      continue;
    }
    if (sourceCommand.type === 'jump' && zeroMovement) commandErrors.push(issue('DST_ZERO_JUMP_BLOCKED', `commands[${sourceIndex}]`, 'Zero-distance jump blocked by policy.', sourceCommand.id));
    if (sourceCommand.type === 'stitch' && zeroMovement && config.zeroDeltaStitchPolicy === 'block') commandErrors.push(issue('DST_ZERO_STITCH_BLOCKED', `commands[${sourceIndex}]`, 'Zero-distance stitch blocked by policy.', sourceCommand.id));
    if (sourceCommand.type === 'trim' && config.trimPolicy === 'block') commandErrors.push(issue('DST_TRIM_BLOCKED', `commands[${sourceIndex}]`, 'Trim blocked by policy.', sourceCommand.id));

    if (!commandErrors.length && ['stitch', 'jump'].includes(sourceCommand.type)) {
      const split = zeroMovement
        ? { valid: true, segments: [{ xUnits: currentXUnits, yUnits: currentYUnits, dxUnits: 0, dyUnits: 0, splitIndex: 0, splitCount: 1 }], splitApplied: false, errors: [] }
        : splitDSTIntegerMovement({ startXUnits: currentXUnits, startYUnits: currentYUnits, targetXUnits: sourceCommand.xUnits, targetYUnits: sourceCommand.yUnits, maximumDeltaUnits: config.maximumDeltaUnits });
      if (!split.valid) commandErrors.push(...split.errors.map(entry => issue(entry.code, `commands[${sourceIndex}]`, entry.message, sourceCommand.id)));
      else {
        if (split.splitApplied) { splitSourceMovementCount += 1; generatedSplitMovementCount += split.segments.length; }
        for (const segment of split.segments) {
          encoderCommands.push(createDSTEncoderCommandV2({
            dstCommandIndex: encoderCommands.length, type: sourceCommand.type, x: segment.xUnits / 10, y: segment.yUnits / 10, color: sourceCommand.threadId,
            sourceMachineCommandId: sourceCommand.id, sourceAdaptedIndex: sourceCommand.adaptedIndex, sourceCanonicalCommandId: sourceCommand.sourceCanonicalCommandId,
            splitIndex: segment.splitIndex, splitCount: segment.splitCount, expectedBinaryRecordCount: 1,
            reasonCode: commandReason(sourceCommand.type, split.splitApplied, zeroMovement && sourceCommand.type === 'stitch'),
            source: { adapter: 'engine-v2-phase12b', adapterDeltaUnits: { dxUnits: segment.dxUnits, dyUnits: segment.dyUnits } },
          }));
        }
        if (zeroMovement && sourceCommand.type === 'stitch') encodedZeroDeltaPenetrationCount += 1;
      }
    } else if (!commandErrors.length && ['trim', 'colorChange', 'end'].includes(sourceCommand.type)) {
      const expectedBinaryRecordCount = sourceCommand.type === 'trim' ? 3 : 1;
      encoderCommands.push(createDSTEncoderCommandV2({
        dstCommandIndex: encoderCommands.length, type: sourceCommand.type, x: currentXUnits / 10, y: currentYUnits / 10,
        color: sourceCommand.type === 'end' ? null : sourceCommand.threadId, sourceMachineCommandId: sourceCommand.id,
        sourceAdaptedIndex: sourceCommand.adaptedIndex, sourceCanonicalCommandId: sourceCommand.sourceCanonicalCommandId,
        expectedBinaryRecordCount, reasonCode: commandReason(sourceCommand.type, false), source: { adapter: 'engine-v2-phase12b' },
      }));
    }

    errors.push(...commandErrors); const produced = encoderCommands.length - firstDSTCommandIndex;
    const producedCommands = encoderCommands.slice(firstDSTCommandIndex); const expectedBinaryRecordCount = producedCommands.reduce((sum, command) => sum + command.expectedBinaryRecordCount, 0);
    dispositions.push(createDSTSourceCommandDispositionV2({
      sourceMachineCommandId: sourceCommand.id, sourceAdaptedIndex: sourceCommand.adaptedIndex, sourceType: sourceCommand.type,
      status: commandErrors.length ? 'blocked' : 'adapted', reasonCode: commandErrors[0]?.code || producedCommands[0]?.reasonCode,
      reason: commandErrors[0]?.message || null, firstDSTCommandIndex: produced ? firstDSTCommandIndex : null,
      lastDSTCommandIndex: produced ? encoderCommands.length - 1 : null, dstCommandCount: produced, expectedBinaryRecordCount,
      source: { adapter: 'engine-v2-phase12b' },
    }));
    spanDrafts.push({ sourceMachineCommandId: sourceCommand.id, sourceDSTCommandIds: producedCommands.map(command => command.id), expectedFirstRecordIndex: expectedBinaryRecordCount ? expectedRecordIndex : null, expectedLastRecordIndex: expectedBinaryRecordCount ? expectedRecordIndex + expectedBinaryRecordCount - 1 : null, expectedRecordCount: expectedBinaryRecordCount });
    expectedRecordIndex += expectedBinaryRecordCount;
    if (['stitch', 'jump'].includes(sourceCommand.type) && !commandErrors.length) { currentXUnits = sourceCommand.xUnits; currentYUnits = sourceCommand.yUnits; }
    if (!['stitch', 'jump'].includes(sourceCommand.type) && (sourceCommand.xUnits !== currentXUnits || sourceCommand.yUnits !== currentYUnits)) errors.push(issue('DST_NON_MOVEMENT_POSITION_CHANGED', `commands[${sourceIndex}]`, 'Non-movement command changed position.', sourceCommand.id));
    if (producedCommands.length && ['stitch', 'jump'].includes(sourceCommand.type)) {
      const final = producedCommands.at(-1); exactFinalEndpointVerified = exactFinalEndpointVerified && Math.round(final.x * 10) === sourceCommand.xUnits && Math.round(final.y * 10) === sourceCommand.yUnits;
    }
  }

  const sourceStreamMutationCount = before === JSON.stringify(machineAdaptedStream) ? 0 : 1;
  if (sourceStreamMutationCount) errors.push(issue('DST_SOURCE_STREAM_MUTATED', 'machineAdaptedStream', 'Source stream changed during adaptation.'));
  const metadata = { adapterApplied: true, sourceStreamMutationCount, splitSourceMovementCount, generatedSplitMovementCount, zeroDeltaStitchCount, encodedZeroDeltaPenetrationCount, zeroDeltaJumpCount, exactFinalEndpointVerified, DSTEncoderInvoked: false, DSBInvocationCount: 0, Base44InvocationCount: 0, applicationConnected: false };
  if (errors.length) return rejectedAdaptation({ sourceCommands, dispositions, config, errors, warnings, metadata });

  const binaryRecordSpans = spanDrafts.map(createDSTBinaryRecordSpanV2);
  const stitchCommands = encoderCommands.filter(command => command.type === 'stitch');
  const xs = stitchCommands.map(command => Math.round(command.x * 10)); const ys = stitchCommands.map(command => Math.round(command.y * 10));
  const bounds = { plusX: Math.max(0, ...xs), minusX: -Math.min(0, ...xs), plusY: Math.max(0, ...ys), minusY: -Math.min(0, ...ys) };
  const colorChanges = count(encoderCommands, 'colorChange');
  const headerMetadata = {
    label: sanitizeDSTLabel(config.label), expectedThreadBlockCount: colorChanges + (encoderCommands.some(command => ['stitch', 'jump'].includes(command.type)) ? 1 : 0),
    expectedColorChangeCount: colorChanges, expectedBinaryRecordCount: encoderCommands.reduce((sum, command) => sum + command.expectedBinaryRecordCount, 0),
    expectedStitchMovementRecordCount: count(encoderCommands, 'stitch'), expectedJumpMovementRecordCount: count(encoderCommands, 'jump'),
    expectedTrimRecordCount: count(encoderCommands, 'trim') * 3, expectedEndRecordCount: count(encoderCommands, 'end'), expectedBounds: bounds,
  };
  const summary = buildSummary(sourceCommands, dispositions, encoderCommands, binaryRecordSpans, metadata);
  return createDSTFormatAdaptationV2({ dispositions, encoderCommands, binaryRecordSpans, headerMetadata, valid: true, errors, warnings, summary, config, metadata });
}
