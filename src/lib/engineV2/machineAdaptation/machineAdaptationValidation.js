import { MACHINE_ORIGIN_MODES, TRIM_CAPABILITIES, UNSUPPORTED_TRIM_POLICIES } from './machineProfileModel.js';
import { canonicalCommandAdaptationSpanId, machineAdaptedCommandId, MACHINE_ADAPTATION_SPAN_STATUSES } from './machineAdaptedCommandModel.js';

const issue = (code, path, message) => ({ code, path, message });
const duplicates = values => values.filter((value, index) => values.indexOf(value) !== index).filter((value, index, all) => all.indexOf(value) === index);

export function validateMachineProfileV2(profile) {
  const errors = []; const positiveIntegerOrNull = value => value == null || (Number.isInteger(value) && value > 0);
  if (!profile?.id) errors.push(issue('MACHINE_PROFILE_ID_REQUIRED', 'id', 'Machine profile id is required.'));
  if (!Number.isFinite(profile?.coordinateResolutionMm) || profile.coordinateResolutionMm <= 0) errors.push(issue('INVALID_MACHINE_PROFILE_RESOLUTION', 'coordinateResolutionMm', 'Resolution must be positive and finite.'));
  if (!positiveIntegerOrNull(profile?.maximumStitchDeltaUnits) || !positiveIntegerOrNull(profile?.maximumJumpDeltaUnits)) errors.push(issue('INVALID_MACHINE_MOVEMENT_MAXIMUM', 'maximumDeltaUnits', 'Movement maxima must be positive integers or null.'));
  const bounds = profile?.hoopBoundsMm; if (bounds && (!['minX', 'maxX', 'minY', 'maxY'].every(key => Number.isFinite(bounds[key])) || bounds.minX > bounds.maxX || bounds.minY > bounds.maxY)) errors.push(issue('INVALID_MACHINE_HOOP_BOUNDS', 'hoopBoundsMm', 'Hoop bounds must be finite and ordered.'));
  if (!Number.isInteger(profile?.initialMachinePositionUnits?.x) || !Number.isInteger(profile?.initialMachinePositionUnits?.y)) errors.push(issue('INVALID_INITIAL_MACHINE_POSITION', 'initialMachinePositionUnits', 'Initial machine position must use integer units.'));
  if (!TRIM_CAPABILITIES.includes(profile?.trimCapability) || !UNSUPPORTED_TRIM_POLICIES.includes(profile?.unsupportedTrimPolicy)) errors.push(issue('INVALID_MACHINE_TRIM_CAPABILITY', 'trimCapability', 'Trim capability or policy is invalid.'));
  const transform = profile?.defaultTransform || {}; if (!Number.isFinite(transform.scale) || transform.scale <= 0 || !Number.isFinite(transform.rotationDegrees) || !Number.isFinite(transform.translateXmm) || !Number.isFinite(transform.translateYmm) || !MACHINE_ORIGIN_MODES.includes(transform.originMode)) errors.push(issue('INVALID_MACHINE_PROFILE_TRANSFORM', 'defaultTransform', 'Default transform is invalid.'));
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function validateMachineAdaptedCommandV2(command) {
  const errors = []; const movement = ['stitch', 'jump'].includes(command?.type);
  if (command?.id !== machineAdaptedCommandId(command?.adaptedIndex, command?.type)) errors.push(issue('NONDETERMINISTIC_ADAPTED_COMMAND_ID', 'id', 'Adapted command id is nondeterministic.'));
  if (!['stitch', 'jump', 'trim', 'colorChange', 'end'].includes(command?.type)) errors.push(issue('INVALID_ADAPTED_COMMAND_TYPE', 'type', 'Command type is unsupported.'));
  if (!Number.isInteger(command?.xUnits) || !Number.isInteger(command?.yUnits) || !Number.isInteger(command?.dxUnits) || !Number.isInteger(command?.dyUnits)) errors.push(issue('NON_INTEGER_ADAPTED_COORDINATE', 'coordinates', 'Adapted coordinates and deltas must be integers.'));
  if (!Number.isFinite(command?.xQuantizedMm) || !Number.isFinite(command?.yQuantizedMm) || !Number.isFinite(command?.quantizationErrorMm)) errors.push(issue('NON_FINITE_QUANTIZED_COORDINATE', 'quantized', 'Quantized coordinates and error must be finite.'));
  if (!movement && (command?.dxUnits !== 0 || command?.dyUnits !== 0)) errors.push(issue('NON_MOVEMENT_COMMAND_HAS_DELTA', 'delta', 'Non-movement commands require zero delta.'));
  if (!Number.isInteger(command?.splitIndex) || !Number.isInteger(command?.splitCount) || command.splitIndex < 0 || command.splitCount < 1 || command.splitIndex >= command.splitCount) errors.push(issue('INVALID_ADAPTED_SPLIT_INDEX', 'splitIndex', 'Split indexes are invalid.'));
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function validateCanonicalCommandAdaptationSpanV2(span, commandCount = Infinity) {
  const errors = [];
  if (span?.id !== canonicalCommandAdaptationSpanId(span?.canonicalCommandId)) errors.push(issue('NONDETERMINISTIC_MACHINE_SPAN_ID', 'id', 'Span id is nondeterministic.'));
  if (!MACHINE_ADAPTATION_SPAN_STATUSES.includes(span?.status)) errors.push(issue('INVALID_MACHINE_SPAN_STATUS', 'status', 'Span status is invalid.'));
  if (span?.status === 'adapted' && (!Number.isInteger(span.firstAdaptedCommandIndex) || !Number.isInteger(span.lastAdaptedCommandIndex) || span.firstAdaptedCommandIndex < 0 || span.lastAdaptedCommandIndex < span.firstAdaptedCommandIndex || span.lastAdaptedCommandIndex >= commandCount || span.adaptedCommandCount !== span.lastAdaptedCommandIndex - span.firstAdaptedCommandIndex + 1)) errors.push(issue('INVALID_MACHINE_SPAN_RANGE', 'indices', 'Adapted span range is invalid.'));
  return { valid: errors.length === 0, errors, warnings: [] };
}

function forbidden(value, path, errors) {
  if (!value || typeof value !== 'object') return;
  const names = new Set(['dstBytes', 'dsbBytes', 'binaryPayload', 'encodedBytes', 'CE01Artwork', 'ce01Artwork']);
  Object.entries(value).forEach(([key, nested]) => { if (names.has(key) && nested != null && nested !== false) errors.push(issue('FORBIDDEN_MACHINE_ADAPTATION_OUTPUT', `${path}.${key}`, `${key} is forbidden.`)); else forbidden(nested, `${path}.${key}`, errors); });
}

export function validateMachineAdaptedCommandStreamV2(stream, canonicalCompilation) {
  const errors = []; const commands = stream?.commands || []; const spans = stream?.spans || []; const canonical = canonicalCompilation?.commands || []; const canonicalMap = new Map(canonical.map(command => [command.id, command]));
  errors.push(...validateMachineProfileV2(stream?.machineProfile).errors);
  spans.forEach((span, index) => errors.push(...validateCanonicalCommandAdaptationSpanV2(span, commands.length).errors.map(entry => ({ ...entry, path: `spans[${index}].${entry.path}` }))));
  commands.forEach((command, index) => { errors.push(...validateMachineAdaptedCommandV2(command).errors.map(entry => ({ ...entry, path: `commands[${index}].${entry.path}` }))); if (!canonicalMap.has(command.sourceCanonicalCommandId)) errors.push(issue('UNKNOWN_CANONICAL_COMMAND_SOURCE', `commands[${index}]`, 'Adapted command references unknown canonical source.')); });
  duplicates(spans.map(span => span.canonicalCommandId)).forEach(id => errors.push(issue('DUPLICATE_CANONICAL_COMMAND_SPAN', 'spans', `Duplicate span for ${id}.`)));
  duplicates(commands.map(command => command.id)).forEach(id => errors.push(issue('DUPLICATE_ADAPTED_COMMAND_ID', 'commands', `Duplicate adapted command ${id}.`)));
  canonical.forEach(command => { if (!spans.some(span => span.canonicalCommandId === command.id)) errors.push(issue('CANONICAL_COMMAND_WITHOUT_ADAPTATION', 'spans', `Canonical command ${command.id} lacks a span.`)); });
  const adaptedSpans = spans.filter(span => span.status === 'adapted'); adaptedSpans.slice(1).forEach((span, index) => { if (span.firstAdaptedCommandIndex !== adaptedSpans[index].lastAdaptedCommandIndex + 1) errors.push(issue('NONCONTIGUOUS_MACHINE_SPAN_ORDER', 'spans', 'Adapted spans must be contiguous.')); });
  commands.forEach((command, index) => { const source = canonicalMap.get(command.sourceCanonicalCommandId); if (source && source.type !== command.type) errors.push(issue('ADAPTED_COMMAND_TYPE_CHANGED', `commands[${index}].type`, 'Canonical command type changed.')); if (index && (commands[index - 1].xUnits + command.dxUnits !== command.xUnits || commands[index - 1].yUnits + command.dyUnits !== command.yUnits)) errors.push(issue('ADAPTED_DELTA_INCONSISTENT', `commands[${index}]`, 'Delta does not match absolute positions.')); });
  const sourceIds = spans.map(span => span.canonicalCommandId); if (JSON.stringify(sourceIds) !== JSON.stringify(canonical.map(command => command.id))) errors.push(issue('CANONICAL_COMMAND_ORDER_CHANGED', 'spans', 'Canonical command order changed.'));
  const ends = commands.filter(command => command.type === 'end'); if (ends.length !== 1 || commands.at(-1)?.type !== 'end') errors.push(issue('INVALID_ADAPTED_END_COMMAND', 'commands', 'Exactly one final end command is required.'));
  if ((stream?.summary?.canonicalCommandAdaptationCoveragePercent ?? 0) !== 100 || (stream?.summary?.silentCanonicalCommandDropCount ?? 0) !== 0) errors.push(issue('MACHINE_ADAPTATION_COVERAGE_BELOW_100', 'summary', 'Canonical adaptation coverage must be complete.'));
  if (stream?.metadata?.canonicalCompilationMutationCount) errors.push(issue('CANONICAL_SOURCE_MUTATION', 'metadata', 'Canonical compilation was mutated.'));
  forbidden(stream, 'stream', errors);
  return { valid: errors.length === 0, errors, warnings: stream?.warnings || [] };
}
