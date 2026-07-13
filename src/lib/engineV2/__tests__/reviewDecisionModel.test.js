import { describe, expect, it } from 'vitest';
import { createProposalReviewDecisionV2, reviewDecisionIdFor, validateProposalReviewDecisionV2 } from '../index.js';

function validInput() {
  return { proposalId: 'proposal:r1:base_fill', regionId: 'r1', action: 'accept', proposedEmbroideryRole: 'base_fill', proposedStitchType: 'tatami', approvedEmbroideryRole: 'base_fill', approvedStitchType: 'tatami', reasonCode: 'TEST', reason: 'Synthetic test.', automatic: true, confidence: 0.9, evidence: [{ code: 'TEST' }] };
}

describe('Phase 5 review decision model', () => {
  it('creates a valid review decision', () => expect(validateProposalReviewDecisionV2(createProposalReviewDecisionV2(validInput())).valid).toBe(true));
  it('uses a deterministic review ID', () => expect(createProposalReviewDecisionV2(validInput()).id).toBe(reviewDecisionIdFor(validInput().proposalId)));
  it('deeply freezes review records', () => expect(Object.isFrozen(createProposalReviewDecisionV2(validInput()).evidence)).toBe(true));
  it('preserves proposed and approved roles', () => expect(createProposalReviewDecisionV2(validInput())).toMatchObject({ proposedEmbroideryRole: 'base_fill', approvedEmbroideryRole: 'base_fill' }));
  it('preserves proposed and approved stitch types', () => expect(createProposalReviewDecisionV2(validInput())).toMatchObject({ proposedStitchType: 'tatami', approvedStitchType: 'tatami' }));
  it.each(['threadId', 'machineColor', 'commands', 'stitches', 'stitchCoordinates'])('rejects forbidden review field %s', field => {
    expect(validateProposalReviewDecisionV2({ ...createProposalReviewDecisionV2(validInput()), [field]: [] }).valid).toBe(false);
  });
  it('rejects missing proposal references', () => expect(validateProposalReviewDecisionV2(createProposalReviewDecisionV2({ ...validInput(), proposalId: null })).valid).toBe(false));
  it('rejects non-deterministic review IDs', () => expect(validateProposalReviewDecisionV2({ ...createProposalReviewDecisionV2(validInput()), id: 'random' }).valid).toBe(false));
});
