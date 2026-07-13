import { beforeAll, describe, expect, it } from 'vitest';
import { createBinaryExportRequestV2, createBinaryExportStatusV2 } from '../formatAdaptation/binaryExportFacadeModel.js';
import {
  validateBinaryExportReadinessV2, validateBinaryExportRequestV2, validateBinaryExportStatusV2,
  validateUnifiedBinaryArtifactV2, validateUnifiedBinaryExportResultV2,
} from '../formatAdaptation/binaryExportFacadeValidation.js';
import { createUnifiedDSBExplicitFixture } from '../fixtures/unifiedDSBExplicitFixture.js';
import { createUnifiedDSTExportFixture } from '../fixtures/unifiedDSTExportFixture.js';

const codes = validation => validation.errors.map(error => error.code);
const mutable = value => structuredClone(value);

describe('Phase 12D binary export facade validation', () => {
  let dst; let dsb;
  beforeAll(() => { dst = createUnifiedDSTExportFixture(); dsb = createUnifiedDSBExplicitFixture(); }, 60000);

  it('accepts deterministic request', () => { const request = createBinaryExportRequestV2({ format: 'DST', machineAdaptedStream: dst.machineAdaptedStream }); expect(validateBinaryExportRequestV2(request, dst.machineAdaptedStream).valid).toBe(true); });
  it('rejects missing request format', () => expect(codes(validateBinaryExportRequestV2({ id: 'x' }))).toContain('BINARY_EXPORT_FORMAT_REQUIRED'));
  it('rejects unsupported request format', () => expect(codes(validateBinaryExportRequestV2({ format: 'PES' }))).toContain('UNSUPPORTED_BINARY_EXPORT_FORMAT'));
  it('rejects invalid fingerprint', () => { const request = mutable(dst.unifiedResult.request); request.sourceStreamFingerprint = 'bad'; expect(codes(validateBinaryExportRequestV2(request))).toContain('BINARY_EXPORT_FINGERPRINT_INVALID'); });
  it('rejects nondeterministic request ID', () => { const request = mutable(dst.unifiedResult.request); request.id = 'random'; expect(codes(validateBinaryExportRequestV2(request))).toContain('BINARY_EXPORT_REQUEST_ID_INVALID'); });
  it.each([-1, 1.5, '1', null])('rejects invalid source count %j', sourceCommandCount => { const request = mutable(dst.unifiedResult.request); request.sourceCommandCount = sourceCommandCount; expect(codes(validateBinaryExportRequestV2(request))).toContain('BINARY_EXPORT_SOURCE_COUNT_INVALID'); });
  it('rejects source fingerprint mismatch', () => { const request = createBinaryExportRequestV2({ format: 'DST', machineAdaptedStream: { commands: [] } }); expect(codes(validateBinaryExportRequestV2(request, dst.machineAdaptedStream))).toContain('BINARY_EXPORT_SOURCE_FINGERPRINT_MISMATCH'); });

  it.each(['accepted', 'policy_blocked', 'unsupported', 'invalid_request', 'adapter_error'])('accepts structurally coherent %s status code', category => { const status = createBinaryExportStatusV2({ category, accepted: category === 'accepted', transactionBlocked: category !== 'accepted', binaryGenerated: category === 'accepted', adapterInvoked: ['accepted', 'policy_blocked', 'adapter_error'].includes(category) }); expect(validateBinaryExportStatusV2(status).valid).toBe(true); });
  it('rejects unknown status category', () => expect(codes(validateBinaryExportStatusV2({ category: 'other' }))).toContain('BINARY_EXPORT_STATUS_CATEGORY_INVALID'));
  it('rejects mismatched status code', () => expect(codes(validateBinaryExportStatusV2({ category: 'accepted', code: 'WRONG' }))).toContain('BINARY_EXPORT_STATUS_CODE_INVALID'));
  it('rejects accepted status without accepted flag', () => expect(codes(validateBinaryExportStatusV2({ ...createBinaryExportStatusV2({ category: 'accepted' }), accepted: false }))).toContain('BINARY_EXPORT_ACCEPTED_STATUS_INCONSISTENT'));
  it('rejects blocked status claiming binary', () => expect(codes(validateBinaryExportStatusV2({ ...createBinaryExportStatusV2({ category: 'policy_blocked' }), binaryGenerated: true }))).toContain('BINARY_EXPORT_BLOCKED_STATUS_INCONSISTENT'));
  it('rejects unsupported status invoking adapter', () => expect(codes(validateBinaryExportStatusV2({ ...createBinaryExportStatusV2({ category: 'unsupported' }), adapterInvoked: true }))).toContain('BINARY_EXPORT_PRE_ROUTING_STATUS_INVOKED_ADAPTER'));

  it('accepts valid DST artifact', () => expect(validateUnifiedBinaryArtifactV2(dst.unifiedResult.artifact).valid).toBe(true));
  it.each([
    ['format', 'PES', 'BINARY_ARTIFACT_FORMAT_INVALID'], ['byteLength', 1, 'BINARY_ARTIFACT_LENGTH_MISMATCH'],
    ['checksum', 1, 'BINARY_ARTIFACT_CHECKSUM_MISMATCH'], ['filename', null, 'BINARY_ARTIFACT_IDENTITY_REQUIRED'],
    ['headerByteLength', 0, 'BINARY_ARTIFACT_HEADER_INVALID'], ['finalEOFPresent', false, 'BINARY_ARTIFACT_ACCEPTANCE_INCOMPLETE'],
    ['parserRoundtripPassed', false, 'BINARY_ARTIFACT_ACCEPTANCE_INCOMPLETE'], ['deterministicBytesVerified', false, 'BINARY_ARTIFACT_ACCEPTANCE_INCOMPLETE'],
  ])('rejects artifact mutation %s', (field, value, expected) => { const artifact = mutable(dst.unifiedResult.artifact); artifact[field] = value; expect(codes(validateUnifiedBinaryArtifactV2(artifact))).toContain(expected); });
  it('rejects non-Uint8Array bytes', () => { const artifact = mutable(dst.unifiedResult.artifact); artifact.bytes = []; expect(codes(validateUnifiedBinaryArtifactV2(artifact))).toContain('BINARY_ARTIFACT_BYTES_REQUIRED'); });

  it('accepts conservative readiness', () => expect(validateBinaryExportReadinessV2(dst.unifiedResult.readiness).valid).toBe(true));
  it.each([
    ['physicalMachineAcceptanceVerified', 'BINARY_PHYSICAL_MACHINE_ACCEPTANCE_UNVERIFIED'],
    ['readyForApplicationIntegration', 'BINARY_APPLICATION_READINESS_FORBIDDEN'],
    ['readyForProductionRelease', 'BINARY_PRODUCTION_READINESS_FORBIDDEN'],
  ])('rejects forbidden readiness claim %s', (field, expected) => { const readiness = mutable(dst.unifiedResult.readiness); readiness[field] = true; expect(codes(validateBinaryExportReadinessV2(readiness))).toContain(expected); });
  it('rejects inconsistent disconnected readiness', () => { const readiness = mutable(dst.unifiedResult.readiness); readiness.structurallyAccepted = false; expect(codes(validateBinaryExportReadinessV2(readiness))).toContain('BINARY_DISCONNECTED_READINESS_INCONSISTENT'); });
  it('rejects DSB physical trim support claim', () => { const readiness = mutable(dsb.unifiedResult.readiness); readiness.physicalTrimSupportVerified = true; expect(codes(validateBinaryExportReadinessV2(readiness))).toContain('DSB_PHYSICAL_TRIM_SUPPORT_UNVERIFIED'); });

  it('accepts complete DST unified result', () => expect(validateUnifiedBinaryExportResultV2(dst.unifiedResult, dst.machineAdaptedStream).valid).toBe(true));
  it('accepts complete explicit DSB unified result', () => expect(validateUnifiedBinaryExportResultV2(dsb.unifiedResult, dsb.machineAdaptedStream).valid).toBe(true));
  it.each([
    ['selectedAdapter', 'engineV2-dsb', 'BINARY_SELECTED_ADAPTER_MISMATCH'],
    ['selectedFormat', 'DSB', 'BINARY_SELECTED_FORMAT_MISMATCH'],
    ['valid', false, 'BINARY_UNIFIED_VALIDITY_INCONSISTENT'],
  ])('rejects unified mutation %s', (field, value, expected) => { const result = mutable(dst.unifiedResult); result[field] = value; expect(codes(validateUnifiedBinaryExportResultV2(result, dst.machineAdaptedStream))).toContain(expected); });
  it('rejects accepted result without artifact', () => { const result = mutable(dst.unifiedResult); result.artifact = null; expect(codes(validateUnifiedBinaryExportResultV2(result, dst.machineAdaptedStream))).toContain('BINARY_ACCEPTED_RESULT_MISSING_ARTIFACT'); });
  it('rejects multiple adapter invocations', () => { const result = mutable(dst.unifiedResult); result.summary.DSBAdapterInvocationCount = 1; result.summary.totalFormatAdapterInvocationCount = 2; expect(codes(validateUnifiedBinaryExportResultV2(result, dst.machineAdaptedStream))).toContain('BINARY_MULTIPLE_ADAPTER_INVOCATIONS'); });
  it('rejects cross-format adapter invocation', () => { const result = mutable(dst.unifiedResult); result.summary.DSBAdapterInvocationCount = 1; expect(codes(validateUnifiedBinaryExportResultV2(result, dst.machineAdaptedStream))).toContain('BINARY_CROSS_FORMAT_ADAPTER_SELECTED'); });
  it.each([
    ['crossFormatInvocationCount', 1, 'BINARY_CROSS_FORMAT_INVOCATION'], ['formatFallbackCount', 1, 'BINARY_FORMAT_FALLBACK_DETECTED'],
    ['sourceStreamMutationCount', 1, 'BINARY_SOURCE_STREAM_MUTATED'], ['Base44InvocationCount', 1, 'BINARY_FORBIDDEN_EXTERNAL_INVOCATION'],
    ['applicationInvocationCount', 1, 'BINARY_FORBIDDEN_EXTERNAL_INVOCATION'], ['browserDownloadCreationCount', 1, 'BINARY_FORBIDDEN_EXTERNAL_INVOCATION'],
  ])('rejects forbidden summary mutation %s', (field, value, expected) => { const result = mutable(dst.unifiedResult); result.summary[field] = value; expect(codes(validateUnifiedBinaryExportResultV2(result, dst.machineAdaptedStream))).toContain(expected); });
  it.each([
    ['sourceCommandDispositionCoveragePercent', 99, 'BINARY_SOURCE_COVERAGE_MUTATED'],
    ['binaryLineageCoveragePercent', 99, 'BINARY_LINEAGE_COVERAGE_MUTATED'],
    ['parserRoundtripPassed', false, 'BINARY_PARSER_STATUS_MUTATED'], ['finalEOFPresent', false, 'BINARY_EOF_STATUS_MUTATED'],
  ])('rejects direct metric mutation %s', (field, value, expected) => { const result = mutable(dst.unifiedResult); result.summary[field] = value; expect(codes(validateUnifiedBinaryExportResultV2(result, dst.machineAdaptedStream))).toContain(expected); });
  it('rejects artifact bytes differing from direct bytes', () => { const result = mutable(dst.unifiedResult); result.artifact.bytes[0] ^= 1; expect(codes(validateUnifiedBinaryExportResultV2(result, dst.machineAdaptedStream))).toContain('BINARY_ARTIFACT_DIRECT_PARITY_FAILED'); });
  it('rejects artifact identity mutation', () => { const result = mutable(dst.unifiedResult); result.artifact.filename = 'other.dst'; expect(codes(validateUnifiedBinaryExportResultV2(result, dst.machineAdaptedStream))).toContain('BINARY_ARTIFACT_IDENTITY_MUTATED'); });
  it('rejects warning suppression', () => { const result = mutable(dsb.unifiedResult); result.warnings = []; expect(codes(validateUnifiedBinaryExportResultV2(result, dsb.machineAdaptedStream))).toContain('BINARY_FORMAT_WARNINGS_SUPPRESSED'); });
  it('rejects error suppression', () => { const result = mutable(dst.unifiedResult); result.errors = [{ code: 'NEW' }]; expect(codes(validateUnifiedBinaryExportResultV2(result, dst.machineAdaptedStream))).toContain('BINARY_FORMAT_ERRORS_SUPPRESSED'); });
  it('rejects missing DSB trim limitation', () => { const result = mutable(dsb.unifiedResult); result.limitations = []; expect(codes(validateUnifiedBinaryExportResultV2(result, dsb.machineAdaptedStream))).toContain('DSB_TRIM_LIMITATION_MISSING'); });
  it('rejects incomplete parity summary', () => { const result = mutable(dst.unifiedResult); result.summary.formatResultParityPercent = 80; expect(codes(validateUnifiedBinaryExportResultV2(result, dst.machineAdaptedStream))).toContain('BINARY_FORMAT_PARITY_INCOMPLETE'); });
});
