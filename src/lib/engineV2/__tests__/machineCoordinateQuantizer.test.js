import { describe, expect, it } from 'vitest';
import { dequantizeMachineUnitsToMillimeters, quantizeMachineMillimetersToUnits, roundHalfAwayFromZero } from '../machineAdaptation/machineCoordinateQuantizer.js';
describe('Phase 11 coordinate quantizer', () => {
  it('rounds positive half away', () => expect(roundHalfAwayFromZero(1.5)).toBe(2));
  it('rounds negative half away', () => expect(roundHalfAwayFromZero(-1.5)).toBe(-2));
  it('preserves exact zero', () => expect(roundHalfAwayFromZero(-0)).toBe(0));
  it('quantizes absolute coordinates', () => expect(quantizeMachineMillimetersToUnits({ x: 1.25, y: -1.25 }, 0.1)).toEqual({ x: 13, y: -13 }));
  it('dequantizes units', () => expect(dequantizeMachineUnitsToMillimeters({ x: 13, y: -13 }, 0.1)).toEqual({ x: 1.3, y: -1.3 }));
  it('rejects NaN', () => expect(() => roundHalfAwayFromZero(NaN)).toThrow());
  it.each(Array.from({ length: 12 }, (_, index) => [index - 6]))('quantizes deterministically %i', value => expect(quantizeMachineMillimetersToUnits({ x: value + 0.05, y: value - 0.05 }, 0.1)).toEqual(quantizeMachineMillimetersToUnits({ x: value + 0.05, y: value - 0.05 }, 0.1)));
});
