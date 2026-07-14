import { beforeAll, describe, expect, it } from 'vitest';
import { createAcceptedWithoutDraftReadinessFixture, createAllExcludedReviewFixture, createAllRejectedReviewFixture } from '../fixtures/noStitchableProposalFixture.js';
import { createBlockedReviewPolicyFixture, createPartialReviewPolicyFixture } from '../fixtures/partialReviewPolicyFixture.js';
import { createResolvedReviewContinuationFixture } from '../fixtures/resolvedReviewContinuationFixture.js';
import { createUnresolvedReviewPolicyFixture } from '../fixtures/unresolvedReviewPolicyFixture.js';
import { evaluateDraftMaterializationReadiness } from '../orchestration/reviewReadinessGate.js';

describe('Phase 13A1 draft materialization review readiness gate', () => {
  let unresolved; let partial; let blocked; let excluded; let rejected; let missing; let resolved;
  beforeAll(() => {
    unresolved = createUnresolvedReviewPolicyFixture();
    partial = createPartialReviewPolicyFixture();
    blocked = createBlockedReviewPolicyFixture();
    excluded = createAllExcludedReviewFixture();
    rejected = createAllRejectedReviewFixture();
    missing = createAcceptedWithoutDraftReadinessFixture();
    resolved = createResolvedReviewContinuationFixture().result.stageResults.find(stage => stage.stageId === 'draft_materialization').summary.reviewReadiness;
  }, 60000);

  it.each([
    ['ready', false], ['policyBlocked', true], ['reasonCode', 'EXPLICIT_REVIEW_REQUIRED'],
    ['reason', 'One or more proposals require explicit human review before embroidery-object materialization.'],
    ['sourceProposalCount', 3], ['reviewDecisionCount', 3], ['acceptedDecisionCount', 0],
    ['overriddenDecisionCount', 0], ['excludedDecisionCount', 0], ['rejectedDecisionCount', 0],
    ['deferredDecisionCount', 3], ['blockedDecisionCount', 0], ['resolvedFinalDecisionCount', 0],
    ['unresolvedReviewDecisionCount', 3], ['materializedDraftCount', 0],
    ['acceptedOrOverriddenWithoutDraftCount', 0], ['completeDispositionCoverage', true],
    ['safeToContinue', false], ['warnings.length', 0], ['errors.length', 0],
    ['affectedProposalIds.length', 3], ['affectedRegionIds.length', 3],
  ])('reports unresolved field %s', (path, expected) => expect(path.split('.').reduce((value, key) => value[key], unresolved.readiness)).toBe(expected));

  it.each([
    ['ready', false], ['policyBlocked', true], ['reasonCode', 'PARTIAL_REVIEW_RESOLUTION_FORBIDDEN'],
    ['sourceProposalCount', 2], ['reviewDecisionCount', 2], ['acceptedDecisionCount', 1],
    ['deferredDecisionCount', 1], ['blockedDecisionCount', 0], ['resolvedFinalDecisionCount', 1],
    ['unresolvedReviewDecisionCount', 1], ['materializedDraftCount', 1],
    ['acceptedOrOverriddenWithoutDraftCount', 0], ['completeDispositionCoverage', true],
    ['safeToContinue', false], ['affectedProposalIds.length', 1], ['affectedRegionIds.length', 1],
  ])('reports partial-review field %s', (path, expected) => expect(path.split('.').reduce((value, key) => value[key], partial.readiness)).toBe(expected));

  it.each([
    ['ready', false], ['policyBlocked', true], ['reasonCode', 'REVIEW_DECISION_BLOCKED'],
    ['sourceProposalCount', 1], ['reviewDecisionCount', 1], ['blockedDecisionCount', 1],
    ['deferredDecisionCount', 0], ['unresolvedReviewDecisionCount', 1], ['materializedDraftCount', 0],
    ['safeToContinue', false], ['affectedProposalIds.length', 1], ['affectedRegionIds.length', 1],
  ])('reports blocked-review field %s', (path, expected) => expect(path.split('.').reduce((value, key) => value[key], blocked.readiness)).toBe(expected));

  it.each([
    ['ready', false], ['policyBlocked', true], ['reasonCode', 'NO_STITCHABLE_PROPOSALS_AFTER_REVIEW'],
    ['sourceProposalCount', 1], ['reviewDecisionCount', 1], ['excludedDecisionCount', 1],
    ['rejectedDecisionCount', 0], ['resolvedFinalDecisionCount', 1], ['unresolvedReviewDecisionCount', 0],
    ['materializedDraftCount', 0], ['completeDispositionCoverage', true], ['safeToContinue', false],
  ])('reports all-excluded field %s', (path, expected) => expect(path.split('.').reduce((value, key) => value[key], excluded.readiness)).toBe(expected));

  it.each([
    ['ready', false], ['policyBlocked', true], ['reasonCode', 'NO_STITCHABLE_PROPOSALS_AFTER_REVIEW'],
    ['sourceProposalCount', 1], ['reviewDecisionCount', 1], ['excludedDecisionCount', 0],
    ['rejectedDecisionCount', 1], ['resolvedFinalDecisionCount', 1], ['unresolvedReviewDecisionCount', 0],
    ['materializedDraftCount', 0], ['completeDispositionCoverage', true], ['safeToContinue', false],
  ])('reports all-rejected field %s', (path, expected) => expect(path.split('.').reduce((value, key) => value[key], rejected.readiness)).toBe(expected));

  it.each([
    ['ready', false], ['policyBlocked', false], ['reasonCode', 'ACCEPTED_PROPOSAL_NOT_MATERIALIZED'],
    ['sourceProposalCount', 1], ['reviewDecisionCount', 1], ['acceptedDecisionCount', 1],
    ['resolvedFinalDecisionCount', 1], ['materializedDraftCount', 0],
    ['acceptedOrOverriddenWithoutDraftCount', 1], ['completeDispositionCoverage', true],
    ['safeToContinue', false], ['errors.length', 1],
  ])('reports accepted-without-draft field %s', (path, expected) => expect(path.split('.').reduce((value, key) => value[key], missing.readiness)).toBe(expected));

  it.each([
    ['ready', true], ['policyBlocked', false], ['reasonCode', null], ['reason', null],
    ['sourceProposalCount', 2], ['reviewDecisionCount', 2], ['acceptedDecisionCount', 2],
    ['overriddenDecisionCount', 0], ['excludedDecisionCount', 0], ['rejectedDecisionCount', 0],
    ['deferredDecisionCount', 0], ['blockedDecisionCount', 0], ['resolvedFinalDecisionCount', 2],
    ['unresolvedReviewDecisionCount', 0], ['materializedDraftCount', 2],
    ['acceptedOrOverriddenWithoutDraftCount', 0], ['completeDispositionCoverage', true],
    ['safeToContinue', true], ['affectedProposalIds.length', 0], ['affectedRegionIds.length', 0],
    ['errors.length', 0], ['warnings.length', 0],
  ])('reports resolved field %s', (path, expected) => expect(path.split('.').reduce((value, key) => value[key], resolved)).toBe(expected));

  it('is deterministic', () => expect(evaluateDraftMaterializationReadiness({ proposalPlan: unresolved.proposalPlan, draftMaterialization: unresolved.draftMaterialization })).toEqual(unresolved.readiness));
  it('does not mutate proposal plan', () => { const before = JSON.stringify(unresolved.proposalPlan); evaluateDraftMaterializationReadiness({ proposalPlan: unresolved.proposalPlan, draftMaterialization: unresolved.draftMaterialization }); expect(JSON.stringify(unresolved.proposalPlan)).toBe(before); });
  it('does not mutate materialization', () => { const before = JSON.stringify(unresolved.draftMaterialization); evaluateDraftMaterializationReadiness({ proposalPlan: unresolved.proposalPlan, draftMaterialization: unresolved.draftMaterialization }); expect(JSON.stringify(unresolved.draftMaterialization)).toBe(before); });
  it('freezes readiness root', () => expect(Object.isFrozen(unresolved.readiness)).toBe(true));
  it('freezes affected proposal IDs', () => expect(Object.isFrozen(unresolved.readiness.affectedProposalIds)).toBe(true));
  it('freezes affected region IDs', () => expect(Object.isFrozen(unresolved.readiness.affectedRegionIds)).toBe(true));
  it('freezes errors', () => expect(Object.isFrozen(unresolved.readiness.errors)).toBe(true));
  it('sorts affected proposal IDs', () => expect(unresolved.readiness.affectedProposalIds).toEqual([...unresolved.readiness.affectedProposalIds].sort()));
  it('sorts affected region IDs', () => expect(unresolved.readiness.affectedRegionIds).toEqual([...unresolved.readiness.affectedRegionIds].sort()));
  it('reports the accepted proposal missing a draft', () => expect(missing.readiness.affectedProposalIds).toContain(missing.proposalPlan.proposals[0].id));
});
