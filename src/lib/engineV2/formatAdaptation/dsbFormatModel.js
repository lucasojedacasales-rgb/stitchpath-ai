const clone = value => value == null ? value : structuredClone(value);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value) || ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value instanceof Blob) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export const DSB_SOURCE_DISPOSITION_STATUSES = Object.freeze(['adapted', 'zero_output', 'blocked']);
export const dsbDispositionId = sourceMachineCommandId => `dsb-disposition:${sourceMachineCommandId}`;
export const dsbRecordPlanId = (index, type) => `dsb-record-plan:${String(index).padStart(8, '0')}:${type}`;
export const dsbBinaryRecordSpanId = sourceMachineCommandId => `dsb-record-span:${sourceMachineCommandId}`;

export function createDSBSourceCommandDispositionV2(input = {}) {
  return deepFreeze({
    id: input.id ?? dsbDispositionId(input.sourceMachineCommandId), sourceMachineCommandId: input.sourceMachineCommandId ?? null,
    sourceAdaptedIndex: input.sourceAdaptedIndex ?? null, sourceType: input.sourceType ?? null, status: input.status ?? 'blocked',
    reasonCode: input.reasonCode ?? null, reason: input.reason ?? null, firstDSBRecordPlanIndex: input.firstDSBRecordPlanIndex ?? null,
    lastDSBRecordPlanIndex: input.lastDSBRecordPlanIndex ?? null, recordPlanCount: input.recordPlanCount ?? 0,
    expectedBinaryRecordCount: input.expectedBinaryRecordCount ?? 0, warnings: clone(input.warnings ?? []), source: clone(input.source ?? null),
  });
}

export function createDSBRecordPlanV2(input = {}) {
  return deepFreeze({
    id: input.id ?? dsbRecordPlanId(input.recordPlanIndex, input.type), recordPlanIndex: input.recordPlanIndex ?? null,
    type: input.type ?? null, dxUnits: input.dxUnits ?? null, dyUnits: input.dyUnits ?? null,
    sourceMachineCommandId: input.sourceMachineCommandId ?? null, sourceAdaptedIndex: input.sourceAdaptedIndex ?? null,
    sourceCanonicalCommandId: input.sourceCanonicalCommandId ?? null, splitIndex: input.splitIndex ?? 0, splitCount: input.splitCount ?? 1,
    expectedCommandByte: input.expectedCommandByte ?? null, reasonCode: input.reasonCode ?? null, source: clone(input.source ?? null),
  });
}

export function createDSBBinaryRecordSpanV2(input = {}) {
  return deepFreeze({
    id: input.id ?? dsbBinaryRecordSpanId(input.sourceMachineCommandId), sourceMachineCommandId: input.sourceMachineCommandId ?? null,
    sourceRecordPlanIds: clone(input.sourceRecordPlanIds ?? []), expectedFirstBinaryRecordIndex: input.expectedFirstBinaryRecordIndex ?? null,
    expectedLastBinaryRecordIndex: input.expectedLastBinaryRecordIndex ?? null, expectedBinaryRecordCount: input.expectedBinaryRecordCount ?? 0,
    actualFirstBinaryRecordIndex: input.actualFirstBinaryRecordIndex ?? null, actualLastBinaryRecordIndex: input.actualLastBinaryRecordIndex ?? null,
    actualBinaryRecordCount: input.actualBinaryRecordCount ?? 0, verified: input.verified === true, source: clone(input.source ?? null),
  });
}

export function createDSBFormatAdaptationV2(input = {}) {
  const dispositions = (input.dispositions || []).map(createDSBSourceCommandDispositionV2);
  const recordPlan = (input.recordPlan || []).map(createDSBRecordPlanV2);
  const binaryRecordSpans = (input.binaryRecordSpans || []).map(createDSBBinaryRecordSpanV2);
  return deepFreeze({
    version: input.version ?? '2-dsb-format-adaptation', dispositions, recordPlan, binaryRecordSpans,
    headerMetadata: clone(input.headerMetadata ?? {}),
    bySourceMachineCommandId: clone(input.bySourceMachineCommandId ?? Object.fromEntries(dispositions.map(item => [item.sourceMachineCommandId, item]))),
    byRecordPlanId: clone(input.byRecordPlanId ?? Object.fromEntries(recordPlan.map(item => [item.id, item]))),
    valid: input.valid === true, errors: clone(input.errors ?? []), warnings: clone(input.warnings ?? []),
    summary: clone(input.summary ?? {}), config: clone(input.config ?? {}), metadata: clone(input.metadata ?? {}),
  });
}

export function createDSBBinaryAcceptanceResultV2(input = {}) {
  const bytes = input.bytes instanceof Uint8Array ? new Uint8Array(input.bytes) : new Uint8Array();
  return deepFreeze({
    version: input.version ?? '2-dsb-binary-acceptance', format: input.format ?? 'DSB', filename: input.filename ?? 'design.dsb',
    mimeType: input.mimeType ?? 'application/octet-stream', bytes, byteLength: input.byteLength ?? bytes.length, checksum: input.checksum ?? 0,
    parsed: clone(input.parsed ?? null), header: clone(input.header ?? null), records: clone(input.records ?? []),
    adaptation: input.adaptation ? createDSBFormatAdaptationV2(input.adaptation) : null, valid: input.valid === true,
    errors: clone(input.errors ?? []), warnings: clone(input.warnings ?? []), summary: clone(input.summary ?? {}), metadata: clone(input.metadata ?? {}),
  });
}
