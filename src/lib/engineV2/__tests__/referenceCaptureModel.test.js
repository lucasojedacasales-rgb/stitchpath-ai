import { describe, expect, it } from 'vitest';
import { createEngineV2ReferenceCaptureManifest, createPhysicalMachineTestV2, createReferenceCaptureGateResultV2, createReferenceSourceProvenanceV2, PHYSICAL_MACHINE_TEST_STATUSES, REFERENCE_EVIDENCE_TYPES, REFERENCE_SOURCE_KINDS } from '../referenceCapture/referenceCaptureModel.js';

describe('Phase 13A reference-capture models', () => {
  it.each(REFERENCE_SOURCE_KINDS)('exposes source kind %s', value => expect(REFERENCE_SOURCE_KINDS).toContain(value));
  it.each(REFERENCE_EVIDENCE_TYPES)('exposes evidence type %s', value => expect(REFERENCE_EVIDENCE_TYPES).toContain(value));
  it.each(PHYSICAL_MACHINE_TEST_STATUSES)('exposes physical status %s', value => expect(PHYSICAL_MACHINE_TEST_STATUSES).toContain(value));
  const provenance = createReferenceSourceProvenanceV2({ sourceKind: 'synthetic', sourceName: 'fixture', sourceFingerprint: '12345678', evidenceType: 'synthetic_fixture', verified: true });
  it.each([['sourceKind', 'synthetic'], ['sourceName', 'fixture'], ['sourceFingerprint', '12345678'], ['evidenceType', 'synthetic_fixture'], ['verified', true]])('preserves provenance %s', (key, value) => expect(provenance[key]).toBe(value));
  it('freezes provenance', () => expect(Object.isFrozen(provenance)).toBe(true));
  const physical = createPhysicalMachineTestV2();
  it.each([['status', 'not_tested'], ['recognized', false], ['sewStarted', false], ['sewCompleted', false]])('defaults physical %s', (key, value) => expect(physical[key]).toBe(value));
  it('freezes physical test', () => expect(Object.isFrozen(physical)).toBe(true));
  const gate = createReferenceCaptureGateResultV2({ captureAllowed: true, sourceKind: 'synthetic', syntheticReferenceCaptured: true });
  it.each([['captureAllowed', true], ['syntheticReferenceCaptured', true], ['realReferenceFixtureAvailable', false], ['realReferenceFixtureCaptured', false], ['physicalMachineAcceptanceVerified', false], ['readyForApplicationIntegration', false], ['readyForProductionRelease', false]])('preserves safe gate %s', (key, value) => expect(gate[key]).toBe(value));
  it('forces real fixture unavailable', () => expect(createReferenceCaptureGateResultV2({ realReferenceFixtureAvailable: true }).realReferenceFixtureAvailable).toBe(false));
  it('forces physical acceptance false', () => expect(createReferenceCaptureGateResultV2({ physicalMachineAcceptanceVerified: true }).physicalMachineAcceptanceVerified).toBe(false));
  const manifest = createEngineV2ReferenceCaptureManifest({ valid: true, sourceProvenance: provenance, requestFingerprint: '12345678' });
  it('sets manifest version', () => expect(manifest.version).toBe('2-reference-capture-manifest'));
  it('freezes manifest recursively', () => { expect(Object.isFrozen(manifest)).toBe(true); expect(Object.isFrozen(manifest.sourceProvenance)).toBe(true); });
  it('defaults physical test to not tested', () => expect(manifest.physicalMachineTest.status).toBe('not_tested'));
});
