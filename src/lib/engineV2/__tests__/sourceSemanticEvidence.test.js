import { describe, expect, it } from 'vitest';
import { analyzeSourceSemanticEvidence, ingestV1RegionsToRegionGraphV2 } from '../index.js';
import { createAmbiguousSemanticFixture, createNestedWithoutNegativeEvidenceFixture } from '../fixtures/ambiguousSemanticFixture.js';
import { createSemanticRolesFixture } from '../fixtures/semanticRolesFixture.js';

const ingest = regions => ingestV1RegionsToRegionGraphV2(regions, { coordinateSpace: 'normalized' }).regions;

describe('Phase 3 controlled source semantic evidence', () => {
  it('recognizes controlled source labels', () => {
    const body = ingest(createSemanticRolesFixture()).find(item => item.id === 'body');
    const evidence = analyzeSourceSemanticEvidence(body);
    expect(evidence.trustedRoleCandidate).toBe('primary_shape');
    expect(evidence.semanticTags).toContain('body');
  });

  it('does not use arbitrary substring matches', () => {
    const result = analyzeSourceSemanticEvidence({ semanticRole: 'somebody', source: { name: 'backgrounder' } });
    expect(result.trustedRoleCandidate).toBeNull();
    expect(result.semanticTags).toEqual([]);
  });

  it('detects conflicting controlled labels', () => {
    const region = ingest(createAmbiguousSemanticFixture()).find(item => item.id === 'conflicting');
    const evidence = analyzeSourceSemanticEvidence(region);
    expect(evidence.trustedRoleCandidate).toBeNull();
    expect(evidence.conflicts.length).toBeGreaterThan(0);
  });

  it('treats explicit negative-space flags as strong evidence', () => {
    const region = ingest(createSemanticRolesFixture()).find(item => item.id === 'negative-space');
    const evidence = analyzeSourceSemanticEvidence(region);
    expect(evidence.trustedRoleCandidate).toBe('negative_space');
    expect(evidence.evidence.some(item => item.code === 'EXPLICIT_NEGATIVE_SPACE')).toBe(true);
  });

  it('does not infer negative space from nesting', () => {
    const region = ingest(createNestedWithoutNegativeEvidenceFixture()).find(item => item.id === 'nested-unknown');
    expect(analyzeSourceSemanticEvidence(region).trustedRoleCandidate).not.toBe('negative_space');
  });

  it('does not map V1 embroidery words to semantic roles', () => {
    const evidence = analyzeSourceSemanticEvidence({ semanticRole: 'unknown', source: { name: 'outline contour satin fill running' } });
    expect(evidence.semanticTags).toEqual([]);
    expect(evidence.trustedRoleCandidate).toBeNull();
  });

  it('preserves exact source values in the evidence result', () => {
    const source = { semanticRole: 'face', source: { name: 'Face', objectGroup: 'Head Group' } };
    const evidence = analyzeSourceSemanticEvidence(source);
    expect(evidence.exactSourceValues).toContain('face');
    expect(evidence.exactSourceValues).toContain('Face');
  });
});
