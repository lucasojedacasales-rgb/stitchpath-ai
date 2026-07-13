import { beforeAll, describe, expect, it } from 'vitest';
import { createGenericMascotMachineFixture } from '../fixtures/genericMascotMachineFixture.js';
import { createStitchMovementSplittingFixture } from '../fixtures/stitchMovementSplittingFixture.js';
import { createJumpMovementSplittingFixture } from '../fixtures/jumpMovementSplittingFixture.js';
let fixture;
beforeAll(() => { fixture = createGenericMascotMachineFixture(); });
describe('Phase 11 machine command adapter', () => {
  it('adapts generic mascot validly', () => expect(fixture.machineAdaptedStream.valid).toBe(true));
  it('maps all 1550 commands', () => expect(fixture.machineAdaptedStream.spans).toHaveLength(1550));
  it('does not split generic profile', () => expect(fixture.machineAdaptedStream.summary.splitSourceMovementCount).toBe(0));
  it('preserves 17 trims', () => expect(fixture.machineAdaptedStream.summary.trimCommandCount).toBe(17));
  it('preserves four color changes', () => expect(fixture.machineAdaptedStream.summary.colorChangeCommandCount).toBe(4));
  it('preserves final end', () => expect(fixture.machineAdaptedStream.commands.at(-1).type).toBe('end'));
  it('splits bounded stitches', () => expect(createStitchMovementSplittingFixture().machineAdaptedStream.summary.stitchMovementSplitCount).toBeGreaterThan(0));
  it('splits bounded jumps', () => expect(createJumpMovementSplittingFixture().machineAdaptedStream.summary.jumpMovementSplitCount).toBeGreaterThan(0));
  it.each(Array.from({ length: 10 }, (_, index) => [index]))('retains canonical span order %i', index => expect(fixture.machineAdaptedStream.spans[index].canonicalCommandIndex).toBe(index));
});
