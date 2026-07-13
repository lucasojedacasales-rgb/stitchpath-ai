import { validateMachineAdaptedCommandStreamV2 } from './machineAdaptationValidation.js';

const bounds = (commands, xKey, yKey) => {
  if (!commands.length) return null; const xs = commands.map(command => command[xKey]); const ys = commands.map(command => command[yKey]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
};

export function createMachineAdaptationDiagnostic({ canonicalCompilation, machineAdaptedStream }) {
  const validation = validateMachineAdaptedCommandStreamV2(machineAdaptedStream, canonicalCompilation); const summary = machineAdaptedStream?.summary || {}; const commands = machineAdaptedStream?.commands || [];
  return {
    valid: machineAdaptedStream?.valid === true && validation.valid, machineProfileId: machineAdaptedStream?.machineProfile?.id ?? null, coordinateResolutionMm: machineAdaptedStream?.machineProfile?.coordinateResolutionMm ?? null,
    sourceCanonicalCommandCount: summary.sourceCanonicalCommandCount ?? 0, adaptedCommandCount: summary.adaptedCommandCount ?? 0, adaptationSpanCount: summary.adaptationSpanCount ?? 0,
    canonicalCommandAdaptationCoveragePercent: summary.canonicalCommandAdaptationCoveragePercent ?? 0, silentCanonicalCommandDropCount: summary.silentCanonicalCommandDropCount ?? 0,
    commandTypeDistribution: Object.fromEntries(['stitch', 'jump', 'trim', 'colorChange', 'end'].map(type => [type, (canonicalCompilation?.commands || []).filter(command => command.type === type).length])),
    adaptedCommandTypeDistribution: Object.fromEntries(['stitch', 'jump', 'trim', 'colorChange', 'end'].map(type => [type, commands.filter(command => command.type === type).length])),
    splitSourceMovementCount: summary.splitSourceMovementCount ?? 0, generatedSplitSegmentCount: summary.generatedSplitSegmentCount ?? 0, stitchMovementSplitCount: summary.stitchMovementSplitCount ?? 0, jumpMovementSplitCount: summary.jumpMovementSplitCount ?? 0,
    maximumAdaptedStitchDeltaUnits: summary.maximumAdaptedStitchDeltaUnits ?? 0, maximumAdaptedJumpDeltaUnits: summary.maximumAdaptedJumpDeltaUnits ?? 0,
    maximumQuantizationErrorMm: summary.maximumQuantizationErrorMm ?? 0, averageQuantizationErrorMm: summary.averageQuantizationErrorMm ?? 0,
    transformedBoundsMm: bounds(commands.filter(command => ['stitch', 'jump'].includes(command.type)), 'xQuantizedMm', 'yQuantizedMm'), quantizedBoundsUnits: bounds(commands.filter(command => ['stitch', 'jump'].includes(command.type)), 'xUnits', 'yUnits'), outOfBoundsCoordinateCount: summary.outOfBoundsCoordinateCount ?? 0,
    trimCapability: machineAdaptedStream?.machineProfile?.trimCapability ?? null, preservedTrimIntentCount: summary.preservedTrimIntentCount ?? 0, unsupportedTrimIntentCount: summary.unsupportedTrimIntentCount ?? 0,
    commandOrderMutationCount: summary.commandOrderMutationCount ?? 0, threadBlockOrderMutationCount: summary.threadBlockOrderMutationCount ?? 0, objectOrderMutationCount: summary.objectOrderMutationCount ?? 0, threadIdMutationCount: summary.threadIdMutationCount ?? 0, commandTypeMutationCount: summary.commandTypeMutationCount ?? 0, trimIntentMutationCount: summary.trimIntentMutationCount ?? 0, colorChangeMutationCount: summary.colorChangeMutationCount ?? 0,
    canonicalCompilationMutationsDetected: (summary.canonicalCompilationMutationCount ?? 0) > 0, machineAdaptationApplied: true, coordinatesQuantized: true, movementsSplit: (summary.splitSourceMovementCount ?? 0) > 0,
    DSTEncoderInvoked: false, DSBEncoderInvoked: false, binaryOutputGenerated: false, CE01LogicApplied: false, errors: [...(machineAdaptedStream?.errors || []), ...validation.errors], warnings: machineAdaptedStream?.warnings || [],
  };
}
