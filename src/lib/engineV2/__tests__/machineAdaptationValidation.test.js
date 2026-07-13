import { beforeAll, describe, expect, it } from 'vitest';
import { createGenericMascotMachineFixture } from '../fixtures/genericMascotMachineFixture.js';
import { validateCanonicalCommandAdaptationSpanV2, validateMachineAdaptedCommandStreamV2, validateMachineAdaptedCommandV2, validateMachineProfileV2 } from '../machineAdaptation/machineAdaptationValidation.js';
import { GENERIC_DST_MACHINE_PROFILE } from '../machineAdaptation/machineProfileModel.js';
let fixture;
beforeAll(() => { fixture = createGenericMascotMachineFixture(); });
describe('Phase 11 adaptation validation', () => {
  it('validates generic profile', () => expect(validateMachineProfileV2(GENERIC_DST_MACHINE_PROFILE).valid).toBe(true));
  it('validates generic stream', () => expect(validateMachineAdaptedCommandStreamV2(fixture.machineAdaptedStream, fixture.canonicalCompilation).valid).toBe(true));
  it('validates movement command', () => expect(validateMachineAdaptedCommandV2(fixture.machineAdaptedStream.commands[0]).valid).toBe(true));
  it('validates span', () => expect(validateCanonicalCommandAdaptationSpanV2(fixture.machineAdaptedStream.spans[0], 1550).valid).toBe(true));
  it('rejects noninteger coordinate', () => expect(validateMachineAdaptedCommandV2({ ...fixture.machineAdaptedStream.commands[0], xUnits: 0.5 }).valid).toBe(false));
  it('rejects nondeterministic id', () => expect(validateMachineAdaptedCommandV2({ ...fixture.machineAdaptedStream.commands[0], id: 'wrong' }).valid).toBe(false));
  it.each(Array.from({ length: 12 }, (_, index) => [index]))('validates canonical span %i', index => expect(validateCanonicalCommandAdaptationSpanV2(fixture.machineAdaptedStream.spans[index], fixture.machineAdaptedStream.commands.length).valid).toBe(true));
});
