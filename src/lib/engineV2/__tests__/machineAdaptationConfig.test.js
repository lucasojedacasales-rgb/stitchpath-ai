import { describe, expect, it } from 'vitest';
import { resolveMachineAdaptationConfig, validateMachineAdaptationConfig } from '../machineAdaptation/machineAdaptationConfig.js';
describe('Phase 11 adaptation config', () => {
  it('defaults to generic_dst', () => expect(resolveMachineAdaptationConfig().machineProfile).toBe('generic_dst'));
  it('disables encoding', () => expect(resolveMachineAdaptationConfig().encoding).toBe(false));
  it('disables CE01 logic', () => expect(resolveMachineAdaptationConfig().CE01Logic).toBe(false));
  it('rejects encoding', () => expect(validateMachineAdaptationConfig(resolveMachineAdaptationConfig({ encoding: true })).valid).toBe(false));
  it('rejects nonuniform scale', () => expect(validateMachineAdaptationConfig(resolveMachineAdaptationConfig({ transform: { scaleX: 2 } })).valid).toBe(false));
  it('keeps unknown fields in extras', () => expect(resolveMachineAdaptationConfig({ note: 'x' }).extras.note).toBe('x'));
  it.each(Array.from({ length: 12 }, (_, index) => [index - 6]))('accepts finite translation %i', value => { const config = resolveMachineAdaptationConfig({ transform: { translateXmm: value, translateYmm: -value } }); expect(validateMachineAdaptationConfig(config).valid).toBe(true); });
});
