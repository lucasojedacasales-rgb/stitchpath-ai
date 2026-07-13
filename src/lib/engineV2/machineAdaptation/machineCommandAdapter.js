import { resolveMachineAdaptationConfig, validateMachineAdaptationConfig } from './machineAdaptationConfig.js';
import { calculateCanonicalDesignBounds, transformDesignPointToMachineMillimeters } from './machineCoordinateTransform.js';
import { dequantizeMachineUnitsToMillimeters, quantizationErrorMm, quantizeMachineMillimetersToUnits } from './machineCoordinateQuantizer.js';
import { splitIntegerMovement } from './integerMovementSplitter.js';
import { resolveMachineProfile } from './machineProfileModel.js';
import { createCanonicalCommandAdaptationSpanV2, createMachineAdaptedCommandStreamV2, createMachineAdaptedCommandV2, machineAdaptedCommandId } from './machineAdaptedCommandModel.js';
import { validateMachineAdaptedCommandStreamV2, validateMachineProfileV2 } from './machineAdaptationValidation.js';
import { adaptTrimCommandForMachineProfile } from './trimCapabilityAdapter.js';

const snapshot = value => { try { return JSON.stringify(value); } catch { return null; } };
const inBounds = (point, bounds) => !bounds || (point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY);
const count = (commands, type) => commands.filter(command => command.type === type).length;
const maximum = values => values.length ? Math.max(...values) : 0;

function buildSummary(canonical, spans, commands, metadata) {
  const source = canonical.commands; const movementSources = source.filter(command => ['stitch', 'jump'].includes(command.type));
  const sourceThreadBlocks = [...new Set(source.map(command => command.threadBlockId).filter(Boolean))]; const adaptedThreadBlocks = [...new Set(commands.map(command => command.sourceThreadBlockId).filter(Boolean))];
  const sourceObjects = [...new Set(source.map(command => command.objectId).filter(Boolean))]; const adaptedObjects = [...new Set(commands.map(command => command.objectId).filter(Boolean))];
  const adaptedDeltas = type => commands.filter(command => command.type === type).map(command => Math.max(Math.abs(command.dxUnits), Math.abs(command.dyUnits)));
  return {
    sourceCanonicalCommandCount: source.length, adaptationSpanCount: spans.length,
    canonicalCommandAdaptationCoveragePercent: source.length ? new Set(spans.map(span => span.canonicalCommandId)).size / source.length * 100 : 100,
    silentCanonicalCommandDropCount: source.filter(command => !spans.some(span => span.canonicalCommandId === command.id)).length,
    duplicateCanonicalCommandSpanCount: spans.length - new Set(spans.map(span => span.canonicalCommandId)).size,
    adaptedCommandCount: commands.length, sourceStitchCommandCount: count(source, 'stitch'), adaptedStitchCommandCount: count(commands, 'stitch'),
    sourceJumpCommandCount: count(source, 'jump'), adaptedJumpCommandCount: count(commands, 'jump'), trimCommandCount: count(commands, 'trim'), colorChangeCommandCount: count(commands, 'colorChange'), endCommandCount: count(commands, 'end'),
    splitSourceMovementCount: spans.filter(span => span.splitApplied).length, generatedSplitSegmentCount: spans.filter(span => span.splitApplied).reduce((sum, span) => sum + span.adaptedCommandCount, 0),
    stitchMovementSplitCount: spans.filter(span => span.splitApplied && source[span.canonicalCommandIndex]?.type === 'stitch').length,
    jumpMovementSplitCount: spans.filter(span => span.splitApplied && source[span.canonicalCommandIndex]?.type === 'jump').length,
    maximumSourceStitchDeltaUnits: maximum(metadata.sourceStitchDeltas), maximumAdaptedStitchDeltaUnits: maximum(adaptedDeltas('stitch')),
    maximumSourceJumpDeltaUnits: maximum(metadata.sourceJumpDeltas), maximumAdaptedJumpDeltaUnits: maximum(adaptedDeltas('jump')),
    quantizedMovementCommandCount: movementSources.length, maximumQuantizationErrorMm: maximum(metadata.quantizationErrors),
    averageQuantizationErrorMm: metadata.quantizationErrors.length ? metadata.quantizationErrors.reduce((sum, value) => sum + value, 0) / metadata.quantizationErrors.length : 0,
    transformedCoordinateCount: movementSources.length, outOfBoundsCoordinateCount: metadata.outOfBoundsCanonicalCommandIds.length,
    unsupportedTrimIntentCount: metadata.unsupportedTrimIntentCount, preservedTrimIntentCount: count(commands, 'trim'),
    sourceThreadBlockCount: sourceThreadBlocks.length, preservedThreadBlockCount: adaptedThreadBlocks.length, sourceObjectCount: sourceObjects.length, preservedObjectCount: adaptedObjects.length,
    sourceEndCommandCount: count(source, 'end'), adaptedEndCommandCount: count(commands, 'end'),
    commandOrderMutationCount: 0, threadBlockOrderMutationCount: 0, objectOrderMutationCount: 0, threadIdMutationCount: 0, commandTypeMutationCount: 0, trimIntentMutationCount: count(source, 'trim') === count(commands, 'trim') ? 0 : 1, colorChangeMutationCount: count(source, 'colorChange') === count(commands, 'colorChange') ? 0 : 1,
    canonicalCompilationMutationCount: metadata.canonicalCompilationMutationCount, encoderInvocationCount: 0, binaryOutputCount: 0,
  };
}

function blockedStream({ canonical, profile, config, errors, warnings, spans, metadata }) {
  const completeSpans = canonical.commands.map((command, index) => spans.find(span => span.canonicalCommandId === command.id) ?? createCanonicalCommandAdaptationSpanV2({ canonicalCommandId: command.id, canonicalCommandIndex: index, status: 'blocked', source: { adapter: 'engineV2-phase11' } }));
  const summary = buildSummary(canonical, completeSpans, [], metadata);
  return createMachineAdaptedCommandStreamV2({ machineProfile: profile, transform: config.transform, sourceCanonicalCommandCount: canonical.commands.length, spans: completeSpans.map(span => span.status === 'blocked' ? span : createCanonicalCommandAdaptationSpanV2({ ...span, status: 'blocked', firstAdaptedCommandIndex: null, lastAdaptedCommandIndex: null, adaptedCommandCount: 0 })), commands: [], valid: false, errors, warnings, summary, config, metadata: { ...metadata, partialAdaptedStreamRejected: true } });
}

export function adaptCanonicalCommandsForMachine({ canonicalCompilation, machineProfile, config: rawConfig = {} }) {
  const before = snapshot(canonicalCompilation); const requestedProfile = machineProfile ?? rawConfig.machineProfile ?? 'generic_dst'; const profile = resolveMachineProfile(requestedProfile);
  const mergedTransform = { ...(profile?.defaultTransform || {}), ...(rawConfig.transform || {}) };
  const config = resolveMachineAdaptationConfig({ ...rawConfig, machineProfile: typeof requestedProfile === 'string' ? requestedProfile : requestedProfile?.id, transform: mergedTransform });
  const errors = [...validateMachineAdaptationConfig(config).errors, ...validateMachineProfileV2(profile).errors]; const warnings = [];
  const canonical = canonicalCompilation?.commands ? canonicalCompilation : { valid: false, commands: [] };
  if (!canonical.valid) errors.push({ code: 'INVALID_CANONICAL_COMPILATION', path: 'canonicalCompilation', message: 'A valid Phase 10 compilation is required.' });
  const metadata = { sourceStitchDeltas: [], sourceJumpDeltas: [], quantizationErrors: [], outOfBoundsCanonicalCommandIds: [], unsupportedTrimIntentCount: 0, canonicalCompilationMutationCount: 0, machineAdaptationApplied: true, commandCoordinatesQuantized: true, movementSplittingSupported: true, trimIntentPreserved: true, DSTEncoderInvoked: false, DSBEncoderInvoked: false, binaryOutputGenerated: false, CE01LogicAdded: false, encodingAdded: false };
  if (errors.length) return blockedStream({ canonical, profile, config, errors, warnings, spans: [], metadata });
  const designBounds = calculateCanonicalDesignBounds(canonical.commands); const spans = []; const provisional = [];
  let current = { ...profile.initialMachinePositionUnits };
  canonical.commands.forEach((command, canonicalIndex) => {
    const first = provisional.length; const localWarnings = []; let localErrors = [];
    if (['stitch', 'jump'].includes(command.type)) {
      if (!Number.isFinite(command.x) || !Number.isFinite(command.y)) localErrors.push({ code: 'MOVEMENT_COORDINATE_REQUIRED', canonicalCommandId: command.id });
      else {
        const transformed = transformDesignPointToMachineMillimeters({ point: command, designBounds, profile, config });
        const target = quantizeMachineMillimetersToUnits(transformed, profile.coordinateResolutionMm); const quantizedMm = dequantizeMachineUnitsToMillimeters(target, profile.coordinateResolutionMm);
        const error = quantizationErrorMm(transformed, quantizedMm); metadata.quantizationErrors.push(error);
        if (config.validateHoopBounds && (!inBounds(transformed, profile.hoopBoundsMm) || !inBounds(quantizedMm, profile.hoopBoundsMm))) { metadata.outOfBoundsCanonicalCommandIds.push(command.id); const issue = { code: 'ADAPTED_COORDINATE_OUTSIDE_HOOP', canonicalCommandId: command.id }; if (config.blockOutOfBounds) localErrors.push(issue); else localWarnings.push(issue); }
        const dx = target.x - current.x; const dy = target.y - current.y; const deltaMetric = Math.max(Math.abs(dx), Math.abs(dy)); (command.type === 'stitch' ? metadata.sourceStitchDeltas : metadata.sourceJumpDeltas).push(deltaMetric);
        const maximumDelta = command.type === 'stitch' && config.splitStitchMovements ? profile.maximumStitchDeltaUnits : command.type === 'jump' && config.splitJumpMovements ? profile.maximumJumpDeltaUnits : null;
        const split = dx === 0 && dy === 0 ? { valid: true, segments: [{ dxUnits: 0, dyUnits: 0, splitIndex: 0, splitCount: 1 }], errors: [] } : splitIntegerMovement({ dxUnits: dx, dyUnits: dy, maximumDeltaUnits: maximumDelta, commandType: command.type });
        localErrors.push(...split.errors); split.segments.forEach((segment, splitIndex) => { current = { x: current.x + segment.dxUnits, y: current.y + segment.dyUnits }; provisional.push({ type: command.type, xUnits: current.x, yUnits: current.y, dxUnits: segment.dxUnits, dyUnits: segment.dyUnits, xQuantizedMm: current.x * profile.coordinateResolutionMm, yQuantizedMm: current.y * profile.coordinateResolutionMm, threadId: command.threadId, objectId: command.objectId, regionId: command.regionId, sourceCanonicalCommandId: command.id, sourceCanonicalCommandIndex: canonicalIndex, sourceExecutionStepId: command.executionStepId, sourceThreadBlockId: command.threadBlockId, sourceSubpathId: command.subpathId, sourcePhysicalPointId: command.physicalPointId, sourceTransitionId: command.transitionId, splitIndex, splitCount: split.segments.length, quantizationErrorMm: splitIndex === split.segments.length - 1 ? error : 0, reasonCode: command.reasonCode, source: { adapter: 'engineV2-phase11', canonicalSource: command.source } }); });
      }
    } else if (command.type === 'trim') {
      const trim = adaptTrimCommandForMachineProfile({ canonicalCommand: command, profile, config }); localErrors.push(...trim.errors); localWarnings.push(...trim.warnings); if (profile.trimCapability === 'unsupported' || profile.trimCapability === 'unknown') metadata.unsupportedTrimIntentCount += 1;
      provisional.push({ type: command.type, xUnits: current.x, yUnits: current.y, dxUnits: 0, dyUnits: 0, xQuantizedMm: current.x * profile.coordinateResolutionMm, yQuantizedMm: current.y * profile.coordinateResolutionMm, threadId: command.threadId, objectId: command.objectId, regionId: command.regionId, sourceCanonicalCommandId: command.id, sourceCanonicalCommandIndex: canonicalIndex, sourceExecutionStepId: command.executionStepId, sourceThreadBlockId: command.threadBlockId, splitIndex: 0, splitCount: 1, quantizationErrorMm: 0, reasonCode: command.reasonCode, source: { adapter: 'engineV2-phase11', trimIntentPreserved: true } });
    } else if (command.type === 'colorChange' || command.type === 'end') {
      if (command.type === 'colorChange' && !profile.supportsColorChange) localErrors.push({ code: 'UNSUPPORTED_COLOR_CHANGE', canonicalCommandId: command.id });
      if (command.type === 'end' && !profile.supportsEnd) localErrors.push({ code: 'UNSUPPORTED_END_COMMAND', canonicalCommandId: command.id });
      provisional.push({ type: command.type, xUnits: current.x, yUnits: current.y, dxUnits: 0, dyUnits: 0, xQuantizedMm: current.x * profile.coordinateResolutionMm, yQuantizedMm: current.y * profile.coordinateResolutionMm, threadId: command.threadId, objectId: command.objectId, regionId: command.regionId, sourceCanonicalCommandId: command.id, sourceCanonicalCommandIndex: canonicalIndex, sourceExecutionStepId: command.executionStepId, sourceThreadBlockId: command.threadBlockId, splitIndex: 0, splitCount: 1, quantizationErrorMm: 0, reasonCode: command.reasonCode, source: { adapter: 'engineV2-phase11' } });
    } else localErrors.push({ code: 'UNSUPPORTED_CANONICAL_COMMAND', canonicalCommandId: command.id });
    warnings.push(...localWarnings); errors.push(...localErrors); const produced = provisional.length - first;
    spans.push(createCanonicalCommandAdaptationSpanV2({ canonicalCommandId: command.id, canonicalCommandIndex: canonicalIndex, status: localErrors.length ? 'blocked' : 'adapted', firstAdaptedCommandIndex: produced ? first : null, lastAdaptedCommandIndex: produced ? provisional.length - 1 : null, adaptedCommandCount: produced, splitApplied: produced > 1, quantizationApplied: ['stitch', 'jump'].includes(command.type), warnings: localWarnings, source: { adapter: 'engineV2-phase11' } }));
  });
  metadata.canonicalCompilationMutationCount = before === snapshot(canonicalCompilation) ? 0 : 1;
  if (errors.length && !config.allowPartialAdaptedStream) return blockedStream({ canonical, profile, config, errors, warnings, spans, metadata });
  const commands = provisional.map((command, adaptedIndex) => createMachineAdaptedCommandV2({ ...command, adaptedIndex, id: machineAdaptedCommandId(adaptedIndex, command.type) }));
  const summary = buildSummary(canonical, spans, commands, metadata); const draft = { machineProfile: profile, transform: config.transform, sourceCanonicalCommandCount: canonical.commands.length, spans, commands, valid: true, errors, warnings, summary, config, metadata };
  const validation = validateMachineAdaptedCommandStreamV2(draft, canonical); if (validation.errors.length) return blockedStream({ canonical, profile, config, errors: [...errors, ...validation.errors], warnings, spans, metadata });
  return createMachineAdaptedCommandStreamV2(draft);
}
