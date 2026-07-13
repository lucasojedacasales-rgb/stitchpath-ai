import { describe, expect, it } from 'vitest';
import { createCanonicalCommandAdaptationSpanV2, createMachineAdaptedCommandStreamV2, createMachineAdaptedCommandV2, machineAdaptedCommandId } from '../machineAdaptation/machineAdaptedCommandModel.js';
describe('Phase 11 adapted models', () => {
  const command = createMachineAdaptedCommandV2({ adaptedIndex: 0, type: 'jump', xUnits: 1, yUnits: 2, dxUnits: 1, dyUnits: 2, xQuantizedMm: 0.1, yQuantizedMm: 0.2, sourceCanonicalCommandId: 'c:0' });
  it('creates deterministic command id', () => expect(command.id).toBe('machine-command:00000000:jump'));
  it('freezes command', () => expect(Object.isFrozen(command)).toBe(true));
  it('creates deterministic span id', () => expect(createCanonicalCommandAdaptationSpanV2({ canonicalCommandId: 'c:0' }).id).toBe('machine-span:c:0'));
  it('freezes stream', () => expect(Object.isFrozen(createMachineAdaptedCommandStreamV2())).toBe(true));
  it('uses eight digit lexical indexes', () => expect(machineAdaptedCommandId(9, 'stitch')).toContain('00000009'));
  it('defaults unsplit lineage', () => expect(command.splitCount).toBe(1));
  it.each(Array.from({ length: 12 }, (_, index) => [index]))('creates stable id %i', index => expect(machineAdaptedCommandId(index, 'stitch')).toBe(machineAdaptedCommandId(index, 'stitch')));
});
