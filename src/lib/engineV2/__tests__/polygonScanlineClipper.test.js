import { describe, expect, it } from 'vitest';
import { clipScanlineToRegion, generateParallelScanlineOrigins } from '../stitchGeneration/polygonScanlineClipper.js';

const rectangle = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
const hole = [{ x: 4, y: 3 }, { x: 6, y: 3 }, { x: 6, y: 7 }, { x: 4, y: 7 }];
const clip = overrides => clipScanlineToRegion({ outerPolygon: rectangle, holes: [], lineOrigin: { x: 0, y: 5 }, lineDirection: { x: 1, y: 0 }, tolerance: 1e-6, ...overrides });

describe('Phase 9 polygon scanline clipper', () => {
  it('clips a horizontal rectangle scanline', () => expect(clip().intervals).toHaveLength(1));
  it('returns rectangle endpoints', () => expect(clip().intervals[0]).toEqual(expect.objectContaining({ start: { x: 0, y: 5 }, end: { x: 10, y: 5 }, lengthMm: 10 })));
  it('labels outer boundaries', () => expect(clip().intervals[0]).toEqual(expect.objectContaining({ startBoundaryType: 'outer', endBoundaryType: 'outer' })));
  it('subtracts a hole', () => expect(clip({ holes: [hole] }).intervals).toHaveLength(2));
  it('labels hole boundaries', () => { const intervals = clip({ holes: [hole] }).intervals; expect(intervals[0].endBoundaryType).toBe('hole'); expect(intervals[1].startBoundaryType).toBe('hole'); });
  it('records hole indexes', () => { const intervals = clip({ holes: [hole] }).intervals; expect(intervals[0].endHoleIndex).toBe(0); expect(intervals[1].startHoleIndex).toBe(0); });
  it('subtracts multiple holes', () => { const second = hole.map(point => ({ x: point.x + 3, y: point.y })); expect(clip({ holes: [hole, second] }).intervals).toHaveLength(3); });
  it('supports rotated scanlines', () => { const result = clip({ lineOrigin: { x: 5, y: 5 }, lineDirection: { x: 1, y: 1 } }); expect(result.valid).toBe(true); expect(result.intervals[0].lengthMm).toBeCloseTo(Math.sqrt(200)); });
  it('supports concave polygons', () => { const polygon = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 8 }, { x: 0, y: 8 }]; expect(clip({ outerPolygon: polygon, lineOrigin: { x: 0, y: 5 } }).intervals[0].lengthMm).toBe(3); });
  it('returns no intervals outside a polygon', () => expect(clip({ lineOrigin: { x: 0, y: 20 } }).intervals).toEqual([]));
  it('handles vertex-aligned scanlines deterministically', () => expect(clip({ lineOrigin: { x: 0, y: 0 } })).toEqual(clip({ lineOrigin: { x: 0, y: 0 } })));
  it('does not mutate polygon input', () => { const before = JSON.stringify(rectangle); clip(); expect(JSON.stringify(rectangle)).toBe(before); });
  it('rejects invalid directions', () => expect(clip({ lineDirection: { x: 0, y: 0 } }).valid).toBe(false));
  it('rejects invalid polygons', () => expect(clip({ outerPolygon: [{ x: 0, y: 0 }] }).errors[0].code).toBe('INVALID_SCANLINE_CLIP_GEOMETRY'));
  it('generates evenly spaced parallel origins', () => { const result = generateParallelScanlineOrigins({ bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 }, angleDegrees: 0, spacingMm: 2, maximumScanlines: 100 }); expect(result.valid).toBe(true); expect(result.origins).toHaveLength(5); });
  it('blocks excessive scanline counts', () => expect(generateParallelScanlineOrigins({ bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 }, angleDegrees: 0, spacingMm: 1, maximumScanlines: 2 }).errors[0].code).toBe('PHYSICAL_GENERATION_LIMIT_EXCEEDED'));
});
