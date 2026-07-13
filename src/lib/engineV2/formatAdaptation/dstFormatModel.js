const clone = value => value == null ? value : structuredClone(value);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value) || ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value instanceof Blob) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export const DST_SOURCE_DISPOSITION_STATUSES = Object.freeze(['adapted', 'zero_output', 'blocked']);
export const dstDispositionId = sourceMachineCommandId => `dst-disposition:${sourceMachineCommandId}`;
export const dstEncoderCommandId = (index, type) => `dst-command:${String(index).padStart(8, '0')}:${type}`;
export const dstBinaryRecordSpanId = sourceMachineCommandId => `dst-record-span:${sourceMachineCommandId}`;

export function createDSTSourceCommandDispositionV2(input = {}) {
  return deepFreeze({
    id: input.id ?? dstDispositionId(input.sourceMachineCommandId),
    sourceMachineCommandId: input.sourceMachineCommandId ?? null,
    sourceAdaptedIndex: input.sourceAdaptedIndex ?? null,
    sourceType: input.sourceType ?? null,
    status: input.status ?? 'blocked',
    reasonCode: input.reasonCode ?? null,
    reason: input.reason ?? null,
    firstDSTCommandIndex: input.firstDSTCommandIndex ?? null,
    lastDSTCommandIndex: input.lastDSTCommandIndex ?? null,
    dstCommandCount: input.dstCommandCount ?? 0,
    expectedBinaryRecordCount: input.expectedBinaryRecordCount ?? 0,
    warnings: clone(input.warnings ?? []),
    source: clone(input.source ?? null),
  });
}

export function createDSTEncoderCommandV2(input = {}) {
  return deepFreeze({
    id: input.id ?? dstEncoderCommandId(input.dstCommandIndex, input.type),
    dstCommandIndex: input.dstCommandIndex ?? null,
    type: input.type ?? null,
    x: input.x ?? null,
    y: input.y ?? null,
    color: input.color ?? null,
    sourceMachineCommandId: input.sourceMachineCommandId ?? null,
    sourceAdaptedIndex: input.sourceAdaptedIndex ?? null,
    sourceCanonicalCommandId: input.sourceCanonicalCommandId ?? null,
    splitIndex: input.splitIndex ?? 0,
    splitCount: input.splitCount ?? 1,
    expectedBinaryRecordCount: input.expectedBinaryRecordCount ?? 1,
    reasonCode: input.reasonCode ?? null,
    source: clone(input.source ?? null),
  });
}

export function createDSTBinaryRecordSpanV2(input = {}) {
  return deepFreeze({
    id: input.id ?? dstBinaryRecordSpanId(input.sourceMachineCommandId),
    sourceMachineCommandId: input.sourceMachineCommandId ?? null,
    sourceDSTCommandIds: clone(input.sourceDSTCommandIds ?? []),
    expectedFirstRecordIndex: input.expectedFirstRecordIndex ?? null,
    expectedLastRecordIndex: input.expectedLastRecordIndex ?? null,
    expectedRecordCount: input.expectedRecordCount ?? 0,
    actualFirstRecordIndex: input.actualFirstRecordIndex ?? null,
    actualLastRecordIndex: input.actualLastRecordIndex ?? null,
    actualRecordCount: input.actualRecordCount ?? 0,
    verified: input.verified === true,
    source: clone(input.source ?? null),
  });
}

export function createDSTFormatAdaptationV2(input = {}) {
  const dispositions = (input.dispositions || []).map(createDSTSourceCommandDispositionV2);
  const encoderCommands = (input.encoderCommands || []).map(createDSTEncoderCommandV2);
  const binaryRecordSpans = (input.binaryRecordSpans || []).map(createDSTBinaryRecordSpanV2);
  return deepFreeze({
    version: input.version ?? '2-dst-format-adaptation',
    dispositions,
    encoderCommands,
    binaryRecordSpans,
    headerMetadata: clone(input.headerMetadata ?? {}),
    bySourceMachineCommandId: clone(input.bySourceMachineCommandId ?? Object.fromEntries(dispositions.map(item => [item.sourceMachineCommandId, item]))),
    byDSTCommandId: clone(input.byDSTCommandId ?? Object.fromEntries(encoderCommands.map(item => [item.id, item]))),
    valid: input.valid === true,
    errors: clone(input.errors ?? []),
    warnings: clone(input.warnings ?? []),
    summary: clone(input.summary ?? {}),
    config: clone(input.config ?? {}),
    metadata: clone(input.metadata ?? {}),
  });
}

export function createDSTBinaryAcceptanceResultV2(input = {}) {
  const bytes = input.bytes instanceof Uint8Array ? new Uint8Array(input.bytes) : new Uint8Array();
  return deepFreeze({
    version: input.version ?? '2-dst-binary-acceptance',
    format: input.format ?? 'DST',
    filename: input.filename ?? 'design.dst',
    mimeType: input.mimeType ?? 'application/octet-stream',
    bytes,
    byteLength: input.byteLength ?? bytes.length,
    checksum: input.checksum ?? 0,
    parsed: clone(input.parsed ?? null),
    header: clone(input.header ?? null),
    records: clone(input.records ?? []),
    adaptation: input.adaptation ? createDSTFormatAdaptationV2(input.adaptation) : null,
    valid: input.valid === true,
    errors: clone(input.errors ?? []),
    warnings: clone(input.warnings ?? []),
    summary: clone(input.summary ?? {}),
    metadata: clone(input.metadata ?? {}),
  });
}

