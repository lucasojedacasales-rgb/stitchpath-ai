import { deepFreezeMachineValue } from './machineProfileModel.js';

const clone = value => value == null ? value : structuredClone(value);
export const MACHINE_ADAPTATION_SPAN_STATUSES = Object.freeze(['adapted', 'blocked']);
export const machineAdaptedCommandId = (index, type) => `machine-command:${String(index).padStart(8, '0')}:${type}`;
export const canonicalCommandAdaptationSpanId = canonicalCommandId => `machine-span:${canonicalCommandId}`;

export function createMachineAdaptedCommandV2(input = {}) {
  return deepFreezeMachineValue({
    id: input.id ?? machineAdaptedCommandId(input.adaptedIndex, input.type), adaptedIndex: input.adaptedIndex ?? null, type: input.type ?? null,
    xUnits: input.xUnits ?? null, yUnits: input.yUnits ?? null, dxUnits: input.dxUnits ?? 0, dyUnits: input.dyUnits ?? 0,
    xQuantizedMm: input.xQuantizedMm ?? null, yQuantizedMm: input.yQuantizedMm ?? null,
    threadId: input.threadId ?? null, objectId: input.objectId ?? null, regionId: input.regionId ?? null,
    sourceCanonicalCommandId: input.sourceCanonicalCommandId ?? null, sourceCanonicalCommandIndex: input.sourceCanonicalCommandIndex ?? null,
    sourceExecutionStepId: input.sourceExecutionStepId ?? null, sourceThreadBlockId: input.sourceThreadBlockId ?? null,
    sourceSubpathId: input.sourceSubpathId ?? null, sourcePhysicalPointId: input.sourcePhysicalPointId ?? null, sourceTransitionId: input.sourceTransitionId ?? null,
    splitIndex: input.splitIndex ?? 0, splitCount: input.splitCount ?? 1, quantizationErrorMm: input.quantizationErrorMm ?? 0,
    reasonCode: input.reasonCode ?? null, source: clone(input.source ?? null),
  });
}

export function createCanonicalCommandAdaptationSpanV2(input = {}) {
  return deepFreezeMachineValue({
    id: input.id ?? canonicalCommandAdaptationSpanId(input.canonicalCommandId), canonicalCommandId: input.canonicalCommandId ?? null,
    canonicalCommandIndex: input.canonicalCommandIndex ?? null, status: input.status ?? 'blocked',
    firstAdaptedCommandIndex: input.firstAdaptedCommandIndex ?? null, lastAdaptedCommandIndex: input.lastAdaptedCommandIndex ?? null,
    adaptedCommandCount: input.adaptedCommandCount ?? 0, splitApplied: input.splitApplied === true, quantizationApplied: input.quantizationApplied === true,
    warnings: clone(input.warnings ?? []), source: clone(input.source ?? null),
  });
}

export function createMachineAdaptedCommandStreamV2(input = {}) {
  const profile = clone(input.machineProfile ?? null); const transform = clone(input.transform ?? null);
  const spans = (input.spans || []).map(createCanonicalCommandAdaptationSpanV2); const commands = (input.commands || []).map(createMachineAdaptedCommandV2);
  return deepFreezeMachineValue({
    version: input.version ?? '2-machine-adapted-command-stream', machineProfile: profile, transform,
    sourceCanonicalCommandCount: input.sourceCanonicalCommandCount ?? 0, spans, commands,
    byCanonicalCommandId: clone(input.byCanonicalCommandId ?? Object.fromEntries(spans.map(span => [span.canonicalCommandId, span]))),
    byAdaptedCommandId: clone(input.byAdaptedCommandId ?? Object.fromEntries(commands.map(command => [command.id, command]))),
    valid: input.valid === true, errors: clone(input.errors ?? []), warnings: clone(input.warnings ?? []), summary: clone(input.summary ?? {}), config: clone(input.config ?? {}), metadata: clone(input.metadata ?? {}),
  });
}
