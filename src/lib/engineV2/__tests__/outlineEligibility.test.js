import { describe, expect, it } from 'vitest';
import {
  analyzeArtworkColor, analyzeRegionGeometryFeatures, analyzeSourceSemanticEvidence,
  createSemanticRegionAssessmentV2, evaluateOutlineEligibility, ingestV1RegionsToRegionGraphV2,
  resolveObjectPlanningConfig,
} from '../index.js';
import { createDisconnectedOutlineFixture, createOutlineEligibilityFixture } from '../fixtures/outlineEligibilityFixture.js';

function evaluate(source, id, role = 'dark_mark', confidence = 0.92) {
  const ingestion = ingestV1RegionsToRegionGraphV2(source, { coordinateSpace: 'normalized' });
  const region = ingestion.regions.find(item => item.id === id);
  const semanticAssessment = createSemanticRegionAssessmentV2({ regionId: id, semanticRole: role, confidence, evidence: [{ code: 'TEST', message: 'Synthetic test assessment.' }] });
  return evaluateOutlineEligibility({
    region, graph: ingestion.graph, semanticAssessment, sourceEvidence: analyzeSourceSemanticEvidence(region),
    colorFeatures: analyzeArtworkColor(region.visualColor), geometryFeatures: analyzeRegionGeometryFeatures(region, ingestion.graph),
    config: resolveObjectPlanningConfig(),
  });
}

describe('Phase 4 conservative outline eligibility', () => {
  const fixture = createOutlineEligibilityFixture();
  it('rejects dark color without explicit outline intent', () => expect(evaluate(fixture, 'dark-no-intent').eligible).toBe(false));
  it('rejects explicit outline without dark-stroke support', () => expect(evaluate(fixture, 'outline-no-support').rejectedReasons).toContain('dark_stroke_support_unavailable'));
  it('accepts explicit region-backed border with sufficient support', () => expect(evaluate(fixture, 'supported-border').eligible).toBe(true));
  it('proposes outer_outline for supported border', () => expect(evaluate(fixture, 'supported-border').proposedRole).toBe('outer_outline'));
  it('rejects facial feature even when labelled outline', () => expect(evaluate(fixture, 'eye-outline-conflict', 'internal_feature').rejectedReasons).toContain('facial_detail_cannot_be_outline'));
  it('rejects low semantic confidence', () => expect(evaluate(fixture, 'supported-border', 'dark_mark', 0.5).rejectedReasons).toContain('planning_confidence_below_threshold'));
  it('reports region-backed geometry', () => expect(evaluate(fixture, 'supported-border').regionBackedGeometry).toBe(true));
  it('keeps synthetic outline generation disabled by default', () => expect(resolveObjectPlanningConfig().generateSyntheticOutlines).toBe(false));
  it('does not concatenate disconnected explicit outlines', () => {
    const ingestion = ingestV1RegionsToRegionGraphV2(createDisconnectedOutlineFixture(), { coordinateSpace: 'normalized' });
    expect(ingestion.regions).toHaveLength(2);
    expect(ingestion.graph.componentIds).toHaveLength(2);
  });
  it('rejects negative space as outline', () => expect(evaluate(fixture, 'supported-border', 'negative_space').rejectedReasons).toContain('negative_space_cannot_be_outline'));
  it('rejects outline geometry generated from a fill boundary', () => {
    const source = [
      { id: 'body', color: '#55aa66', region_class: 'body', path_points: [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]] },
      { id: 'generated', color: '#050505', region_class: 'outline', path_points: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]], darkStrokeSupport: { available: true, ratio: 0.9 }, source: { generatedFromFillBoundary: true } },
    ];
    expect(evaluate(source, 'generated').rejectedReasons).toContain('missing_region_backed_geometry');
  });
  it('accepts explicit nested inner outline conservatively', () => {
    const source = [
      { id: 'body', color: '#55aa66', region_class: 'body', path_points: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]] },
      { id: 'inner', color: '#050505', region_class: 'inner_outline', path_points: [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7]], darkStrokeSupport: { available: true, ratio: 0.9 } },
    ];
    expect(evaluate(source, 'inner')).toMatchObject({ eligible: true, proposedRole: 'inner_outline' });
  });
});
