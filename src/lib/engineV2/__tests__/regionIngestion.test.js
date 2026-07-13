import { describe, expect, it } from 'vitest';
import { ingestV1RegionsToRegionGraphV2 } from '../index.js';
import { createExplicitHoleFixture } from '../fixtures/explicitHoleFixture.js';
import { createSimpleRegionsFixture } from '../fixtures/simpleRegionsFixture.js';
import { createNestedRegionsFixture } from '../fixtures/nestedRegionsFixture.js';

const options = { coordinateSpace: 'normalized' };

describe('Phase 2 region ingestion boundary', () => {
  it('ingests valid regions and builds a graph', () => {
    const result = ingestV1RegionsToRegionGraphV2(createSimpleRegionsFixture(), options);
    expect(result.valid).toBe(true);
    expect(result.acceptedCount).toBe(2);
    expect(result.graph.regionIds).toEqual(['left', 'right']);
    expect(result.graphValidation.valid).toBe(true);
  });

  it('requires explicit coordinate-space metadata', () => {
    const result = ingestV1RegionsToRegionGraphV2(createSimpleRegionsFixture());
    expect(result.acceptedCount).toBe(0);
    expect(result.rejected[0].errors.some(item => item.code === 'COORDINATE_SPACE_REQUIRED')).toBe(true);
  });

  it('preserves explicit holes but never infers holes from nesting', () => {
    const explicit = ingestV1RegionsToRegionGraphV2(createExplicitHoleFixture(), options);
    const nested = ingestV1RegionsToRegionGraphV2(createNestedRegionsFixture(), options);
    expect(explicit.regions[0].holes).toHaveLength(1);
    expect(nested.regions.every(region => region.holes.length === 0)).toBe(true);
    expect(nested.graph.metadata.inferredHoleCount).toBe(0);
  });

  it('does not mutate the source region array', () => {
    const source = createNestedRegionsFixture();
    const before = structuredClone(source);
    const result = ingestV1RegionsToRegionGraphV2(source, options);
    expect(result.mutationsDetected).toBe(false);
    expect(source).toEqual(before);
  });
});
