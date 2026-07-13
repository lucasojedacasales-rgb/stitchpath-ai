import { describe, expect, it } from 'vitest';
import {
  canonicalizeHoles,
  canonicalizePolygon,
  polygonArea,
  polygonBounds,
  polygonCentroid,
  polygonSignedArea,
} from '../index.js';

const normalized = { coordinateSpace: 'normalized' };

describe('Phase 2 geometry canonicalization', () => {
  it('normalizes outer polygons counter-clockwise', () => {
    const result = canonicalizePolygon([[0, 0], [0, 1], [1, 1], [1, 0]], normalized);
    expect(result.valid).toBe(true);
    expect(polygonSignedArea(result.polygon)).toBeGreaterThan(0);
  });

  it('normalizes holes clockwise', () => {
    const result = canonicalizeHoles([[[0, 0], [1, 0], [1, 1], [0, 1]]], normalized);
    expect(result.valid).toBe(true);
    expect(polygonSignedArea(result.holes[0])).toBeLessThan(0);
  });

  it('removes a duplicate closing point and leaves the polygon open', () => {
    const result = canonicalizePolygon([[0, 0], [1, 0], [1, 1], [0, 0]], normalized);
    expect(result.valid).toBe(true);
    expect(result.polygon).toHaveLength(3);
    expect(result.metadata.closingPointRemoved).toBe(true);
    expect(result.polygon.at(-1)).not.toEqual(result.polygon[0]);
  });

  it('removes consecutive duplicate points', () => {
    const result = canonicalizePolygon([[0, 0], [1, 0], [1, 0], [1, 1], [0, 1]], normalized);
    expect(result.valid).toBe(true);
    expect(result.polygon).toHaveLength(4);
    expect(result.metadata.consecutiveDuplicatesRemoved).toBe(1);
  });

  it('does not mutate source geometry', () => {
    const source = [[0, 0], [0, 1], [1, 1], [1, 0]];
    const before = structuredClone(source);
    canonicalizePolygon(source, normalized);
    expect(source).toEqual(before);
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('rejects %s coordinates', (_, invalid) => {
    const result = canonicalizePolygon([[0, 0], [invalid, 0], [0, 1]], normalized);
    expect(result.valid).toBe(false);
    expect(result.errors.some(item => item.code === 'NON_FINITE_COORDINATE')).toBe(true);
  });

  it('rejects obvious self-intersection', () => {
    const result = canonicalizePolygon([[0.1, 0.1], [0.9, 0.9], [0.1, 0.9], [0.9, 0.1]], normalized);
    expect(result.valid).toBe(false);
    expect(result.errors.some(item => item.code === 'SELF_INTERSECTION')).toBe(true);
  });

  it('rejects degenerate area', () => {
    const result = canonicalizePolygon([[0, 0], [0.5, 0], [1, 0]], normalized);
    expect(result.errors.some(item => item.code === 'DEGENERATE_POLYGON')).toBe(true);
  });

  it('rejects out-of-range normalized coordinates by default', () => {
    const result = canonicalizePolygon([[0, 0], [1.2, 0], [0, 1]], normalized);
    expect(result.valid).toBe(false);
    expect(result.polygon[1].x).toBe(1.2);
    expect(result.errors.some(item => item.code === 'COORDINATE_OUT_OF_RANGE')).toBe(true);
  });

  it('clamps only when explicitly requested', () => {
    const result = canonicalizePolygon([[0, 0], [1.2, 0], [0, 1]], { ...normalized, clampOutOfRange: true });
    expect(result.valid).toBe(true);
    expect(result.polygon.some(point => point.x === 1)).toBe(true);
  });

  it('converts pixel coordinates with explicit source dimensions', () => {
    const result = canonicalizePolygon([[10, 10], [90, 10], [90, 90]], { coordinateSpace: 'pixel', sourceWidth: 100, sourceHeight: 100 });
    expect(result.valid).toBe(true);
    expect(result.polygon[0]).toEqual({ x: 0.1, y: 0.1 });
  });

  it('converts millimeter coordinates with explicit design dimensions', () => {
    const result = canonicalizePolygon([[5, 5], [45, 5], [45, 95]], { coordinateSpace: 'millimeter', designWidthMm: 50, designHeightMm: 100 });
    expect(result.valid).toBe(true);
    expect(result.polygon[0]).toEqual({ x: 0.1, y: 0.05 });
  });

  it.each([
    ['pixel', { coordinateSpace: 'pixel' }, 'MISSING_SOURCE_DIMENSIONS'],
    ['millimeter', { coordinateSpace: 'millimeter' }, 'MISSING_DESIGN_DIMENSIONS'],
  ])('rejects %s coordinates without dimensions', (_, options, code) => {
    const result = canonicalizePolygon([[0, 0], [1, 0], [0, 1]], options);
    expect(result.errors.some(item => item.code === code)).toBe(true);
  });

  it('computes stable area, bounds, and centroid', () => {
    const polygon = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    expect(polygonArea(polygon)).toBe(1);
    expect(polygonBounds(polygon)).toMatchObject({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
    expect(polygonCentroid(polygon)).toEqual({ x: 0.5, y: 0.5 });
  });
});
