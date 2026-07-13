import { describe, expect, it } from 'vitest';
import { createEngineV2ReferenceCaptureManifest, createPhysicalMachineTestV2, createReferenceCaptureGateResultV2, createReferenceSourceProvenanceV2 } from '../referenceCapture/referenceCaptureModel.js';
import { validateEngineV2ReferenceCaptureManifest, validatePhysicalMachineTestV2, validateReferenceCaptureGateResult, validateReferenceSourceProvenanceV2 } from '../referenceCapture/referenceCaptureValidation.js';

const codes = result => result.errors.map(error => error.code);
const synthetic = createReferenceSourceProvenanceV2({ sourceKind: 'synthetic', sourceName: 'fixture', sourceFingerprint: '12345678', evidenceType: 'synthetic_fixture', verified: true });

describe('Phase 13A reference-capture validation', () => {
  it('accepts synthetic provenance', () => expect(validateReferenceSourceProvenanceV2(synthetic).valid).toBe(true));
  it.each([
    [{ sourceKind: 'invalid' }, 'REFERENCE_SOURCE_KIND_INVALID'],
    [{ evidenceType: 'invalid' }, 'REFERENCE_EVIDENCE_TYPE_INVALID'],
    [{ evidenceType: 'binary_reference' }, 'SYNTHETIC_REFERENCE_EVIDENCE_INVALID'],
    [{ sourceName: null }, 'SYNTHETIC_REFERENCE_IDENTITY_INCOMPLETE'],
    [{ sourceFingerprint: null }, 'SYNTHETIC_REFERENCE_IDENTITY_INCOMPLETE'],
  ])('rejects synthetic provenance violation %#', (override, code) => expect(codes(validateReferenceSourceProvenanceV2({ ...synthetic, ...override }))).toContain(code));
  it.each([
    { sourceName: null }, { sourceFingerprint: null }, { evidenceReference: null }, { evidenceType: 'synthetic_fixture' }, { verified: false },
  ])('rejects incomplete real provenance %#', override => { const real = { sourceKind: 'real', sourceName: 'real', sourceFingerprint: '12345678', evidenceType: 'binary_reference', evidenceReference: 'evidence', verified: true, ...override }; expect(codes(validateReferenceSourceProvenanceV2(real))).toContain('REAL_REFERENCE_PROVENANCE_INCOMPLETE'); });
  it('accepts structurally complete real provenance', () => expect(validateReferenceSourceProvenanceV2({ sourceKind: 'real', sourceName: 'real', sourceFingerprint: '12345678', evidenceType: 'binary_reference', evidenceReference: 'evidence', verified: true }).valid).toBe(true));

  it('accepts not-tested physical state', () => expect(validatePhysicalMachineTestV2(createPhysicalMachineTestV2()).valid).toBe(true));
  it.each([
    [{ status: 'invalid' }, 'PHYSICAL_MACHINE_TEST_STATUS_INVALID'],
    [{ recognized: true }, 'PHYSICAL_RECOGNITION_STATUS_INCONSISTENT'],
    [{ sewStarted: true }, 'PHYSICAL_SEW_START_STATUS_INCONSISTENT'],
    [{ sewCompleted: true }, 'PHYSICAL_SEW_COMPLETION_STATUS_INCONSISTENT'],
    [{ status: 'recognized', recognized: true }, 'PHYSICAL_MACHINE_EVIDENCE_INCOMPLETE'],
  ])('rejects physical claim violation %#', (override, code) => expect(codes(validatePhysicalMachineTestV2({ ...createPhysicalMachineTestV2(), ...override }))).toContain(code));

  const gate = createReferenceCaptureGateResultV2({ captureAllowed: true, sourceKind: 'synthetic', syntheticReferenceCaptured: true });
  it('accepts safe gate result', () => expect(validateReferenceCaptureGateResult(gate).valid).toBe(true));
  it('rejects real capture', () => expect(codes(validateReferenceCaptureGateResult({ ...gate, sourceKind: 'real' }))).toContain('REAL_REFERENCE_CAPTURE_FORBIDDEN_PHASE_13A'));
  it('rejects inconsistent synthetic capture', () => expect(codes(validateReferenceCaptureGateResult({ ...gate, captureAllowed: false }))).toContain('SYNTHETIC_CAPTURE_STATUS_INCONSISTENT'));

  const stageFingerprints = Object.fromEntries(Array.from({ length: 11 }, (_, index) => [`stage-${index}`, index.toString(16).padStart(8, '0')]));
  const manifest = createEngineV2ReferenceCaptureManifest({ sourceProvenance: synthetic, requestFingerprint: '12345678', stageFingerprints, physicalMachineTest: { status: 'not_tested' }, valid: true, metadata: {} });
  it('accepts a safe manifest', () => expect(validateEngineV2ReferenceCaptureManifest(manifest).valid).toBe(true));
  it.each([
    [{ version: 'wrong' }, 'REFERENCE_MANIFEST_VERSION_INVALID'],
    [{ requestFingerprint: 'wrong' }, 'REFERENCE_REQUEST_FINGERPRINT_INVALID'],
    [{ stageFingerprints: {} }, 'REFERENCE_STAGE_FINGERPRINT_COVERAGE_INCOMPLETE'],
    [{ metadata: { realReferenceFixtureAvailable: true } }, 'REFERENCE_MANIFEST_READINESS_CLAIM_FORBIDDEN'],
    [{ metadata: { physicalMachineAcceptanceVerified: true } }, 'REFERENCE_MANIFEST_READINESS_CLAIM_FORBIDDEN'],
  ])('rejects manifest violation %#', (override, code) => expect(codes(validateEngineV2ReferenceCaptureManifest({ ...manifest, ...override }))).toContain(code));
});
