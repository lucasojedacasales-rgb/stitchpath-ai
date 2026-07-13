import { describe, expect, it } from 'vitest';
import { analyzeSemanticRegionRoles, buildEmbroideryObjectProposalPlan, createSemanticRegionAssessmentV2, ingestV1RegionsToRegionGraphV2 } from '../index.js';
import { createEmbroideryPlanningFixture } from '../fixtures/embroideryPlanningFixture.js';
import { createExplicitHolePlanningFixture } from '../fixtures/planningAmbiguityFixture.js';

function automaticContext(source = createEmbroideryPlanningFixture()) {
  const ingestion = ingestV1RegionsToRegionGraphV2(source, { coordinateSpace: 'normalized' });
  const semanticResult = analyzeSemanticRegionRoles(ingestion.regions, ingestion.graph);
  return { ingestion, semanticResult, plan: buildEmbroideryObjectProposalPlan({ regions: ingestion.regions, graph: ingestion.graph, semanticResult }) };
}

describe('Phase 4 object planning pipeline', () => {
  it('creates exactly one decision record per accepted region', () => {
    const { ingestion, plan } = automaticContext();
    expect(plan.proposals).toHaveLength(ingestion.regions.length);
    expect(new Set(plan.proposals.map(item => item.regionId)).size).toBe(ingestion.regions.length);
  });
  it('reports 100 percent decision coverage', () => expect(automaticContext().plan.summary.decisionCoveragePercent).toBe(100));
  it('reports no silent region drops', () => expect(automaticContext().plan.summary.silentRegionDropCount).toBe(0));
  it('excludes explicit negative space', () => expect(automaticContext().plan.byRegionId.negative.exclusionReason).toBe('explicit_negative_space'));
  it('excludes background by default', () => expect(automaticContext().plan.byRegionId.background.exclusionReason).toBe('background_excluded_by_policy'));
  it('retains unknown regions as manual review', () => expect(automaticContext().plan.byRegionId.unknown.proposedEmbroideryRole).toBe('manual_review'));
  it('is deterministic regardless of source order', () => {
    const first = automaticContext().plan;
    const second = automaticContext([...createEmbroideryPlanningFixture()].reverse()).plan;
    expect(second.proposals).toEqual(first.proposals);
    expect(second.executionLayers).toEqual(first.executionLayers);
  });
  it('preserves explicit holes in millimetres', () => {
    const ingestion = ingestV1RegionsToRegionGraphV2(createExplicitHolePlanningFixture(), { coordinateSpace: 'normalized' });
    const assessment = createSemanticRegionAssessmentV2({ regionId: 'body-with-hole', semanticRole: 'primary_shape', confidence: 0.92, evidence: [{ code: 'TEST', message: 'test' }] });
    const semanticResult = { assessments: [assessment], byRegionId: { 'body-with-hole': assessment } };
    const plan = buildEmbroideryObjectProposalPlan({ regions: ingestion.regions, graph: ingestion.graph, semanticResult });
    expect(plan.byRegionId['body-with-hole'].holesMm).toHaveLength(1);
  });
  it('does not generate synthetic outlines', () => expect(automaticContext().plan.summary.syntheticOutlineProposalCount).toBe(0));
  it('does not generate stitches, threads, or commands', () => {
    automaticContext().plan.proposals.forEach(item => {
      expect(item).not.toHaveProperty('threadId');
      expect(item).not.toHaveProperty('stitches');
      expect(item).not.toHaveProperty('commands');
    });
  });
});
