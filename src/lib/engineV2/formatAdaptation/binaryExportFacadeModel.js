const clone = value => value == null ? value : structuredClone(value);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value) || ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value instanceof Blob) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value) && !(value instanceof Blob)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  return value;
}

function fnv1a(text) {
  let hash = 0x811C9DC5;
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash.toString(16).padStart(8, '0');
}

export const BINARY_EXPORT_FORMATS = Object.freeze(['DST', 'DSB']);
export const BINARY_EXPORT_STATUS_CATEGORIES = Object.freeze(['accepted', 'policy_blocked', 'unsupported', 'invalid_request', 'adapter_error']);
export const BINARY_EXPORT_STATUS_CODES = Object.freeze({
  accepted: 'BINARY_EXPORT_ACCEPTED', policy_blocked: 'BINARY_EXPORT_POLICY_BLOCKED', unsupported: 'BINARY_EXPORT_UNSUPPORTED_FORMAT',
  invalid_request: 'BINARY_EXPORT_INVALID_REQUEST', adapter_error: 'BINARY_EXPORT_ADAPTER_ERROR',
});
export const BINARY_FORMAT_LIMITATION_SEVERITIES = Object.freeze(['info', 'warning', 'blocking']);

export function normalizeBinaryExportFormat(format) {
  return typeof format === 'string' && format.trim() ? format.trim().toUpperCase() : null;
}

export function fingerprintMachineAdaptedStreamV2(machineAdaptedStream) {
  return fnv1a(JSON.stringify(stableValue(machineAdaptedStream ?? null)));
}

export function createBinaryExportRequestV2(input = {}) {
  const format = normalizeBinaryExportFormat(input.format); const fingerprint = input.sourceStreamFingerprint || fingerprintMachineAdaptedStreamV2(input.machineAdaptedStream);
  return deepFreeze({
    id: input.id ?? `binary-export-request:${format || 'missing'}:${fingerprint}`, format, label: input.label ?? null,
    metadata: clone(input.metadata ?? {}), formatConfig: clone(input.formatConfig ?? {}), sourceStreamFingerprint: fingerprint,
    sourceCommandCount: input.sourceCommandCount ?? input.machineAdaptedStream?.commands?.length ?? 0,
    sourceMachineProfileId: input.sourceMachineProfileId ?? input.machineAdaptedStream?.machineProfile?.id ?? null,
    sourceCoordinateResolutionMm: input.sourceCoordinateResolutionMm ?? input.machineAdaptedStream?.machineProfile?.coordinateResolutionMm ?? null,
  });
}

export function createBinaryExportStatusV2(input = {}) {
  const category = input.category ?? 'invalid_request';
  return deepFreeze({
    code: input.code ?? BINARY_EXPORT_STATUS_CODES[category] ?? BINARY_EXPORT_STATUS_CODES.invalid_request, category,
    accepted: input.accepted === true, transactionBlocked: input.transactionBlocked !== false, binaryGenerated: input.binaryGenerated === true,
    adapterInvoked: input.adapterInvoked === true, reasonCode: input.reasonCode ?? null, reason: input.reason ?? null,
  });
}

export function createBinaryFormatLimitationV2(input = {}) {
  return deepFreeze({
    code: input.code ?? null, severity: input.severity ?? 'warning', format: input.format ?? null, message: input.message ?? null,
    acknowledged: input.acknowledged === true, acknowledgement: input.acknowledgement ?? null, source: clone(input.source ?? null),
  });
}

export function createUnifiedBinaryExportResultV2(input = {}) {
  return deepFreeze({
    version: input.version ?? '2-unified-binary-export-facade', request: input.request ? createBinaryExportRequestV2(input.request) : null,
    status: input.status ? createBinaryExportStatusV2(input.status) : null, artifact: input.artifact ?? null,
    readiness: input.readiness ?? null, limitations: clone(input.limitations ?? []), selectedFormat: input.selectedFormat ?? null,
    selectedAdapter: input.selectedAdapter ?? null, formatResult: clone(input.formatResult ?? null), valid: input.valid === true,
    errors: clone(input.errors ?? []), warnings: clone(input.warnings ?? []), summary: clone(input.summary ?? {}),
    config: clone(input.config ?? {}), metadata: clone(input.metadata ?? {}), diagnostic: clone(input.diagnostic ?? null),
  });
}
