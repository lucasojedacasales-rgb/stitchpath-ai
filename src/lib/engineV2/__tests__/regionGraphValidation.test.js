import { describe, expect, it } from 'vitest';
import { ingestV1RegionsToRegionGraphV2, validateRegionGraphV2 } from '../index.js';
import { createNestedRegionsFixture } from '../fixtures/nestedRegionsFixture.js';

const makeResult = () => ingestV1RegionsToRegionGraphV2(createNestedRegionsFixture(), { coordinateSpace: 'normalized' });

describe('Phase 2 RegionGraphV2 validation', () => {
  it('validates a correctly built graph', () => {
    const result = makeResult();
    expect(validateRegionGraphV2(result.graph, result.regions).valid).toBe(true);
  });

  it('detects graph references to unknown regions', () => {
    const result = makeResult();
    const graph = structuredClone(result.graph);
    graph.regionIds.push('missing');
    expect(validateRegionGraphV2(graph, result.regions).errors.some(item => item.code === 'UNKNOWN_GRAPH_REGION')).toBe(true);
  });

  it('detects extra nodes and unknown component references', () => {
    const result = makeResult();
    const graph = structuredClone(result.graph);
    graph.nodes.missing = { ...structuredClone(graph.nodes.body), regionId: 'missing' };
    graph.nodes.body.disconnectedComponentId = 'missing-component';
    const errors = validateRegionGraphV2(graph, result.regions).errors;
    expect(errors.some(item => item.code === 'UNKNOWN_GRAPH_NODE')).toBe(true);
    expect(errors.some(item => item.code === 'UNKNOWN_COMPONENT_ID')).toBe(true);
  });

  it('detects circular parent relationships', () => {
    const result = makeResult();
    const graph = structuredClone(result.graph);
    graph.nodes.body.parentId = 'eye';
    graph.nodes.eye.childIds = ['body'];
    expect(validateRegionGraphV2(graph, result.regions).errors.some(item => item.code === 'CIRCULAR_PARENT_RELATION')).toBe(true);
  });

  it('detects invalid root declarations', () => {
    const result = makeResult();
    const graph = structuredClone(result.graph);
    graph.rootIds = ['eye'];
    expect(validateRegionGraphV2(graph, result.regions).errors.some(item => item.code === 'INVALID_ROOT_IDS')).toBe(true);
  });
});
