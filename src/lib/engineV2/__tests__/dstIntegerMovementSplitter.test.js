import { describe, expect, it } from 'vitest';
import { splitDSTIntegerMovement } from '../formatAdaptation/dstIntegerMovementSplitter.js';

const movementCases = Array.from({ length: 64 }, (_, index) => {
  const dx = (index - 32) * 19 || 1; const dy = ((index * 37) % 701) - 350;
  return [dx, dy];
});

describe('Phase 12B DST integer movement splitter', () => {
  it.each(movementCases)('splits exact deterministic movement %i,%i', (dx, dy) => {
    const result = splitDSTIntegerMovement({ startXUnits: 13, startYUnits: -7, targetXUnits: 13 + dx, targetYUnits: -7 + dy });
    expect(result.valid).toBe(true);
    expect(result.segments.reduce((sum, segment) => sum + segment.dxUnits, 0)).toBe(dx);
    expect(result.segments.reduce((sum, segment) => sum + segment.dyUnits, 0)).toBe(dy);
    expect(result.segments.at(-1)).toMatchObject({ xUnits: 13 + dx, yUnits: -7 + dy });
    expect(result.segments.every(segment => Math.abs(segment.dxUnits) <= 121 && Math.abs(segment.dyUnits) <= 121)).toBe(true);
    expect(result.segments.every(segment => segment.dxUnits !== 0 || segment.dyUnits !== 0)).toBe(true);
  });
  it.each([-121, -120, -1, 1, 120, 121])('does not split boundary movement %i', delta => expect(splitDSTIntegerMovement({ startXUnits: 0, startYUnits: 0, targetXUnits: delta, targetYUnits: 0 }).segments).toHaveLength(1));
  it.each([-350, 350])('splits 350-unit movement into three records %i', delta => expect(splitDSTIntegerMovement({ startXUnits: 0, startYUnits: 0, targetXUnits: delta, targetYUnits: 0 }).segments).toHaveLength(3));
  it('returns no segments for zero movement', () => expect(splitDSTIntegerMovement({ startXUnits: 2, startYUnits: 3, targetXUnits: 2, targetYUnits: 3 }).segments).toHaveLength(0));
  it.each(['startXUnits', 'startYUnits', 'targetXUnits', 'targetYUnits'])('rejects noninteger %s', key => expect(splitDSTIntegerMovement({ startXUnits: 0, startYUnits: 0, targetXUnits: 1, targetYUnits: 1, [key]: 0.5 }).valid).toBe(false));
  it.each([0, -1, 1.5])('rejects invalid maximum %s', maximumDeltaUnits => expect(splitDSTIntegerMovement({ startXUnits: 0, startYUnits: 0, targetXUnits: 1, targetYUnits: 1, maximumDeltaUnits }).valid).toBe(false));
  it('is byte-for-byte deterministic as data', () => { const input = { startXUnits: -99, startYUnits: 23, targetXUnits: 721, targetYUnits: -444 }; expect(JSON.stringify(splitDSTIntegerMovement(input))).toBe(JSON.stringify(splitDSTIntegerMovement(input))); });
});

