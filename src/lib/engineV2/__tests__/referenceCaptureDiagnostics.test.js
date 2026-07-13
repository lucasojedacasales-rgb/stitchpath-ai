import { describe, expect, it } from 'vitest';
import { createReferenceCaptureDiagnostic } from '../referenceCapture/referenceCaptureDiagnostics.js';

describe('Phase 13A reference-capture diagnostics', () => {
  const gateResult = { captureAllowed: true, sourceKind: 'synthetic', reasonCode: null, syntheticReferenceCaptured: true, blockingReasons: [], warnings: [] };
  const diagnostic = createReferenceCaptureDiagnostic({ gateResult, manifest: { valid: true } });
  it.each([['captureAllowed', true], ['sourceKind', 'synthetic'], ['reasonCode', null], ['manifestCreated', true], ['manifestValid', true], ['syntheticReferenceCaptured', true], ['realReferenceFixtureAvailable', false], ['realReferenceFixtureCaptured', false], ['physicalMachineAcceptanceVerified', false], ['readyForApplicationIntegration', false], ['readyForProductionRelease', false]])('reports %s', (key, value) => expect(diagnostic[key]).toBe(value));
  it('reports absent manifest', () => expect(createReferenceCaptureDiagnostic({ gateResult: { ...gateResult, captureAllowed: false }, manifest: null }).manifestCreated).toBe(false));
  it('freezes diagnostic', () => expect(Object.isFrozen(diagnostic)).toBe(true));
  it('freezes blocking reasons', () => expect(Object.isFrozen(diagnostic.blockingReasons)).toBe(true));
  it('freezes warnings', () => expect(Object.isFrozen(diagnostic.warnings)).toBe(true));
});
