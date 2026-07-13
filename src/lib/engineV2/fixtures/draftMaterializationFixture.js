import { createSyntheticProposal, createSyntheticProposalPlan, createSyntheticRegionsForProposals } from './proposalReviewFixture.js';

export function createDraftMaterializationFixture() {
  const base = createSyntheticProposal('draft-base', 'base_fill', 'tatami', { holesMm: [[{ x: 30, y: 30 }, { x: 40, y: 30 }, { x: 40, y: 40 }]] });
  const detail = createSyntheticProposal('draft-detail', 'internal_detail', 'satin', { dependencyIds: [base.id], color: '#111111', semanticRole: 'internal_feature' });
  const highlight = createSyntheticProposal('draft-highlight', 'highlight', 'running', { dependencyIds: [base.id], color: '#ffffff' });
  const proposals = [base, detail, highlight];
  return { regions: createSyntheticRegionsForProposals(proposals), proposalPlan: createSyntheticProposalPlan(proposals), proposals };
}
