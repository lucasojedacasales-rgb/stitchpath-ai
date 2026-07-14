import { materializeEmbroideryObjectDrafts } from '../materialization/objectDraftMaterializer.js';
import { evaluateDraftMaterializationReadiness } from '../orchestration/reviewReadinessGate.js';
import { createSyntheticProposal, createSyntheticProposalPlan, createSyntheticRegionsForProposals } from './proposalReviewFixture.js';

function build(proposals, explicitReviewDecisions = []) {
  const proposalPlan = createSyntheticProposalPlan(proposals);
  const regions = createSyntheticRegionsForProposals(proposals);
  const draftMaterialization = materializeEmbroideryObjectDrafts({ regions, proposalPlan, explicitReviewDecisions });
  return { proposals, proposalPlan, regions, draftMaterialization, readiness: evaluateDraftMaterializationReadiness({ proposalPlan, draftMaterialization }) };
}

export function createAllExcludedReviewFixture() {
  return build([createSyntheticProposal('excluded-only', 'excluded', 'none', { excluded: true, exclusionReason: 'explicit_negative_space', semanticRole: 'negative_space' })]);
}

export function createAllRejectedReviewFixture() {
  const proposal = createSyntheticProposal('rejected-only', 'base_fill', 'tatami');
  return build([proposal], [{ proposalId: proposal.id, action: 'reject', reviewerSource: 'synthetic-reviewer', reason: 'Synthetic rejection.' }]);
}

export function createAcceptedWithoutDraftReadinessFixture() {
  const proposal = createSyntheticProposal('accepted-without-draft', 'base_fill', 'tatami');
  const proposalPlan = createSyntheticProposalPlan([proposal]);
  const draftMaterialization = { decisions: [{ proposalId: proposal.id, regionId: proposal.regionId, action: 'accept' }], drafts: [] };
  return { proposalPlan, draftMaterialization, readiness: evaluateDraftMaterializationReadiness({ proposalPlan, draftMaterialization }) };
}
