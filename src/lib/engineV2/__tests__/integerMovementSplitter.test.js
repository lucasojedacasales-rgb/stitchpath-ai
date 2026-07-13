import { describe, expect, it } from 'vitest';
import { splitIntegerMovement } from '../machineAdaptation/integerMovementSplitter.js';
describe('Phase 11 integer movement splitter', () => {
  it('leaves unbounded movement whole', () => expect(splitIntegerMovement({ dxUnits: 20, dyUnits: 1, maximumDeltaUnits: null, commandType: 'stitch' }).segments).toHaveLength(1));
  it('splits a long stitch', () => expect(splitIntegerMovement({ dxUnits: 21, dyUnits: 0, maximumDeltaUnits: 10, commandType: 'stitch' }).segments).toHaveLength(3));
  it('preserves jump type', () => expect(splitIntegerMovement({ dxUnits: 21, dyUnits: 0, maximumDeltaUnits: 10, commandType: 'jump' }).segments.every(item => item.commandType === 'jump')).toBe(true));
  it('rejects zero movement', () => expect(splitIntegerMovement({ dxUnits: 0, dyUnits: 0, maximumDeltaUnits: 10, commandType: 'jump' }).valid).toBe(false));
  it('rejects invalid maximum', () => expect(splitIntegerMovement({ dxUnits: 1, dyUnits: 1, maximumDeltaUnits: 0, commandType: 'jump' }).valid).toBe(false));
  it('keeps components bounded', () => expect(splitIntegerMovement({ dxUnits: 45, dyUnits: -27, maximumDeltaUnits: 10, commandType: 'stitch' }).segments.every(item => Math.abs(item.dxUnits) <= 10 && Math.abs(item.dyUnits) <= 10)).toBe(true));
  it.each(Array.from({ length: 12 }, (_, index) => [index + 11, -(index + 3)]))('preserves exact endpoint %i,%i', (dxUnits, dyUnits) => { const result = splitIntegerMovement({ dxUnits, dyUnits, maximumDeltaUnits: 7, commandType: 'stitch' }); expect(result.segments.reduce((sum, item) => sum + item.dxUnits, 0)).toBe(dxUnits); expect(result.segments.reduce((sum, item) => sum + item.dyUnits, 0)).toBe(dyUnits); });
});
