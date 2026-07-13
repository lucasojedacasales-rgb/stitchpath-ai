import { describe, expect, it } from 'vitest';
import { analyzeEmbroideryObjectGeometry } from '../index.js';
import { createSatinTechnicalFixture } from '../fixtures/satinTechnicalFixture.js';
import { createTatamiTechnicalFixture } from '../fixtures/tatamiTechnicalFixture.js';

describe('Phase 7 object geometry metrics', () => {
  it('computes polygon area in square millimetres', () => expect(analyzeEmbroideryObjectGeometry(createTatamiTechnicalFixture().valid).outerAreaMm2).toBe(200));
  it('subtracts explicit hole area', () => { const metrics = analyzeEmbroideryObjectGeometry(createTatamiTechnicalFixture().withHole); expect(metrics.holeAreaMm2).toBe(24); expect(metrics.effectiveAreaMm2).toBe(176); });
  it('computes closed perimeter', () => expect(analyzeEmbroideryObjectGeometry(createTatamiTechnicalFixture().valid).perimeterMm).toBe(60));
  it('computes deterministic bounds', () => expect(analyzeEmbroideryObjectGeometry(createTatamiTechnicalFixture().valid).bounds).toEqual({ minX: 0, minY: 0, maxX: 20, maxY: 10, width: 20, height: 10 }));
  it('computes polygon centroid', () => expect(analyzeEmbroideryObjectGeometry(createTatamiTechnicalFixture().valid).centroid).toEqual({ x: 10, y: 5 }));
  it('finds an interior point outside holes', () => { const fixture = createTatamiTechnicalFixture(); const point = analyzeEmbroideryObjectGeometry(fixture.withHole).validInteriorPoint; expect(point).not.toEqual({ x: 10, y: 5 }); expect(point).toBeTruthy(); });
  it('computes a stable principal axis', () => expect(analyzeEmbroideryObjectGeometry(createSatinTechnicalFixture().valid).principalAxisDegrees).toBeCloseTo(0, 8));
  it('labels deterministic width estimates', () => expect(analyzeEmbroideryObjectGeometry(createSatinTechnicalFixture().valid)).toMatchObject({ estimatedMinimumWidthMm: 3, estimatedMedianWidthMm: 3, estimatedMaximumWidthMm: 3 }));
  it('detects tapered width variation', () => expect(analyzeEmbroideryObjectGeometry(createSatinTechnicalFixture().variable).widthVariationRatio).toBeGreaterThan(2.5));
  it('is independent of polygon orientation', () => { const object = createTatamiTechnicalFixture().valid; const reversed = { ...object, geometry: [...object.geometry].reverse() }; const left = analyzeEmbroideryObjectGeometry(object); const right = analyzeEmbroideryObjectGeometry(reversed); expect([right.effectiveAreaMm2, right.perimeterMm, right.principalAxisDegrees]).toEqual([left.effectiveAreaMm2, left.perimeterMm, left.principalAxisDegrees]); });
  it('reports degenerate geometry', () => expect(analyzeEmbroideryObjectGeometry(createTatamiTechnicalFixture().degenerate).geometryValid).toBe(false));
  it('reports non-finite points', () => { const object = { ...createTatamiTechnicalFixture().valid, geometry: [{ x: NaN, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] }; expect(analyzeEmbroideryObjectGeometry(object).nonFinitePointCount).toBe(1); });
  it('counts duplicate closing points', () => { const object = createTatamiTechnicalFixture().valid; const closed = { ...object, geometry: [...object.geometry, object.geometry[0]] }; expect(analyzeEmbroideryObjectGeometry(closed).duplicatePointCount).toBe(1); });
  it('does not mutate geometry or holes', () => { const object = createTatamiTechnicalFixture().withHole; const before = structuredClone(object); analyzeEmbroideryObjectGeometry(object); expect(object).toEqual(before); });
  it('recognizes closed region geometry', () => expect(analyzeEmbroideryObjectGeometry(createTatamiTechnicalFixture().valid).isClosedGeometry).toBe(true));
  it('reports explicit holes', () => expect(analyzeEmbroideryObjectGeometry(createTatamiTechnicalFixture().withHole)).toMatchObject({ hasHoles: true, holeCount: 1 }));
  it('classifies tiny regions as small', () => expect(analyzeEmbroideryObjectGeometry(createTatamiTechnicalFixture().tiny).isSmall).toBe(true));
  it('returns deterministic repeated analysis', () => { const object = createSatinTechnicalFixture().variable; expect(analyzeEmbroideryObjectGeometry(object)).toEqual(analyzeEmbroideryObjectGeometry(object)); });
});
