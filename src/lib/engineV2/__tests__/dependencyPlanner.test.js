import { describe, expect, it } from 'vitest';
import {
  buildEmbroideryObjectProposalPlan, createSemanticRegionAssessmentV2, getProposalAncestors,
  getProposalDescendants, getProposalExecutionLayers, ingestV1RegionsToRegionGraphV2,
} from '../index.js';
import { createDisconnectedSameColorPlanningFixture, createOverlappingSiblingPlanningFixture, createPlanningDependenciesFixture } from '../fixtures/planningDependenciesFixture.js';

function context(source, roles) {
  const ingestion = ingestV1RegionsToRegionGraphV2(source, { coordinateSpace: 'normalized' });
  const assessments = ingestion.regions.map(region => createSemanticRegionAssessmentV2({ regionId: region.id, semanticRole: roles[region.id] || 'unknown', confidence: 0.92, evidence: [{ code: 'TEST', message: 'Synthetic test assessment.' }] }));
  const semanticResult = { assessments, byRegionId: Object.fromEntries(assessments.map(item => [item.regionId, item])) };
  const plan = buildEmbroideryObjectProposalPlan({ regions: ingestion.regions, graph: ingestion.graph, semanticResult });
  return { ...ingestion, semanticResult, plan };
}

describe('Phase 4 structural proposal dependencies', () => {
  const roles = { body: 'primary_shape', face: 'secondary_shape', eye: 'internal_feature', highlight: 'highlight' };
  it('makes nested foreground fill depend on containing base fill', () => {
    const { plan } = context(createPlanningDependenciesFixture(), roles);
    expect(plan.byRegionId.face.dependencyIds).toContain(plan.byRegionId.body.id);
  });
  it('makes internal detail depend on nearest containing fill', () => {
    const { plan } = context(createPlanningDependenciesFixture(), roles);
    expect(plan.byRegionId.eye.dependencyIds).toContain(plan.byRegionId.face.id);
  });
  it('makes highlight depend on a containing fill', () => {
    const { plan } = context(createPlanningDependenciesFixture(), roles);
    expect(plan.byRegionId.highlight.dependencyIds).toContain(plan.byRegionId.face.id);
  });
  it('provides ancestor and descendant queries', () => {
    const { plan } = context(createPlanningDependenciesFixture(), roles);
    expect(getProposalAncestors(plan, plan.byRegionId.eye.id)).toContain(plan.byRegionId.body.id);
    expect(getProposalDescendants(plan, plan.byRegionId.body.id)).toContain(plan.byRegionId.eye.id);
  });
  it('produces deterministic execution layers', () => {
    const first = context(createPlanningDependenciesFixture(), roles).plan;
    const second = context([...createPlanningDependenciesFixture()].reverse(), roles).plan;
    expect(getProposalExecutionLayers(first)).toEqual(getProposalExecutionLayers(second));
  });
  it('does not add arbitrary dependencies between overlapping siblings', () => {
    const siblingRoles = { body: 'primary_shape', 'sibling-a': 'secondary_shape', 'sibling-b': 'secondary_shape' };
    const { plan } = context(createOverlappingSiblingPlanningFixture(), siblingRoles);
    expect(plan.byRegionId['sibling-a'].dependencyIds).not.toContain(plan.byRegionId['sibling-b'].id);
    expect(plan.byRegionId['sibling-b'].dependencyIds).not.toContain(plan.byRegionId['sibling-a'].id);
  });
  it('keeps disconnected same-color regions as separate proposals', () => {
    const { plan } = context(createDisconnectedSameColorPlanningFixture(), { left: 'primary_shape', right: 'primary_shape' });
    expect(plan.proposals).toHaveLength(2);
    expect(plan.byRegionId.left.id).not.toBe(plan.byRegionId.right.id);
  });
  it('does not create dependency cycles', () => expect(context(createPlanningDependenciesFixture(), roles).plan.summary.dependencyCycleCount).toBe(0));
});
