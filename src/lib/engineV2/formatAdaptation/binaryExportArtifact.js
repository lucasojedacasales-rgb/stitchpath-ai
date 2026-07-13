function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value) || ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value instanceof Blob) return value;
  Object.values(value).forEach(deepFreeze); return Object.freeze(value);
}

export function createUnifiedBinaryArtifactV2(input = {}) {
  const bytes = input.bytes instanceof Uint8Array ? new Uint8Array(input.bytes) : new Uint8Array();
  return deepFreeze({
    format: input.format ?? null, filename: input.filename ?? null, mimeType: input.mimeType ?? null, bytes,
    byteLength: input.byteLength ?? bytes.length, checksum: input.checksum ?? null, headerByteLength: input.headerByteLength ?? 0,
    binaryRecordCount: input.binaryRecordCount ?? 0, finalEOFPresent: input.finalEOFPresent === true,
    parserRoundtripPassed: input.parserRoundtripPassed === true, deterministicBytesVerified: input.deterministicBytesVerified === true,
    sourceFormatResultVersion: input.sourceFormatResultVersion ?? null, sourceFormatResultValid: input.sourceFormatResultValid === true,
    source: input.source == null ? null : structuredClone(input.source),
  });
}

export function createUnifiedBinaryArtifactFromFormatResult(formatResult) {
  const binary = formatResult?.binary; const summary = formatResult?.summary || {};
  if (formatResult?.valid !== true || binary?.valid !== true || !(binary?.bytes instanceof Uint8Array) || binary.bytes.length === 0) return null;
  return createUnifiedBinaryArtifactV2({
    format: formatResult.format, filename: formatResult.filename, mimeType: formatResult.mimeType, bytes: binary.bytes,
    byteLength: binary.byteLength, checksum: binary.checksum, headerByteLength: summary.headerByteLength,
    binaryRecordCount: summary.actualBinaryRecordCount, finalEOFPresent: summary.finalEOFPresent,
    parserRoundtripPassed: summary.parserRoundtripPassed, deterministicBytesVerified: summary.deterministicBytesVerified,
    sourceFormatResultVersion: formatResult.version, sourceFormatResultValid: formatResult.valid,
    source: { adapterResultFormat: formatResult.format, adapterResultVersion: formatResult.version },
  });
}
