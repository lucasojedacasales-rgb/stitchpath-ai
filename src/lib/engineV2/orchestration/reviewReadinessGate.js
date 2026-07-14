const FINAL_ACTIONS = new Set(['accept', 'override', 'exclude', 'reject']);
const UNRESOLVED_ACTIONS = new Set(['defer', 'blocked']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

export function evaluateDraftMaterializationReadiness({ proposalPlan, draftMaterialization } = {}) {
  const proposals = proposalPlan?.proposals || [];
  const decisions = draftMaterialization?.decisions || [];
  const drafts = draftMaterialization?.drafts || [];
  const proposalById = new Map(proposals.map(proposal => [proposal.id, proposal]));
  const draftProposalIds = new Set(drafts.map(draft => draft.proposalId));
  const decisionProposalIds = decisions.map(decision => decision.proposalId);
  const counts = action => decisions.filter(decision => decision.action === action).length;

  const acceptedDecisionCount = counts('accept');
  const overriddenDecisionCount = counts('override');
  const excludedDecisionCount = counts('exclude');
  const rejectedDecisionCount = counts('reject');
  const deferredDecisionCount = counts('defer');
  const blockedDecisionCount = counts('blocked');
  const unresolvedReviewDecisionCount = deferredDecisionCount + blockedDecisionCount;
  const resolvedFinalDecisionCount = decisions.filter(decision => FINAL_ACTIONS.has(decision.action)).length;
  const completeDispositionCoverage = proposals.length === decisions.length
    && new Set(decisionProposalIds).size === proposals.length
    && proposals.every(proposal => decisionProposalIds.includes(proposal.id));
  const acceptedWithoutDraft = decisions.filter(decision => {
    const proposal = proposalById.get(decision.proposalId);
    return ['accept', 'override'].includes(decision.action)
      && proposal
      && proposal.excluded !== true
      && proposal.proposedEmbroideryRole !== 'manual_review'
      && !draftProposalIds.has(decision.proposalId);
  });

  let reasonCode = null;
  let reason = null;
  let policyBlocked = false;
  let affectedDecisions = [];

  if (drafts.length > 0 && unresolvedReviewDecisionCount > 0) {
    reasonCode = 'PARTIAL_REVIEW_RESOLUTION_FORBIDDEN';
    reason = 'A partially reviewed design cannot continue while proposals remain deferred or blocked.';
    policyBlocked = true;
    affectedDecisions = decisions.filter(decision => UNRESOLVED_ACTIONS.has(decision.action));
  } else if (blockedDecisionCount > 0) {
    reasonCode = 'REVIEW_DECISION_BLOCKED';
    reason = 'One or more proposal review decisions are blocked.';
    policyBlocked = true;
    affectedDecisions = decisions.filter(decision => decision.action === 'blocked');
  } else if (deferredDecisionCount > 0) {
    reasonCode = 'EXPLICIT_REVIEW_REQUIRED';
    reason = 'One or more proposals require explicit human review before embroidery-object materialization.';
    policyBlocked = true;
    affectedDecisions = decisions.filter(decision => decision.action === 'defer');
  } else if (acceptedWithoutDraft.length > 0) {
    reasonCode = 'ACCEPTED_PROPOSAL_NOT_MATERIALIZED';
    reason = 'One or more accepted or overridden active proposals did not produce a draft.';
    affectedDecisions = acceptedWithoutDraft;
  } else if (!completeDispositionCoverage) {
    reasonCode = 'INCOMPLETE_REVIEW_DISPOSITION';
    reason = 'Review decisions do not provide one complete disposition for every proposal.';
    affectedDecisions = proposals.filter(proposal => decisionProposalIds.filter(id => id === proposal.id).length !== 1)
      .map(proposal => ({ proposalId: proposal.id, regionId: proposal.regionId }));
  } else if (proposals.length > 0 && drafts.length === 0 && unresolvedReviewDecisionCount === 0
    && decisions.every(decision => ['exclude', 'reject'].includes(decision.action))) {
    reasonCode = 'NO_STITCHABLE_PROPOSALS_AFTER_REVIEW';
    reason = 'Review completed without any stitchable proposals.';
    policyBlocked = true;
    affectedDecisions = decisions;
  } else if (proposals.length === 0 || drafts.length === 0) {
    reasonCode = 'NO_STITCHABLE_PROPOSALS';
    reason = 'No stitchable proposal drafts are available for downstream processing.';
    policyBlocked = true;
    affectedDecisions = decisions;
  }

  const safeToContinue = reasonCode == null
    && completeDispositionCoverage
    && unresolvedReviewDecisionCount === 0
    && acceptedWithoutDraft.length === 0
    && drafts.length > 0;
  const affectedProposalIds = uniqueSorted(affectedDecisions.map(decision => decision.proposalId));
  const affectedRegionIds = uniqueSorted(affectedDecisions.map(decision => decision.regionId || proposalById.get(decision.proposalId)?.regionId));
  const errors = reasonCode && !policyBlocked
    ? [{ code: reasonCode, path: 'draft_materialization.review', message: reason, affectedProposalIds, affectedRegionIds }]
    : [];

  return deepFreeze({
    ready: safeToContinue,
    policyBlocked,
    reasonCode,
    reason,
    sourceProposalCount: proposals.length,
    reviewDecisionCount: decisions.length,
    acceptedDecisionCount,
    overriddenDecisionCount,
    excludedDecisionCount,
    rejectedDecisionCount,
    deferredDecisionCount,
    blockedDecisionCount,
    resolvedFinalDecisionCount,
    unresolvedReviewDecisionCount,
    materializedDraftCount: drafts.length,
    acceptedOrOverriddenWithoutDraftCount: acceptedWithoutDraft.length,
    completeDispositionCoverage,
    safeToContinue,
    affectedProposalIds,
    affectedRegionIds,
    errors,
    warnings: [],
  });
}
