import { describe, expect, it } from 'vitest';
import {
  analyzeRegionRelation,
  getConnectedComponent,
  getRegionAncestors,
  getRegionDescendants,
  ingestV1RegionsToRegionGraphV2,
} from '../index.js';
import { createDisconnectedSameColorFixture } from '../fixtures/disconnectedSameColorFixture.js';
import { createNestedRegionsFixture, createThreeLevelNestingFixture } from '../fixtures/nestedRegionsFixture.js';
import { createEqualGeometryFixture, createOverlappingRegionsFixture } from '../fixtures/overlappingRegionsFixture.js';
import { createSimpleRegionsFixture, createTouchingRegionsFixture } from '../fixtures/simpleRegionsFixture.js';

const options = { coordinateSpace: 'normalized' };
const ingest = regions => ingestV1RegionsToRegionGraphV2(regions, options);

describe('Phase 2 RegionGraphV2', () => {
  it('is deterministic regardless of input order', () => {
    const source = createThreeLevelNestingFixture();
    expect(ingest(source).graph).toEqual(ingest([...source].reverse()).graph);
  });

  it('selects the smallest containing region as parent', () => {
    const graph = ingest(createThreeLevelNestingFixture()).graph;
    expect(graph.nodes.inner.parentId).toBe('middle');
    expect(graph.nodes.middle.parentId).toBe('outer');
  });

  it('supports three-level nesting queries', () => {
    const graph = ingest(createThreeLevelNestingFixture()).graph;
    expect(getRegionAncestors(graph, 'inner')).toEqual(['middle', 'outer']);
    expect(getRegionDescendants(graph, 'outer')).toEqual(['middle', 'inner']);
  });

  it('keeps parent relationships acyclic', () => {
    const graph = ingest(createThreeLevelNestingFixture()).graph;
    for (const id of graph.regionIds) expect(getRegionAncestors(graph, id)).not.toContain(id);
  });

  it('detects partial overlap and preserves both regions', () => {
    const result = ingest(createOverlappingRegionsFixture());
    expect(result.regions).toHaveLength(2);
    expect(result.graph.edges.some(edge => edge.relation === 'overlaps')).toBe(true);
    expect(result.graph.nodes['overlap-a'].overlappingRegionIds).toContain('overlap-b');
  });

  it('detects touching boundaries without treating them as overlap', () => {
    const graph = ingest(createTouchingRegionsFixture()).graph;
    expect(graph.edges.some(edge => edge.relation === 'touches')).toBe(true);
    expect(graph.edges.some(edge => edge.relation === 'overlaps')).toBe(false);
  });

  it('keeps disjoint regions in separate components', () => {
    const graph = ingest(createSimpleRegionsFixture()).graph;
    expect(graph.componentIds).toHaveLength(2);
    expect(getConnectedComponent(graph, 'left')).toEqual(['left']);
  });

  it('keeps disconnected same-color regions separate', () => {
    const result = ingest(createDisconnectedSameColorFixture());
    expect(result.regions).toHaveLength(2);
    expect(result.graph.componentIds).toHaveLength(2);
    expect(result.regions[0].visualColor).toBe(result.regions[1].visualColor);
  });

  it('reports equal geometry candidates without deleting regions', () => {
    const result = ingest(createEqualGeometryFixture());
    expect(result.regions).toHaveLength(2);
    expect(result.graph.metadata.equalGeometryCandidates).toEqual([['equal-a', 'equal-b']]);
  });

  it('classifies contains and inside as inverse pair relations', () => {
    const result = ingest(createNestedRegionsFixture());
    const [body, eye] = result.regions;
    expect(analyzeRegionRelation(body, eye)).toBe('contains');
    expect(analyzeRegionRelation(eye, body)).toBe('inside');
  });

  it('detects graph roots from direct parents', () => {
    const graph = ingest(createThreeLevelNestingFixture()).graph;
    expect(graph.rootIds).toEqual(['outer']);
    expect(graph.nodes.outer.childIds).toEqual(['middle']);
  });
});
