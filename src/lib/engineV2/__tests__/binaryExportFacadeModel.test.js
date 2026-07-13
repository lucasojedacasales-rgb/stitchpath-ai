import { describe, expect, it } from 'vitest';
import {
  BINARY_EXPORT_FORMATS, BINARY_EXPORT_STATUS_CATEGORIES, BINARY_EXPORT_STATUS_CODES, BINARY_FORMAT_LIMITATION_SEVERITIES,
  createBinaryExportRequestV2, createBinaryExportStatusV2, createBinaryFormatLimitationV2, createUnifiedBinaryExportResultV2,
  fingerprintMachineAdaptedStreamV2, normalizeBinaryExportFormat,
} from '../formatAdaptation/binaryExportFacadeModel.js';

describe('Phase 12D binary export facade models', () => {
  it.each([['dst', 'DST'], [' DST ', 'DST'], ['DST', 'DST'], ['dsb', 'DSB'], [' DSB ', 'DSB']])('normalizes %j', (input, expected) => expect(normalizeBinaryExportFormat(input)).toBe(expected));
  it.each([undefined, null, '', '   ', 12, {}])('normalizes missing value %j to null', input => expect(normalizeBinaryExportFormat(input)).toBeNull());
  it('declares only supported formats', () => expect(BINARY_EXPORT_FORMATS).toEqual(['DST', 'DSB']));
  it('freezes supported formats', () => expect(Object.isFrozen(BINARY_EXPORT_FORMATS)).toBe(true));
  it('declares all status categories', () => expect(BINARY_EXPORT_STATUS_CATEGORIES).toHaveLength(5));
  it('declares all limitation severities', () => expect(BINARY_FORMAT_LIMITATION_SEVERITIES).toEqual(['info', 'warning', 'blocking']));
  it('produces stable fingerprints for key ordering', () => expect(fingerprintMachineAdaptedStreamV2({ b: 2, a: 1 })).toBe(fingerprintMachineAdaptedStreamV2({ a: 1, b: 2 })));
  it('produces stable fingerprints for repeated input', () => expect(fingerprintMachineAdaptedStreamV2({ commands: [{ id: 'c1' }] })).toBe(fingerprintMachineAdaptedStreamV2({ commands: [{ id: 'c1' }] })));
  it('changes fingerprint when source changes', () => expect(fingerprintMachineAdaptedStreamV2({ commands: [] })).not.toBe(fingerprintMachineAdaptedStreamV2({ commands: [{}] })));
  it('produces an eight-character hex fingerprint', () => expect(fingerprintMachineAdaptedStreamV2(null)).toMatch(/^[0-9a-f]{8}$/));
  it('preserves array order in fingerprints', () => expect(fingerprintMachineAdaptedStreamV2([1, 2])).not.toBe(fingerprintMachineAdaptedStreamV2([2, 1])));

  const source = { commands: [{ id: 'one' }, { id: 'two' }], machineProfile: { id: 'generic', coordinateResolutionMm: 0.1 } };
  it('creates deterministic request IDs', () => { const left = createBinaryExportRequestV2({ format: 'dst', machineAdaptedStream: source }); const right = createBinaryExportRequestV2({ format: 'DST', machineAdaptedStream: source }); expect(left.id).toBe(right.id); });
  it('includes normalized format in request ID', () => expect(createBinaryExportRequestV2({ format: 'dst', machineAdaptedStream: source }).id).toMatch(/^binary-export-request:DST:/));
  it('uses missing marker in request ID', () => expect(createBinaryExportRequestV2({ machineAdaptedStream: source }).id).toMatch(/^binary-export-request:missing:/));
  it('derives source command count', () => expect(createBinaryExportRequestV2({ format: 'DST', machineAdaptedStream: source }).sourceCommandCount).toBe(2));
  it('derives machine profile ID', () => expect(createBinaryExportRequestV2({ format: 'DST', machineAdaptedStream: source }).sourceMachineProfileId).toBe('generic'));
  it('derives coordinate resolution', () => expect(createBinaryExportRequestV2({ format: 'DST', machineAdaptedStream: source }).sourceCoordinateResolutionMm).toBe(0.1));
  it('clones request metadata', () => { const metadata = { nested: { value: 1 } }; const request = createBinaryExportRequestV2({ format: 'DST', metadata }); metadata.nested.value = 2; expect(request.metadata.nested.value).toBe(1); });
  it('clones format config', () => { const formatConfig = { nested: { value: 1 } }; const request = createBinaryExportRequestV2({ format: 'DST', formatConfig }); formatConfig.nested.value = 2; expect(request.formatConfig.nested.value).toBe(1); });
  it('freezes request deeply', () => { const request = createBinaryExportRequestV2({ format: 'DST', metadata: { nested: {} } }); expect(Object.isFrozen(request)).toBe(true); expect(Object.isFrozen(request.metadata.nested)).toBe(true); });
  it('does not add timestamps or random fields', () => { const request = createBinaryExportRequestV2({ format: 'DST' }); expect(request).not.toHaveProperty('timestamp'); expect(request).not.toHaveProperty('random'); });

  it.each(BINARY_EXPORT_STATUS_CATEGORIES)('creates immutable %s status', category => { const status = createBinaryExportStatusV2({ category }); expect(status.code).toBe(BINARY_EXPORT_STATUS_CODES[category]); expect(Object.isFrozen(status)).toBe(true); });
  it('defaults status to invalid request', () => expect(createBinaryExportStatusV2().category).toBe('invalid_request'));
  it('preserves explicit status reason', () => expect(createBinaryExportStatusV2({ reasonCode: 'WHY', reason: 'because' })).toMatchObject({ reasonCode: 'WHY', reason: 'because' }));

  it.each(BINARY_FORMAT_LIMITATION_SEVERITIES)('creates immutable %s limitation', severity => { const limitation = createBinaryFormatLimitationV2({ severity, source: { nested: {} } }); expect(limitation.severity).toBe(severity); expect(Object.isFrozen(limitation.source.nested)).toBe(true); });
  it('preserves acknowledgement verbatim', () => { const text = 'I explicitly accept no trim output.'; expect(createBinaryFormatLimitationV2({ acknowledged: true, acknowledgement: text }).acknowledgement).toBe(text); });

  it('creates immutable unified results', () => expect(Object.isFrozen(createUnifiedBinaryExportResultV2())).toBe(true));
  it('defaults unified version', () => expect(createUnifiedBinaryExportResultV2().version).toBe('2-unified-binary-export-facade'));
  it('clones unified result arrays', () => { const errors = [{ code: 'E' }]; const result = createUnifiedBinaryExportResultV2({ errors }); errors[0].code = 'CHANGED'; expect(result.errors[0].code).toBe('E'); });
  it('freezes unified result metadata deeply', () => { const result = createUnifiedBinaryExportResultV2({ metadata: { nested: {} } }); expect(Object.isFrozen(result.metadata.nested)).toBe(true); });
});
