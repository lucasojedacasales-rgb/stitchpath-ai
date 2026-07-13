import { describe, expect, it } from 'vitest';
import { createMachineProfileV2, GENERIC_DST_MACHINE_PROFILE, resolveMachineProfile } from '../machineAdaptation/machineProfileModel.js';
import { validateMachineProfileV2 } from '../machineAdaptation/machineAdaptationValidation.js';
describe('Phase 11 machine profile model', () => {
  it('provides generic_dst', () => expect(resolveMachineProfile('generic_dst')).toBe(GENERIC_DST_MACHINE_PROFILE));
  it('uses 0.1 mm resolution', () => expect(GENERIC_DST_MACHINE_PROFILE.coordinateResolutionMm).toBe(0.1));
  it('has unbounded generic movement', () => expect(GENERIC_DST_MACHINE_PROFILE.maximumStitchDeltaUnits).toBeNull());
  it('is immutable', () => expect(Object.isFrozen(GENERIC_DST_MACHINE_PROFILE)).toBe(true));
  it('rejects a missing id', () => expect(validateMachineProfileV2(createMachineProfileV2({ coordinateResolutionMm: 1 })).valid).toBe(false));
  it('does not resolve unknown built-ins', () => expect(resolveMachineProfile('missing')).toBeNull());
  it.each(Array.from({ length: 12 }, (_, index) => [index + 1, (index + 1) / 10]))('validates synthetic profile %i', (_, resolution) => { const profile = createMachineProfileV2({ ...GENERIC_DST_MACHINE_PROFILE, id: `p:${resolution}`, coordinateResolutionMm: resolution }); expect(validateMachineProfileV2(profile).valid).toBe(true); });
});
