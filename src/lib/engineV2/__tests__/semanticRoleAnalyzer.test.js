import { describe, expect, it } from 'vitest';
import {
  analyzeSemanticRegionRoles,
  createSemanticRegionAssessmentV2,
  ingestV1RegionsToRegionGraphV2,
} from '../index.js';
import { createAmbiguousSemanticFixture, createNestedWithoutNegativeEvidenceFixture } from '../fixtures/ambiguousSemanticFixture.js';
import { createBackgroundFixture, createLargeBodyWithoutBackgroundFixture } from '../fixtures/backgroundFixture.js';
import { createDarkMarksFixture } from '../fixtures/darkMarksFixture.js';
import { createSemanticRolesFixture } from '../fixtures/semanticRolesFixture.js';

function analyze(source, options = {}) {
  const ingestion = ingestV1RegionsToRegionGraphV2(source, { coordinateSpace: 'normalized' });
  return { ingestion, semantic: analyzeSemanticRegionRoles(ingestion.regions, ingestion.graph, options) };
}

describe('Phase 3 semantic role analyzer', () => {
  it('classifies an explicit background', () => {
    const { semantic } = analyze(createBackgroundFixture());
    expect(semantic.byRegionId.background.semanticRole).toBe('background');
  });

  it('does not classify a large character body as background', () => {
    const { semantic } = analyze(createLargeBodyWithoutBackgroundFixture());
    expect(semantic.byRegionId['large-body'].semanticRole).toBe('primary_shape');
  });

  it('classifies primary, secondary, and internal artwork structures', () => {
    const { semantic } = analyze(createSemanticRolesFixture());
    expect(semantic.byRegionId.body.semanticRole).toBe('primary_shape');
    expect(semantic.byRegionId.face.semanticRole).toBe('secondary_shape');
    expect(semantic.byRegionId.eye.semanticRole).toBe('internal_feature');
  });

  it('classifies a dark mouth as dark_mark evidence, not an outline', () => {
    const { semantic } = analyze(createDarkMarksFixture());
    expect(semantic.byRegionId['dark-mouth'].semanticRole).toBe('dark_mark');
    expect(semantic.byRegionId['dark-mouth']).not.toHaveProperty('contour');
  });

  it('does not force an external dark color into high-confidence dark_mark', () => {
    const { semantic } = analyze(createDarkMarksFixture());
    const assessment = semantic.byRegionId['dark-external'];
    expect(assessment.semanticRole).toBe('unknown');
    expect(assessment.needsReview).toBe(true);
  });

  it('classifies an explicit highlight', () => {
    const { semantic } = analyze(createSemanticRolesFixture());
    expect(semantic.byRegionId.highlight.semanticRole).toBe('highlight');
  });

  it('classifies negative space only from explicit evidence', () => {
    const explicit = analyze(createSemanticRolesFixture()).semantic;
    const nested = analyze(createNestedWithoutNegativeEvidenceFixture()).semantic;
    expect(explicit.byRegionId['negative-space'].semanticRole).toBe('negative_space');
    expect(nested.byRegionId['nested-unknown'].semanticRole).not.toBe('negative_space');
  });

  it('prefers unknown for weak or conflicting evidence', () => {
    const { semantic } = analyze(createAmbiguousSemanticFixture());
    expect(semantic.byRegionId.conflicting.semanticRole).toBe('unknown');
    expect(semantic.byRegionId['unknown-low-confidence'].semanticRole).toBe('unknown');
  });

  it('produces deterministic scores and ordered alternatives', () => {
    const first = analyze(createSemanticRolesFixture()).semantic;
    const second = analyze(createSemanticRolesFixture()).semantic;
    expect(first).toEqual(second);
    expect(first.byRegionId.body.alternatives).toHaveLength(2);
    expect(first.byRegionId.body.alternatives[0].score).toBeGreaterThanOrEqual(first.byRegionId.body.alternatives[1].score);
  });

  it('honors confidence thresholds', () => {
    const { semantic } = analyze(createSemanticRolesFixture(), { minimumAcceptedConfidence: 0.95, minimumHighConfidence: 0.98 });
    expect(semantic.byRegionId.body.semanticRole).toBe('unknown');
    expect(semantic.byRegionId.body.needsReview).toBe(true);
  });

  it('does not mutate source RegionV2 inputs', () => {
    const ingestion = ingestV1RegionsToRegionGraphV2(createSemanticRolesFixture(), { coordinateSpace: 'normalized' });
    const before = structuredClone(ingestion.regions);
    const result = analyzeSemanticRegionRoles(ingestion.regions, ingestion.graph);
    expect(result.metadata.mutationsDetected).toBe(false);
    expect(ingestion.regions).toEqual(before);
  });

  it('creates immutable assessment data without retaining nested input references', () => {
    const input = { regionId: 'r1', semanticRole: 'unknown', evidence: [{ code: 'TEST', message: 'test', nested: { value: 1 } }], alternatives: [{ role: 'primary_shape', score: 0.5 }] };
    const before = structuredClone(input);
    const assessment = createSemanticRegionAssessmentV2(input);
    assessment.evidence[0].nested.value = 2;
    expect(input).toEqual(before);
  });

  it('never emits embroidery planning fields', () => {
    const { semantic } = analyze(createSemanticRolesFixture());
    semantic.assessments.forEach(assessment => {
      expect(assessment).not.toHaveProperty('stitchType');
      expect(assessment).not.toHaveProperty('threadId');
      expect(assessment).not.toHaveProperty('machine');
    });
  });
});
