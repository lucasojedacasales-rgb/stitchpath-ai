import { describe, expect, it } from 'vitest';
import { calculatePathBounds, calculateSubpathMetrics, distanceBetweenPoints, insertPointIntoPolyline, inverseRotatePoint, pointOnPolygonBoundary, pointsEqualWithinTolerance, polylineLength, projectPointToSegment, removeConsecutiveDuplicatePoints, resampleClosedPolyline, resampleOpenPolyline, rotatePoint, segmentCrossesHole, segmentInsideEffectiveRegion } from '../stitchGeneration/stitchGeometry.js';

const rectangle = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
const options = { targetStitchLengthMm: 2, minimumStitchLengthMm: 1, maximumStitchLengthMm: 3, tolerance: 1e-6 };

describe('Phase 9 stitch geometry', () => {
  it('calculates Euclidean distance', () => expect(distanceBetweenPoints({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5));
  it('compares points with tolerance', () => expect(pointsEqualWithinTolerance({ x: 0, y: 0 }, { x: 1e-7, y: 0 }, 1e-6)).toBe(true));
  it('removes consecutive duplicates', () => expect(removeConsecutiveDuplicatePoints([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }])).toHaveLength(2));
  it('preserves nonconsecutive repeated points', () => expect(removeConsecutiveDuplicatePoints([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }])).toHaveLength(3));
  it('calculates polyline length', () => expect(polylineLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 6, y: 4 }])).toBe(8));
  it('resamples open polylines', () => expect(resampleOpenPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }], options).points.length).toBe(6));
  it('preserves open endpoints', () => { const result = resampleOpenPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }], options).points; expect([result[0].x, result.at(-1).x]).toEqual([0, 10]); });
  it('preserves source corners', () => expect(resampleOpenPolyline([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], options).points.some(point => point.x === 5 && point.y === 0)).toBe(true));
  it('resamples closed polylines through closure', () => { const result = resampleClosedPolyline(rectangle, options).points; expect(pointsEqualWithinTolerance(result[0], result.at(-1))).toBe(true); });
  it('projects points onto segments', () => expect(projectPointToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }).point).toEqual({ x: 5, y: 0 }));
  it('inserts exact points into polylines', () => { const result = insertPointIntoPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }], { x: 4, y: 0 }, { maximumDistanceMm: 1e-6 }); expect(result.points[1]).toEqual({ x: 4, y: 0, sourceType: undefined }); });
  it('rejects off-path insertion', () => expect(insertPointIntoPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }], { x: 4, y: 2 }, { maximumDistanceMm: 0.1 }).valid).toBe(false));
  it('rotates points', () => { const point = rotatePoint({ x: 1, y: 0 }, { x: 0, y: 0 }, 90); expect(point.x).toBeCloseTo(0); expect(point.y).toBeCloseTo(1); });
  it('inverse rotation restores points', () => { const source = { x: 2, y: 3 }; expect(inverseRotatePoint(rotatePoint(source, { x: 1, y: 1 }, 37), { x: 1, y: 1 }, 37)).toEqual(expect.objectContaining({ x: expect.closeTo(2, 10), y: expect.closeTo(3, 10) })); });
  it('detects polygon boundary points', () => expect(pointOnPolygonBoundary({ x: 5, y: 0 }, rectangle)).toBe(true));
  it('rejects interior points as boundary', () => expect(pointOnPolygonBoundary({ x: 5, y: 5 }, rectangle)).toBe(false));
  it('detects safe effective-region segments', () => expect(segmentInsideEffectiveRegion({ x: 1, y: 1 }, { x: 9, y: 1 }, { geometry: rectangle, holes: [] })).toBe(true));
  it('detects segments crossing holes', () => expect(segmentCrossesHole({ x: 0, y: 5 }, { x: 10, y: 5 }, [[{ x: 4, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 6 }, { x: 4, y: 6 }]])).toBe(true));
  it('permits segments ending on hole boundaries from outside', () => expect(segmentCrossesHole({ x: 0, y: 5 }, { x: 4, y: 5 }, [[{ x: 4, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 6 }, { x: 4, y: 6 }]])).toBe(false));
  it('calculates path bounds', () => expect(calculatePathBounds(rectangle)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10, width: 10, height: 10 }));
  it('calculates subpath metrics', () => expect(calculateSubpathMetrics([{ x: 0, y: 0 }, { x: 3, y: 4 }])).toEqual(expect.objectContaining({ stitchCount: 1, lengthMm: 5, minimumStitchLengthMm: 5, maximumStitchLengthMm: 5 })));
  it('does not mutate resampled source', () => { const source = [{ x: 0, y: 0 }, { x: 10, y: 0 }]; const before = JSON.stringify(source); resampleOpenPolyline(source, options); expect(JSON.stringify(source)).toBe(before); });
});
