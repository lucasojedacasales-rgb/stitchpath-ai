import { describe, expect, it } from 'vitest';
import { adaptTrimCommandForMachineProfile } from '../machineAdaptation/trimCapabilityAdapter.js';
import { createBoundedSyntheticProfile } from '../fixtures/stitchMovementSplittingFixture.js';
const adapt = (capability, policy = 'preserve_intent') => adaptTrimCommandForMachineProfile({ canonicalCommand: { id: 'trim:1', type: 'trim' }, profile: createBoundedSyntheticProfile({ trimCapability: capability, unsupportedTrimPolicy: policy }), config: { blockUnsupportedTrim: false } });
describe('Phase 11 trim capability', () => {
  it('preserves native trim', () => expect(adapt('native').valid).toBe(true));
  it('warns for intent-only', () => expect(adapt('intent_only').warnings[0].code).toBe('TRIM_INTENT_REQUIRES_ENCODER_OR_MACHINE_INTERPRETATION'));
  it('preserves unsupported intent', () => expect(adapt('unsupported').preserve).toBe(true));
  it('blocks unsupported when configured', () => expect(adapt('unsupported', 'block').valid).toBe(false));
  it('warns for unknown', () => expect(adapt('unknown').warnings).toHaveLength(1));
  it('never silently deletes', () => expect(adapt('unsupported').preserve).toBe(true));
  it.each(Array.from({ length: 12 }, (_, index) => [index]))('is deterministic pass %i', () => expect(adapt('native')).toEqual(adapt('native')));
});
