import { materializeEmbroideryObjectDrafts } from '../materialization/objectDraftMaterializer.js';
import { evaluateDraftMaterializationReadiness } from '../orchestration/reviewReadinessGate.js';
import { createSyntheticProposal, createSyntheticProposalPlan, createSyntheticRegionsForProposals } from './proposalReviewFixture.js';

export function createPartialReviewPolicyFixture() {
  const accepted = createSyntheticProposal('partial-accepted', 'base_fill', 'tatami');
  const deferred = createSyntheticProposal('partial-deferred', 'manual_review', 'manual', { needsReview: true, confidence: 0.4, semanticRole: 'unknown' });
  const proposals = [accepted, deferred];
  const proposalPlan = createSyntheticProposalPlan(proposals);
  const regions = createSyntheticRegionsForProposals(proposals);
  const draftMaterialization = materializeEmbroideryObjectDrafts({ regions, proposalPlan });
  return { proposals, proposalPlan, regions, draftMaterialization, readiness: evaluateDraftMaterializationReadiness({ proposalPlan, draftMaterialization }) };
}

export function createBlockedReviewPolicyFixture() {
  const proposal = createSyntheticProposal('blocked-review', 'outer_outline', 'running', { semanticRole: 'dark_mark', outlineEligibility: { eligible: false, explicitOutlineEvidence: false, regionBackedGeometry: true } });
  const proposalPlan = createSyntheticProposalPlan([proposal]);
  const regions = createSyntheticRegionsForProposals([proposal]);
  const draftMaterialization = materializeEmbroideryObjectDrafts({ regions, proposalPlan });
  return { proposals: [proposal], proposalPlan, regions, draftMaterialization, readiness: evaluateDraftMaterializationReadiness({ proposalPlan, draftMaterialization }) };
}
