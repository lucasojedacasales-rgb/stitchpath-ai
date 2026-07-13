import { createSyntheticProposal, createSyntheticProposalPlan, createSyntheticRegionsForProposals } from './proposalReviewFixture.js';

export function createExplicitReviewOverrideFixture() {
  const manualStitch = createSyntheticProposal('manual-stitch', 'internal_detail', 'manual', { needsReview: true, semanticRole: 'internal_feature' });
  const overrideTarget = createSyntheticProposal('override-target', 'internal_detail', 'running', { needsReview: true, semanticRole: 'internal_feature' });
  const rejectTarget = createSyntheticProposal('reject-target', 'highlight', 'running');
  const proposals = [manualStitch, overrideTarget, rejectTarget];
  return {
    regions: createSyntheticRegionsForProposals(proposals), proposalPlan: createSyntheticProposalPlan(proposals), proposals,
    manualAccept: { proposalId: manualStitch.id, action: 'accept', reviewerSource: 'synthetic-reviewer', reason: 'Manual generator requirement explicitly accepted.' },
    validOverride: { proposalId: overrideTarget.id, action: 'override', approvedEmbroideryRole: 'internal_detail', approvedStitchType: 'satin', reviewerSource: 'synthetic-reviewer', reason: 'Stable width confirmed in synthetic review.' },
    explicitReject: { proposalId: rejectTarget.id, action: 'reject', reviewerSource: 'synthetic-reviewer', reason: 'Synthetic rejection.' },
  };
}
