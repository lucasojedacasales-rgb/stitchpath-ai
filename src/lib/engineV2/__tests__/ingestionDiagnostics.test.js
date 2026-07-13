import { describe, expect, it } from 'vitest';
import {
  createRegionIngestionDiagnostic,
  ingestV1RegionsToRegionGraphV2,
} from '../index.js';
import { createDisconnectedSameColorFixture } from '../fixtures/disconnectedSameColorFixture.js';
import { createExplicitHoleFixture } from '../fixtures/explicitHoleFixture.js';
import { createInvalidRegionsFixture } from '../fixtures/invalidRegionsFixture.js';
import { createMascotStructureFixture } from '../fixtures/mascotStructureFixture.js';
import { createThreeLevelNestingFixture } from '../fixtures/nestedRegionsFixture.js';
import { createEqualGeometryFixture } from '../fixtures/overlappingRegionsFixture.js';

const options = { coordinateSpace: 'normalized' };
const diagnosticFor = regions => {
  const result = ingestV1RegionsToRegionGraphV2(regions, options);
  return createRegionIngestionDiagnostic(result, result.graph);
};

describe('Phase 2 ingestion diagnostics', () => {
  it('counts rejected IDs and invalid geometry independently', () => {
    const invalid = createInvalidRegionsFixture();
    const diagnostic = diagnosticFor([
      ...invalid.duplicateIds,
      ...invalid.missingId,
      ...invalid.selfIntersecting,
      ...invalid.outOfRange,
    ]);
    expect(diagnostic.sourceRegionCount).toBe(5);
    expect(diagnostic.duplicateIdCount).toBe(1);
    expect(diagnostic.missingIdCount).toBe(1);
    expect(diagnostic.selfIntersectionCount).toBe(1);
    expect(diagnostic.outOfRangeCoordinateCount).toBe(1);
  });

  it('reports nesting depth and containment', () => {
    const diagnostic = diagnosticFor(createThreeLevelNestingFixture());
    expect(diagnostic.rootRegionCount).toBe(1);
    expect(diagnostic.nestedRegionCount).toBe(2);
    expect(diagnostic.maximumNestingDepth).toBe(2);
    expect(diagnostic.containmentEdgeCount).toBe(3);
  });

  it('counts disconnected same-color regions', () => {
    const diagnostic = diagnosticFor(createDisconnectedSameColorFixture());
    expect(diagnostic.disconnectedComponentCount).toBe(2);
    expect(diagnostic.disconnectedSameColorRegionCount).toBe(2);
  });

  it('counts explicit holes while inferred holes remain zero', () => {
    const diagnostic = diagnosticFor(createExplicitHoleFixture());
    expect(diagnostic.explicitHoleCount).toBe(1);
    expect(diagnostic.inferredHoleCount).toBe(0);
  });

  it('reports equal geometry candidates', () => {
    expect(diagnosticFor(createEqualGeometryFixture()).equalGeometryCandidateCount).toBe(1);
  });

  it('processes the generic mascot fixture without source mutation', () => {
    const source = createMascotStructureFixture();
    const before = structuredClone(source);
    const result = ingestV1RegionsToRegionGraphV2(source, options);
    const diagnostic = createRegionIngestionDiagnostic(result, result.graph);
    expect(diagnostic.acceptedRegionCount).toBe(source.length);
    expect(diagnostic.mutationsDetected).toBe(false);
    expect(source).toEqual(before);
  });
});
