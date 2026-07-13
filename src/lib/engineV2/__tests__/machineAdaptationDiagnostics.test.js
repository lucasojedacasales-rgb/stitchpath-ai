import { beforeAll, describe, expect, it } from 'vitest';
import { createGenericMascotMachineFixture } from '../fixtures/genericMascotMachineFixture.js';
import { createMachineAdaptationDiagnostic } from '../machineAdaptation/machineAdaptationDiagnostics.js';
let diagnostic;
beforeAll(() => { const fixture = createGenericMascotMachineFixture(); diagnostic = createMachineAdaptationDiagnostic({ canonicalCompilation: fixture.canonicalCompilation, machineAdaptedStream: fixture.machineAdaptedStream }); });
describe('Phase 11 adaptation diagnostics', () => {
  it('reports valid stream', () => expect(diagnostic.valid).toBe(true));
  it('reports generic profile', () => expect(diagnostic.machineProfileId).toBe('generic_dst'));
  it('reports complete coverage', () => expect(diagnostic.canonicalCommandAdaptationCoveragePercent).toBe(100));
  it('reports no silent drops', () => expect(diagnostic.silentCanonicalCommandDropCount).toBe(0));
  it('reports quantization', () => expect(diagnostic.coordinatesQuantized).toBe(true));
  it('reports no encoders', () => expect(diagnostic.DSTEncoderInvoked || diagnostic.DSBEncoderInvoked).toBe(false));
  it.each(Array.from({ length: 12 }, (_, index) => [index]))('reports stable distribution %i', () => expect(diagnostic.adaptedCommandTypeDistribution.end).toBe(1));
});
