import { createSyntheticProposal, createSyntheticProposalPlan, createSyntheticRegionsForProposals } from './proposalReviewFixture.js';

export function createDraftOutlineSafetyFixture() {
  const supported = createSyntheticProposal('supported-outline', 'outer_outline', 'running', { color: '#050505', semanticRole: 'dark_mark' });
  const unsafe = createSyntheticProposal('unsafe-outline', 'outer_outline', 'running', {
    color: '#050505', semanticRole: 'dark_mark',
    outlineEligibility: { eligible: false, explicitOutlineEvidence: false, regionBackedGeometry: false, darkStrokeSupportAvailable: false },
  });
  const proposals = [supported, unsafe];
  return { regions: createSyntheticRegionsForProposals(proposals), proposalPlan: createSyntheticProposalPlan(proposals), proposals };
}
