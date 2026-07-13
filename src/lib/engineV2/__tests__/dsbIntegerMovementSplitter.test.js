import { describe, expect, it } from 'vitest';
import { splitDSBIntegerMovement } from '../formatAdaptation/dsbIntegerMovementSplitter.js';

describe('Phase 12C DSB integer movement splitting', () => {
  it.each([-127, -126, -64, -1, 1, 64, 126, 127])('keeps X boundary movement %i unsplit', dxUnits => { const result = splitDSBIntegerMovement({ dxUnits, dyUnits: 0, commandType: 'stitch' }); expect(result.valid).toBe(true); expect(result.segments).toHaveLength(1); expect(result.segments[0].dxUnits).toBe(dxUnits); });
  it.each([-127, -126, -64, -1, 1, 64, 126, 127])('keeps Y boundary movement %i unsplit', dyUnits => { const result = splitDSBIntegerMovement({ dxUnits: 0, dyUnits, commandType: 'jump' }); expect(result.valid).toBe(true); expect(result.segments).toHaveLength(1); expect(result.segments[0].dyUnits).toBe(dyUnits); });
  it.each([
    [128, 0, 2], [-128, 0, 2], [0, 128, 2], [0, -128, 2], [254, 254, 2], [-254, -254, 2],
    [350, 0, 3], [-350, 0, 3], [350, -280, 3], [-350, 280, 3], [1000, 1, 8], [-1000, -1, 8],
  ])('splits (%i,%i) into %i bounded segments', (dxUnits, dyUnits, expectedCount) => { const result = splitDSBIntegerMovement({ dxUnits, dyUnits, commandType: 'jump' }); expect(result.valid).toBe(true); expect(result.segments).toHaveLength(expectedCount); expect(result.segments.every(segment => Math.abs(segment.dxUnits) <= 127 && Math.abs(segment.dyUnits) <= 127)).toBe(true); });
  it.each([
    [128, 5], [-128, -5], [255, 127], [-255, -127], [350, -280], [-350, 280], [1001, -997], [-1001, 997],
  ])('preserves exact total endpoint for (%i,%i)', (dxUnits, dyUnits) => { const result = splitDSBIntegerMovement({ dxUnits, dyUnits, commandType: 'stitch' }); expect(result.segments.reduce((sum, segment) => sum + segment.dxUnits, 0)).toBe(dxUnits); expect(result.segments.reduce((sum, segment) => sum + segment.dyUnits, 0)).toBe(dyUnits); });
  it.each([[128, 1], [1, 128], [-128, -1], [-1, -128], [350, -280], [-350, 280]])('does not create zero segments for (%i,%i)', (dxUnits, dyUnits) => expect(splitDSBIntegerMovement({ dxUnits, dyUnits, commandType: 'jump' }).segments.every(segment => segment.dxUnits !== 0 || segment.dyUnits !== 0)).toBe(true));
  it.each(['stitch', 'jump'])('preserves %s command type in all segments', commandType => expect(splitDSBIntegerMovement({ dxUnits: 350, dyUnits: 20, commandType }).segments.every(segment => segment.commandType === commandType)).toBe(true));
  it.each([[1.5, 0], [0, 2.5], [NaN, 1], [1, Infinity]])('rejects non-integer delta (%s,%s)', (dxUnits, dyUnits) => expect(splitDSBIntegerMovement({ dxUnits, dyUnits, commandType: 'stitch' }).valid).toBe(false));
  it.each([0, -1, 1.5])('rejects invalid maximum %s', maximumDeltaUnits => expect(splitDSBIntegerMovement({ dxUnits: 1, dyUnits: 1, maximumDeltaUnits, commandType: 'stitch' }).valid).toBe(false));
  it('returns explicit empty split for zero movement', () => expect(splitDSBIntegerMovement({ dxUnits: 0, dyUnits: 0, commandType: 'jump' }).segments).toHaveLength(0));
  it('is deterministic', () => expect(splitDSBIntegerMovement({ dxUnits: 987, dyUnits: -654, commandType: 'jump' })).toEqual(splitDSBIntegerMovement({ dxUnits: 987, dyUnits: -654, commandType: 'jump' })));
});
