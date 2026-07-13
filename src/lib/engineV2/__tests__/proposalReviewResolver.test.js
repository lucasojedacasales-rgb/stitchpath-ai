import { describe, expect, it } from 'vitest';
import { createEmbroideryObjectProposalV2, resolveProposalReviewDecisions } from '../index.js';
import { createExplicitReviewOverrideFixture } from '../fixtures/explicitReviewOverrideFixture.js';
import { createProposalReviewFixture, createSyntheticProposal, createSyntheticProposalPlan } from '../fixtures/proposalReviewFixture.js';

describe('Phase 5 proposal review resolution', () => {
  it('automatically accepts valid active proposals', () => expect(resolveProposalReviewDecisions({ plan: createProposalReviewFixture().proposalPlan }).byProposalId['proposal:base:base_fill'].action).toBe('accept'));
  it('preserves excluded dispositions', () => expect(resolveProposalReviewDecisions({ plan: createProposalReviewFixture().proposalPlan }).byProposalId['proposal:negative:excluded'].action).toBe('exclude'));
  it('defers manual-review proposals', () => expect(resolveProposalReviewDecisions({ plan: createProposalReviewFixture().proposalPlan }).byProposalId['proposal:manual:manual_review'].action).toBe('defer'));
  it('blocks invalid proposals', () => {
    const valid = createSyntheticProposal('invalid', 'base_fill', 'tatami');
    const invalid = { ...valid, geometryMm: [] };
    expect(resolveProposalReviewDecisions({ plan: createSyntheticProposalPlan([invalid]) }).decisions[0].action).toBe('blocked');
  });
  it('defers low-confidence proposals', () => {
    const proposal = createSyntheticProposal('low', 'base_fill', 'tatami', { confidence: 0.5 });
    expect(resolveProposalReviewDecisions({ plan: createSyntheticProposalPlan([proposal]) }).decisions[0].action).toBe('defer');
  });
  it('honors explicit rejection', () => {
    const fixture = createExplicitReviewOverrideFixture();
    expect(resolveProposalReviewDecisions({ plan: fixture.proposalPlan, explicitReviewDecisions: [fixture.explicitReject] }).byProposalId[fixture.explicitReject.proposalId].action).toBe('reject');
  });
  it('rejects override while disabled by default', () => {
    const fixture = createExplicitReviewOverrideFixture();
    expect(resolveProposalReviewDecisions({ plan: fixture.proposalPlan, explicitReviewDecisions: [fixture.validOverride] }).valid).toBe(false);
  });
  it('accepts a valid explicitly enabled override', () => {
    const fixture = createExplicitReviewOverrideFixture();
    const result = resolveProposalReviewDecisions({ plan: fixture.proposalPlan, explicitReviewDecisions: [fixture.validOverride], config: { allowExplicitOverrides: true, allowStitchTypeOverride: true } });
    expect(result.byProposalId[fixture.validOverride.proposalId]).toMatchObject({ action: 'override', approvedStitchType: 'satin' });
  });
  it('accepts manual stitch only by explicit review', () => {
    const fixture = createExplicitReviewOverrideFixture();
    const automatic = resolveProposalReviewDecisions({ plan: fixture.proposalPlan });
    const explicit = resolveProposalReviewDecisions({ plan: fixture.proposalPlan, explicitReviewDecisions: [fixture.manualAccept] });
    expect(automatic.byProposalId[fixture.manualAccept.proposalId].action).toBe('defer');
    expect(explicit.byProposalId[fixture.manualAccept.proposalId].action).toBe('accept');
  });
  it.each([
    [{ reviewerSource: '', reason: 'x' }, 'OVERRIDE_REVIEWER_REQUIRED'],
    [{ reviewerSource: 'reviewer', reason: '' }, 'OVERRIDE_REASON_REQUIRED'],
    [{ approvedEmbroideryRole: 'invalid' }, 'INVALID_OVERRIDE_ROLE'],
    [{ approvedStitchType: 'invalid' }, 'INVALID_OVERRIDE_STITCH_TYPE'],
  ])('rejects invalid override detail %#', (changes, code) => {
    const fixture = createExplicitReviewOverrideFixture();
    const explicit = { ...fixture.validOverride, ...changes };
    const result = resolveProposalReviewDecisions({ plan: fixture.proposalPlan, explicitReviewDecisions: [explicit], config: { allowExplicitOverrides: true, allowRoleOverride: true, allowStitchTypeOverride: true } });
    expect(result.errors.some(item => item.code === code)).toBe(true);
  });
  it('rejects negative-space override', () => {
    const fixture = createProposalReviewFixture(); const target = fixture.proposalPlan.byRegionId.negative;
    const explicit = { proposalId: target.id, action: 'override', approvedEmbroideryRole: 'base_fill', approvedStitchType: 'tatami', reviewerSource: 'reviewer', reason: 'unsafe' };
    expect(resolveProposalReviewDecisions({ plan: fixture.proposalPlan, explicitReviewDecisions: [explicit], config: { allowExplicitOverrides: true, allowRoleOverride: true, allowStitchTypeOverride: true } }).valid).toBe(false);
  });
  it('rejects facial feature override to outer outline', () => {
    const target = createSyntheticProposal('face-detail', 'internal_detail', 'running', { semanticRole: 'internal_feature', needsReview: true });
    const explicit = { proposalId: target.id, action: 'override', approvedEmbroideryRole: 'outer_outline', approvedStitchType: 'running', reviewerSource: 'reviewer', reason: 'unsafe' };
    const result = resolveProposalReviewDecisions({ plan: createSyntheticProposalPlan([target]), explicitReviewDecisions: [explicit], config: { allowExplicitOverrides: true, allowRoleOverride: true } });
    expect(result.errors.some(item => item.code === 'FACIAL_OUTLINE_OVERRIDE_FORBIDDEN')).toBe(true);
  });
  it('rejects duplicate explicit decisions', () => {
    const fixture = createExplicitReviewOverrideFixture();
    const result = resolveProposalReviewDecisions({ plan: fixture.proposalPlan, explicitReviewDecisions: [fixture.explicitReject, fixture.explicitReject] });
    expect(result.summary.duplicateDecisionCount).toBe(1);
  });
  it('rejects unknown explicit proposal references', () => expect(resolveProposalReviewDecisions({ plan: createProposalReviewFixture().proposalPlan, explicitReviewDecisions: [{ proposalId: 'missing', action: 'reject' }] }).valid).toBe(false));
  it('provides one disposition per proposal', () => {
    const fixture = createProposalReviewFixture(); const result = resolveProposalReviewDecisions({ plan: fixture.proposalPlan });
    expect(result.decisions).toHaveLength(fixture.proposals.length);
    expect(result.summary.proposalDispositionCoveragePercent).toBe(100);
    expect(result.summary.silentProposalDropCount).toBe(0);
  });
});
