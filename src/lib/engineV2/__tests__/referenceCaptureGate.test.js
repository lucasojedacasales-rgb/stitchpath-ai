import { describe, expect, it } from 'vitest';
import { createReferenceCaptureInvalidRealFixture } from '../fixtures/referenceCaptureInvalidRealFixture.js';
import { evaluateReferenceCaptureGate } from '../referenceCapture/referenceCaptureGate.js';

const pipeline = { valid: true, pipelineCompleted: true };
const synthetic = { sourceKind: 'synthetic', sourceName: 'fixture', sourceFingerprint: '12345678', evidenceType: 'synthetic_fixture', verified: true };
const evaluate = overrides => evaluateReferenceCaptureGate({ pipelineResult: pipeline, provenance: synthetic, physicalMachineTest: { status: 'not_tested' }, ...overrides });

describe('Phase 13A reference-capture gate', () => {
  const accepted = evaluate();
  it.each([['captureAllowed', true], ['sourceKind', 'synthetic'], ['reasonCode', null], ['syntheticReferenceCaptured', true], ['realReferenceFixtureAvailable', false], ['realReferenceFixtureCaptured', false], ['physicalMachineAcceptanceVerified', false], ['readyForApplicationIntegration', false], ['readyForProductionRelease', false]])('reports accepted synthetic %s', (key, value) => expect(accepted[key]).toBe(value));
  it('has no accepted blocking reasons', () => expect(accepted.blockingReasons).toEqual([]));
  it('blocks invalid pipeline', () => expect(evaluate({ pipelineResult: { valid: false, pipelineCompleted: false } }).reasonCode).toBe('PIPELINE_NOT_CAPTURE_READY'));
  it('blocks incomplete pipeline', () => expect(evaluate({ pipelineResult: { valid: true, pipelineCompleted: false } }).captureAllowed).toBe(false));
  it('blocks disabled synthetic capture', () => expect(evaluate({ config: { allowSyntheticCapture: false } }).captureAllowed).toBe(false));
  it('blocks physical recognition claim', () => expect(evaluate({ physicalMachineTest: { status: 'recognized', machineName: 'machine', evidenceReference: 'evidence', recognized: true } }).captureAllowed).toBe(false));
  it('blocks physical completion claim', () => expect(evaluate({ physicalMachineTest: { status: 'sew_completed', machineName: 'machine', evidenceReference: 'evidence', recognized: true, sewStarted: true, sewCompleted: true } }).captureAllowed).toBe(false));
  it('blocks incomplete real provenance', () => expect(evaluate({ provenance: createReferenceCaptureInvalidRealFixture() }).captureAllowed).toBe(false));
  it('blocks complete real provenance because no real fixture exists', () => { const gate = evaluate({ provenance: { sourceKind: 'real', sourceName: 'real', sourceFingerprint: '12345678', evidenceType: 'binary_reference', evidenceReference: 'evidence', verified: true } }); expect(gate.captureAllowed).toBe(false); expect(gate.blockingReasons.some(item => item.code === 'REAL_REFERENCE_FIXTURE_NOT_AVAILABLE')).toBe(true); });
  it.each(['realReferenceFixtureAvailable', 'realReferenceFixtureCaptured', 'physicalMachineAcceptanceVerified', 'readyForApplicationIntegration', 'readyForProductionRelease'])('never claims %s', key => expect(accepted[key]).toBe(false));
  it('freezes gate root', () => expect(Object.isFrozen(accepted)).toBe(true));
  it('freezes blocking reasons', () => expect(Object.isFrozen(accepted.blockingReasons)).toBe(true));
});
