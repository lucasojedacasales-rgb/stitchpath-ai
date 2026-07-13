import { describe, expect, it } from 'vitest';
import {
  analyzeSemanticRegionRoles,
  createSemanticAnalysisDiagnostic,
  ingestV1RegionsToRegionGraphV2,
} from '../index.js';
import { createAmbiguousSemanticFixture } from '../fixtures/ambiguousSemanticFixture.js';
import { createHoleAwareRelationsFixture } from '../fixtures/holeAwareRelationsFixture.js';
import { createSemanticRolesFixture } from '../fixtures/semanticRolesFixture.js';

function diagnosticFor(source) {
  const ingestion = ingestV1RegionsToRegionGraphV2(source, { coordinateSpace: 'normalized' });
  const semantic = analyzeSemanticRegionRoles(ingestion.regions, ingestion.graph);
  return createSemanticAnalysisDiagnostic(ingestion.regions, ingestion.graph, semantic);
}

describe('Phase 3 semantic diagnostics', () => {
  it('reports role distribution and confidence counts', () => {
    const diagnostic = diagnosticFor(createSemanticRolesFixture());
    expect(diagnostic.valid).toBe(true);
    expect(diagnostic.regionCount).toBe(6);
    expect(diagnostic.assessmentCount).toBe(6);
    expect(diagnostic.roleDistribution).toMatchObject({
      primary_shape: 1,
      secondary_shape: 1,
      internal_feature: 1,
      dark_mark: 1,
      highlight: 1,
      negative_space: 1,
    });
  });

  it('counts invalid colors and review cases', () => {
    const diagnostic = diagnosticFor(createAmbiguousSemanticFixture());
    expect(diagnostic.invalidColorCount).toBe(1);
    expect(diagnostic.needsReviewCount).toBeGreaterThan(0);
    expect(diagnostic.unknownCount).toBeGreaterThan(0);
  });

  it('reports explicit holes and keeps inferredHoleCount zero', () => {
    const fixture = createHoleAwareRelationsFixture();
    const diagnostic = diagnosticFor([fixture.ring]);
    expect(diagnostic.explicitHoleCount).toBe(1);
    expect(diagnostic.inferredHoleCount).toBe(0);
  });

  it('reports regions excluded by explicit holes and parent corrections', () => {
    const fixture = createHoleAwareRelationsFixture();
    const diagnostic = diagnosticFor([fixture.ring, fixture.insideHole]);
    expect(diagnostic.regionsInsideExplicitHoles).toBe(1);
    expect(diagnostic.holeAwareParentCorrections).toBe(1);
  });

  it('reports no input mutations', () => {
    expect(diagnosticFor(createSemanticRolesFixture()).mutationsDetected).toBe(false);
  });
});
