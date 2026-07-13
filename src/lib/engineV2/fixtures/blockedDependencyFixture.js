import { createSyntheticProposal, createSyntheticProposalPlan, createSyntheticRegionsForProposals } from './proposalReviewFixture.js';

export function createBlockedDependencyFixture() {
  const deferred = createSyntheticProposal('chain-c', 'manual_review', 'manual', { needsReview: true, confidence: 0.4, semanticRole: 'unknown' });
  const middle = createSyntheticProposal('chain-b', 'foreground_fill', 'tatami', { dependencyIds: [deferred.id], semanticRole: 'secondary_shape' });
  const top = createSyntheticProposal('chain-a', 'internal_detail', 'running', { dependencyIds: [middle.id], semanticRole: 'internal_feature' });
  const proposals = [top, middle, deferred];
  return { regions: createSyntheticRegionsForProposals(proposals), proposalPlan: createSyntheticProposalPlan(proposals), proposals };
}

export function createExcludedDependencyFixture() {
  const excluded = createSyntheticProposal('excluded-parent', 'excluded', 'none', { excluded: true, exclusionReason: 'explicit_negative_space', semanticRole: 'negative_space' });
  const dependent = createSyntheticProposal('excluded-child', 'internal_detail', 'running', { dependencyIds: [excluded.id], semanticRole: 'internal_feature' });
  const proposals = [excluded, dependent];
  return { regions: createSyntheticRegionsForProposals(proposals), proposalPlan: createSyntheticProposalPlan(proposals), proposals };
}

export function createValidThreeLevelDraftFixture() {
  const base = createSyntheticProposal('level-1', 'base_fill', 'tatami');
  const middle = createSyntheticProposal('level-2', 'foreground_fill', 'tatami', { dependencyIds: [base.id], semanticRole: 'secondary_shape' });
  const top = createSyntheticProposal('level-3', 'internal_detail', 'running', { dependencyIds: [middle.id], semanticRole: 'internal_feature' });
  const proposals = [top, base, middle];
  return { regions: createSyntheticRegionsForProposals(proposals), proposalPlan: createSyntheticProposalPlan(proposals), proposals };
}
