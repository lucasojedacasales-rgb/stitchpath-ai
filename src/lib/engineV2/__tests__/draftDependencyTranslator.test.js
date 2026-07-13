import { describe, expect, it } from 'vitest';
import { getDraftAncestors, getDraftDescendants, getDraftExecutionLayers, materializeEmbroideryObjectDrafts } from '../index.js';
import { createBlockedDependencyFixture, createExcludedDependencyFixture, createValidThreeLevelDraftFixture } from '../fixtures/blockedDependencyFixture.js';

describe('Phase 5 draft dependency translation', () => {
  it('translates proposal dependencies to draft IDs', () => {
    const fixture = createValidThreeLevelDraftFixture(); const result = materializeEmbroideryObjectDrafts({ regions: fixture.regions, proposalPlan: fixture.proposalPlan });
    expect(result.byRegionId['level-3'].dependencyIds).toEqual(['draft:proposal:level-2:foreground_fill']);
  });
  it('blocks dependency on excluded proposal', () => {
    const fixture = createExcludedDependencyFixture(); const result = materializeEmbroideryObjectDrafts({ regions: fixture.regions, proposalPlan: fixture.proposalPlan });
    expect(result.byProposalId['proposal:excluded-child:internal_detail'].action).toBe('blocked');
  });
  it('blocks dependency on deferred proposal', () => {
    const fixture = createBlockedDependencyFixture(); const result = materializeEmbroideryObjectDrafts({ regions: fixture.regions, proposalPlan: fixture.proposalPlan });
    expect(result.byProposalId['proposal:chain-b:foreground_fill'].action).toBe('blocked');
  });
  it('blocks transitive dependents to a fixed point', () => {
    const fixture = createBlockedDependencyFixture(); const result = materializeEmbroideryObjectDrafts({ regions: fixture.regions, proposalPlan: fixture.proposalPlan });
    expect(result.byProposalId['proposal:chain-a:internal_detail'].action).toBe('blocked');
    expect(result.drafts).toHaveLength(0);
  });
  it('materializes a valid three-level chain', () => expect(materializeEmbroideryObjectDrafts({ ...createValidThreeLevelDraftFixture() }).drafts).toHaveLength(3));
  it('produces deterministic execution layers', () => {
    const fixture = createValidThreeLevelDraftFixture(); const first = materializeEmbroideryObjectDrafts({ regions: fixture.regions, proposalPlan: fixture.proposalPlan });
    const reversedPlan = { ...fixture.proposalPlan, proposals: [...fixture.proposalPlan.proposals].reverse() };
    const second = materializeEmbroideryObjectDrafts({ regions: [...fixture.regions].reverse(), proposalPlan: reversedPlan });
    expect(first.executionLayers).toEqual(second.executionLayers);
  });
  it('provides draft ancestor queries', () => {
    const fixture = createValidThreeLevelDraftFixture(); const result = materializeEmbroideryObjectDrafts({ regions: fixture.regions, proposalPlan: fixture.proposalPlan });
    expect(getDraftAncestors(result, result.byRegionId['level-3'].id)).toContain(result.byRegionId['level-1'].id);
  });
  it('provides draft descendant queries', () => {
    const fixture = createValidThreeLevelDraftFixture(); const result = materializeEmbroideryObjectDrafts({ regions: fixture.regions, proposalPlan: fixture.proposalPlan });
    expect(getDraftDescendants(result, result.byRegionId['level-1'].id)).toContain(result.byRegionId['level-3'].id);
  });
  it('returns copied execution layers', () => {
    const fixture = createValidThreeLevelDraftFixture(); const result = materializeEmbroideryObjectDrafts({ regions: fixture.regions, proposalPlan: fixture.proposalPlan });
    expect(getDraftExecutionLayers(result)).toEqual(result.executionLayers);
  });
  it('detects unknown required dependency', () => {
    const fixture = createValidThreeLevelDraftFixture(); const broken = { ...fixture.proposalPlan.proposals[1], dependencyIds: ['proposal:missing:base_fill'] };
    const plan = { ...fixture.proposalPlan, proposals: [broken] };
    expect(materializeEmbroideryObjectDrafts({ regions: [fixture.regions[1]], proposalPlan: plan }).errors.some(item => item.code === 'REQUIRED_DEPENDENCY_NOT_MATERIALIZED')).toBe(true);
  });
  it('can warn instead of block when explicitly configured', () => {
    const fixture = createExcludedDependencyFixture(); const result = materializeEmbroideryObjectDrafts({ regions: fixture.regions, proposalPlan: fixture.proposalPlan, config: { blockOnMissingDependency: false } });
    expect(result.warnings.some(item => item.code === 'MISSING_DEPENDENCY_OMITTED')).toBe(true);
  });
});
