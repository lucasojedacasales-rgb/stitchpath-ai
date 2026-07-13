import { describe, expect, it } from 'vitest';
import { analyzeRegionGeometryFeatures, ingestV1RegionsToRegionGraphV2 } from '../index.js';
import { createHoleAwareRelationsFixture } from '../fixtures/holeAwareRelationsFixture.js';
import { createThreeLevelNestingFixture } from '../fixtures/nestedRegionsFixture.js';

const options = { coordinateSpace: 'normalized' };

describe('Phase 3 semantic geometry features', () => {
  it('uses effective area and reports explicit holes', () => {
    const result = ingestV1RegionsToRegionGraphV2([createHoleAwareRelationsFixture().ring], options);
    const features = analyzeRegionGeometryFeatures(result.regions[0], result.graph);
    expect(features.outerArea).toBeCloseTo(0.64, 8);
    expect(features.holeArea).toBeCloseTo(0.09, 8);
    expect(features.effectiveArea).toBeCloseTo(0.55, 8);
    expect(features.hasExplicitHoles).toBe(true);
  });

  it('reports graph child and containment counts', () => {
    const result = ingestV1RegionsToRegionGraphV2(createThreeLevelNestingFixture(), options);
    const outer = analyzeRegionGeometryFeatures(result.regions.find(item => item.id === 'outer'), result.graph);
    expect(outer.childCount).toBe(1);
    expect(outer.containsCount).toBe(2);
  });

  it('reports nesting depth', () => {
    const result = ingestV1RegionsToRegionGraphV2(createThreeLevelNestingFixture(), options);
    expect(analyzeRegionGeometryFeatures(result.regions.find(item => item.id === 'inner'), result.graph).nestingDepth).toBe(2);
  });

  it('counts touched design boundaries', () => {
    const result = ingestV1RegionsToRegionGraphV2([{ id: 'full', path_points: [[0, 0], [1, 0], [1, 1], [0, 1]] }], options);
    expect(analyzeRegionGeometryFeatures(result.regions[0], result.graph).touchesDesignBoundaryCount).toBe(4);
  });

  it('detects thin and small geometry', () => {
    const result = ingestV1RegionsToRegionGraphV2([{ id: 'thin', path_points: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.105], [0.1, 0.105]] }], options);
    const features = analyzeRegionGeometryFeatures(result.regions[0], result.graph);
    expect(features.isThin).toBe(true);
    expect(features.isSmall).toBe(true);
  });

  it('does not mutate region or graph input', () => {
    const result = ingestV1RegionsToRegionGraphV2(createThreeLevelNestingFixture(), options);
    const beforeRegion = structuredClone(result.regions[0]);
    const beforeGraph = structuredClone(result.graph);
    analyzeRegionGeometryFeatures(result.regions[0], result.graph);
    expect(result.regions[0]).toEqual(beforeRegion);
    expect(result.graph).toEqual(beforeGraph);
  });
});
