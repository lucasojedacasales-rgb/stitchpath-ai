import { describe, expect, it } from 'vitest';
import { normalizedHolesToMillimeters, normalizedPolygonToMillimeters, regionGeometryToMillimeters } from '../index.js';

const polygon = [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.8, y: 0.9 }, { x: 0.1, y: 0.9 }];

describe('Phase 4 normalized geometry conversion', () => {
  it('converts x using design width', () => expect(normalizedPolygonToMillimeters(polygon, 50, 100).points[0].x).toBe(5));
  it('converts y using design height', () => expect(normalizedPolygonToMillimeters(polygon, 50, 100).points[0].y).toBe(20));
  it('supports rectangular design dimensions', () => expect(normalizedPolygonToMillimeters(polygon, 70, 120).points[2]).toEqual({ x: 56, y: 108 }));
  it('does not center coordinates around the origin', () => expect(normalizedPolygonToMillimeters([{ x: 0, y: 0 }], 50, 100).points[0]).toEqual({ x: 0, y: 0 }));
  it('does not add machine offsets', () => expect(normalizedPolygonToMillimeters([{ x: 1, y: 1 }], 50, 100).points[0]).toEqual({ x: 50, y: 100 }));
  it('converts explicit holes', () => {
    const result = normalizedHolesToMillimeters([[{ x: 0.2, y: 0.3 }, { x: 0.3, y: 0.3 }, { x: 0.3, y: 0.4 }]], 100, 50);
    expect(result.holes[0][0]).toEqual({ x: 20, y: 15 });
  });
  it.each([[0, 100], [-1, 100], [100, 0], [Infinity, 100]])('rejects invalid dimensions %s x %s', (width, height) => {
    expect(normalizedPolygonToMillimeters(polygon, width, height).valid).toBe(false);
  });
  it('rejects out-of-range geometry instead of clamping', () => {
    const result = normalizedPolygonToMillimeters([{ x: 1.1, y: 0 }], 100, 100);
    expect(result.valid).toBe(false);
    expect(result.points).toEqual([]);
  });
  it('does not mutate geometry or holes', () => {
    const region = { geometry: structuredClone(polygon), holes: [[{ x: 0.2, y: 0.3 }, { x: 0.3, y: 0.3 }, { x: 0.3, y: 0.4 }]] };
    const before = structuredClone(region);
    regionGeometryToMillimeters(region, { designWidthMm: 70, designHeightMm: 120 });
    expect(region).toEqual(before);
  });
});
