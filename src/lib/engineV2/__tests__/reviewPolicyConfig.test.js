import { describe, expect, it } from 'vitest';
import { DEFAULT_PROPOSAL_REVIEW_POLICY_CONFIG, resolveProposalReviewPolicyConfig, validateProposalReviewPolicyConfig } from '../index.js';

describe('Phase 5 review policy configuration', () => {
  it('resolves conservative defaults', () => expect(resolveProposalReviewPolicyConfig()).toMatchObject(DEFAULT_PROPOSAL_REVIEW_POLICY_CONFIG));
  it('disables explicit overrides by default', () => expect(resolveProposalReviewPolicyConfig().allowExplicitOverrides).toBe(false));
  it('blocks missing dependencies by default', () => expect(resolveProposalReviewPolicyConfig().blockOnMissingDependency).toBe(true));
  it('requires complete disposition coverage', () => expect(resolveProposalReviewPolicyConfig().requireCompleteDispositionCoverage).toBe(true));
  it('preserves unknown fields in extras', () => expect(resolveProposalReviewPolicyConfig({ custom: 1 }).extras).toEqual({ custom: 1 }));
  it.each([-0.1, 1.1, Infinity, NaN])('rejects confidence %s', value => expect(validateProposalReviewPolicyConfig({ minimumAutoAcceptConfidence: value }).valid).toBe(false));
  it.each(['accept', 'exclude', 'blocked'])('rejects manualReviewAction %s', value => expect(validateProposalReviewPolicyConfig({ manualReviewAction: value }).valid).toBe(false));
  it('accepts reject as manual review action', () => expect(validateProposalReviewPolicyConfig({ manualReviewAction: 'reject' }).valid).toBe(true));
  it('requires excluded action to remain exclude', () => expect(validateProposalReviewPolicyConfig({ excludedProposalAction: 'reject' }).valid).toBe(false));
  it('contains no thread or machine configuration', () => expect(Object.keys(resolveProposalReviewPolicyConfig()).join(' ')).not.toMatch(/thread|machine/i));
});
