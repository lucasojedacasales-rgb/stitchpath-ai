import { describe, expect, it } from 'vitest';
import { ingestV1RegionsToRegionGraphV2 } from '../index.js';
import { createHoleAwareRelationsFixture } from '../fixtures/holeAwareRelationsFixture.js';

const options = { coordinateSpace: 'normalized' };

describe('Phase 3 hole-aware RegionGraphV2', () => {
  it('does not assign a hole container as parent', () => {
    const fixture = createHoleAwareRelationsFixture();
    const result = ingestV1RegionsToRegionGraphV2([fixture.ring, fixture.insideHole], options);
    expect(result.graph.nodes['inside-hole'].parentId).toBeNull();
    expect(result.graph.metadata.holeAwareParentCorrections).toBe(1);
  });

  it('still assigns a parent in solid region area', () => {
    const fixture = createHoleAwareRelationsFixture();
    const result = ingestV1RegionsToRegionGraphV2([fixture.ring, fixture.solidChild], options);
    expect(result.graph.nodes['solid-child'].parentId).toBe('ring');
  });

  it('records crossing regions as overlaps rather than children', () => {
    const fixture = createHoleAwareRelationsFixture();
    const result = ingestV1RegionsToRegionGraphV2([fixture.ring, fixture.crossingHole], options);
    expect(result.graph.nodes['crossing-hole'].parentId).toBeNull();
    expect(result.graph.edges.some(edge => edge.relation === 'overlaps')).toBe(true);
  });

  it('remains deterministic after hole-aware updates', () => {
    const fixture = createHoleAwareRelationsFixture();
    const regions = [fixture.ring, fixture.solidChild, fixture.insideHole, fixture.crossingHole];
    const first = ingestV1RegionsToRegionGraphV2(regions, options).graph;
    const second = ingestV1RegionsToRegionGraphV2([...regions].reverse(), options).graph;
    expect(first).toEqual(second);
  });

  it('never infers holes', () => {
    const fixture = createHoleAwareRelationsFixture();
    const graph = ingestV1RegionsToRegionGraphV2([fixture.ring, fixture.insideHole], options).graph;
    expect(graph.metadata.inferredHoleCount).toBe(0);
  });
});
