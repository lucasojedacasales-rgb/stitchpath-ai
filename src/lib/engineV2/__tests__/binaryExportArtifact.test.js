import { describe, expect, it } from 'vitest';
import { createUnifiedBinaryArtifactFromFormatResult, createUnifiedBinaryArtifactV2 } from '../formatAdaptation/binaryExportArtifact.js';

describe('Phase 12D normalized binary artifact', () => {
  const validFormatResult = () => ({
    version: 'direct-v1', format: 'DST', filename: 'sample.dst', mimeType: 'application/octet-stream', valid: true,
    binary: { valid: true, bytes: new Uint8Array([1, 2, 3]), byteLength: 3, checksum: 0 },
    summary: { headerByteLength: 512, actualBinaryRecordCount: 1, finalEOFPresent: true, parserRoundtripPassed: true, deterministicBytesVerified: true },
  });
  it('clones input bytes', () => { const bytes = new Uint8Array([1, 2]); const artifact = createUnifiedBinaryArtifactV2({ bytes }); expect(artifact.bytes).not.toBe(bytes); expect(artifact.bytes).toEqual(bytes); });
  it('isolates artifact bytes from source mutation', () => { const bytes = new Uint8Array([1, 2]); const artifact = createUnifiedBinaryArtifactV2({ bytes }); bytes[0] = 9; expect(artifact.bytes[0]).toBe(1); });
  it('defaults missing bytes to empty Uint8Array', () => expect(createUnifiedBinaryArtifactV2().bytes).toEqual(new Uint8Array()));
  it('derives byte length from cloned bytes', () => expect(createUnifiedBinaryArtifactV2({ bytes: new Uint8Array([1, 2]) }).byteLength).toBe(2));
  it('preserves explicit byte length', () => expect(createUnifiedBinaryArtifactV2({ bytes: new Uint8Array([1]), byteLength: 4 }).byteLength).toBe(4));
  it('freezes artifact object', () => expect(Object.isFrozen(createUnifiedBinaryArtifactV2())).toBe(true));
  it('clones source metadata', () => { const source = { nested: { value: 1 } }; const artifact = createUnifiedBinaryArtifactV2({ source }); source.nested.value = 2; expect(artifact.source.nested.value).toBe(1); });
  it.each(['format', 'filename', 'mimeType', 'checksum', 'headerByteLength', 'binaryRecordCount'])('preserves %s', key => { const values = { format: 'DST', filename: 'a.dst', mimeType: 'binary/x-dst', checksum: 3, headerByteLength: 512, binaryRecordCount: 4 }; expect(createUnifiedBinaryArtifactV2(values)[key]).toBe(values[key]); });
  it.each(['finalEOFPresent', 'parserRoundtripPassed', 'deterministicBytesVerified', 'sourceFormatResultValid'])('normalizes %s to strict boolean', key => { expect(createUnifiedBinaryArtifactV2({ [key]: 1 })[key]).toBe(false); expect(createUnifiedBinaryArtifactV2({ [key]: true })[key]).toBe(true); });
  it('creates artifact from accepted direct result', () => expect(createUnifiedBinaryArtifactFromFormatResult(validFormatResult())).not.toBeNull());
  it('preserves direct identity', () => expect(createUnifiedBinaryArtifactFromFormatResult(validFormatResult())).toMatchObject({ format: 'DST', filename: 'sample.dst', mimeType: 'application/octet-stream' }));
  it('preserves direct metrics', () => expect(createUnifiedBinaryArtifactFromFormatResult(validFormatResult())).toMatchObject({ byteLength: 3, checksum: 0, headerByteLength: 512, binaryRecordCount: 1 }));
  it('preserves direct acceptance flags', () => expect(createUnifiedBinaryArtifactFromFormatResult(validFormatResult())).toMatchObject({ finalEOFPresent: true, parserRoundtripPassed: true, deterministicBytesVerified: true }));
  it('returns null for rejected direct result', () => { const result = validFormatResult(); result.valid = false; expect(createUnifiedBinaryArtifactFromFormatResult(result)).toBeNull(); });
  it('returns null for invalid direct binary', () => { const result = validFormatResult(); result.binary.valid = false; expect(createUnifiedBinaryArtifactFromFormatResult(result)).toBeNull(); });
  it('returns null for missing bytes', () => { const result = validFormatResult(); delete result.binary.bytes; expect(createUnifiedBinaryArtifactFromFormatResult(result)).toBeNull(); });
  it('returns null for empty bytes', () => { const result = validFormatResult(); result.binary.bytes = new Uint8Array(); expect(createUnifiedBinaryArtifactFromFormatResult(result)).toBeNull(); });
});
