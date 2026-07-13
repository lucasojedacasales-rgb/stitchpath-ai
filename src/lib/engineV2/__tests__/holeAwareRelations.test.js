import { describe, expect, it } from 'vitest';
import {
  analyzeRegionRelation,
  analyzeRegionRelationDetailed,
  ingestV1RegionsToRegionGraphV2,
  isPointInRegionArea,
  regionAreaWithHoles,
  regionContainsRegionArea,
  regionInsideExplicitHole,
  regionsOverlapArea,
  regionsTouchArea,
} from '../index.js';
import {
  createDifferentHoleGeometryFixture,
  createEqualHoleGeometryFixture,
  createHoleAwareRelationsFixture,
} from '../fixtures/holeAwareRelationsFixture.js';

const options = { coordinateSpace: 'normalized' };
const ingest = regions => ingestV1RegionsToRegionGraphV2(regions, options).regions;

describe('Phase 3 hole-aware region relations', () => {
  it('includes points in solid outer area', () => {
    const [ring] = ingest([createHoleAwareRelationsFixture().ring]);
    expect(isPointInRegionArea({ x: 0.2, y: 0.2 }, ring)).toBe(true);
  });

  it('excludes points inside explicit holes', () => {
    const [ring] = ingest([createHoleAwareRelationsFixture().ring]);
    expect(isPointInRegionArea({ x: 0.5, y: 0.5 }, ring)).toBe(false);
  });

  it('subtracts explicit hole area', () => {
    const [ring] = ingest([createHoleAwareRelationsFixture().ring]);
    expect(regionAreaWithHoles(ring)).toBeCloseTo(0.55, 8);
  });

  it('contains a child in solid area but excludes a child inside a hole', () => {
    const fixture = createHoleAwareRelationsFixture();
    const [ring, solid, inside] = ingest([fixture.ring, fixture.solidChild, fixture.insideHole]);
    expect(regionContainsRegionArea(ring, solid)).toBe(true);
    expect(regionContainsRegionArea(ring, inside)).toBe(false);
    expect(regionInsideExplicitHole(inside, ring)).toBe(true);
    expect(analyzeRegionRelationDetailed(ring, inside)).toMatchObject({ relation: 'disjoint', excludedByExplicitHole: true, explicitHoleIdOrIndex: 0 });
  });

  it('detects a region touching an explicit hole boundary', () => {
    const fixture = createHoleAwareRelationsFixture();
    const [ring, touching] = ingest([fixture.ring, fixture.touchingHole]);
    expect(regionsTouchArea(ring, touching)).toBe(true);
    expect(analyzeRegionRelation(ring, touching)).toBe('touches');
  });

  it('detects overlap across an explicit hole boundary', () => {
    const fixture = createHoleAwareRelationsFixture();
    const [ring, crossing] = ingest([fixture.ring, fixture.crossingHole]);
    expect(regionsOverlapArea(ring, crossing)).toBe(true);
    expect(analyzeRegionRelation(ring, crossing)).toBe('overlaps');
  });

  it('requires equal outer geometry and equal holes', () => {
    const equal = ingest(createEqualHoleGeometryFixture());
    const different = ingest(createDifferentHoleGeometryFixture());
    expect(analyzeRegionRelation(equal[0], equal[1])).toBe('equal_geometry');
    expect(analyzeRegionRelation(different[0], different[1])).not.toBe('equal_geometry');
  });

  it('preserves no-hole Phase 2 containment behavior', () => {
    const [parent, child] = ingest([
      { id: 'parent', path_points: [[0, 0], [1, 0], [1, 1], [0, 1]] },
      { id: 'child', path_points: [[0.2, 0.2], [0.4, 0.2], [0.4, 0.4], [0.2, 0.4]] },
    ]);
    expect(analyzeRegionRelation(parent, child)).toBe('contains');
  });

  it('keeps canonical orientations and source inputs immutable', () => {
    const source = createHoleAwareRelationsFixture().ring;
    const before = structuredClone(source);
    const [ring] = ingest([source]);
    expect(ring.geometry).not.toEqual(ring.holes[0]);
    expect(source).toEqual(before);
  });
});
