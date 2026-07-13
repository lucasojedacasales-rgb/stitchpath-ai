import { describe, expect, it } from 'vitest';
import { materializeEmbroideryObjectDrafts } from '../index.js';
import { createDraftMaterializationFixture } from '../fixtures/draftMaterializationFixture.js';
import { createExplicitReviewOverrideFixture } from '../fixtures/explicitReviewOverrideFixture.js';
import { createProposalReviewFixture } from '../fixtures/proposalReviewFixture.js';

describe('Phase 5 object draft materializer', () => {
  it('materializes accepted active proposals', () => {
    const fixture = createDraftMaterializationFixture(); expect(materializeEmbroideryObjectDrafts({ regions: fixture.regions, proposalPlan: fixture.proposalPlan }).drafts).toHaveLength(3);
  });
  it.each([
    ['negative', 'excluded'], ['background', 'excluded'], ['manual', 'manual_review'],
  ])('does not materialize %s proposal', regionId => {
    const fixture = createProposalReviewFixture(); const result = materializeEmbroideryObjectDrafts({ regions: fixture.regions, proposalPlan: fixture.proposalPlan });
    expect(result.byRegionId[regionId]).toBeUndefined();
  });
  it('does not materialize explicitly rejected proposal', () => {
    const fixture = createExplicitReviewOverrideFixture(); const result = materializeEmbroideryObjectDrafts({ regions: fixture.regions, proposalPlan: fixture.proposalPlan, explicitReviewDecisions: [fixture.explicitReject] });
    expect(result.byRegionId['reject-target']).toBeUndefined();
  });
  it('materializes valid explicit override', () => {
    const fixture = createExplicitReviewOverrideFixture(); const result = materializeEmbroideryObjectDrafts({ regions: fixture.regions, proposalPlan: fixture.proposalPlan, explicitReviewDecisions: [fixture.validOverride], config: { allowExplicitOverrides: true, allowStitchTypeOverride: true } });
    expect(result.byRegionId['override-target'].stitchType).toBe('satin');
  });
  it('materializes explicitly accepted manual stitch proposal', () => {
    const fixture = createExplicitReviewOverrideFixture(); const result = materializeEmbroideryObjectDrafts({ regions: fixture.regions, proposalPlan: fixture.proposalPlan, explicitReviewDecisions: [fixture.manualAccept] });
    expect(result.byRegionId['manual-stitch'].stitchType).toBe('manual');
  });
  it('gives every proposal one disposition', () => {
    const fixture = createProposalReviewFixture(); const result = materializeEmbroideryObjectDrafts({ regions: fixture.regions, proposalPlan: fixture.proposalPlan });
    expect(result.decisions).toHaveLength(fixture.proposals.length);
    expect(result.summary.proposalDispositionCoveragePercent).toBe(100);
  });
  it('reports no silent proposal drops', () => expect(materializeEmbroideryObjectDrafts({ ...createDraftMaterializationFixture() }).summary.silentProposalDropCount).toBe(0));
  it.each(['threadId', 'machineColor', 'stitches', 'commands'])('does not add %s', field => {
    const result = materializeEmbroideryObjectDrafts({ ...createDraftMaterializationFixture() });
    expect(result.drafts.some(item => Object.hasOwn(item, field))).toBe(false);
  });
  it('preserves geometry, holes, color, and layer', () => {
    const fixture = createDraftMaterializationFixture(); const result = materializeEmbroideryObjectDrafts({ regions: fixture.regions, proposalPlan: fixture.proposalPlan }); const draft = result.byRegionId['draft-base']; const proposal = fixture.proposalPlan.byRegionId['draft-base'];
    expect([draft.geometryMm, draft.holesMm, draft.visualColor, draft.layer]).toEqual([proposal.geometryMm, proposal.holesMm, proposal.visualColor, proposal.layer]);
  });
  it('does not mutate materialization inputs', () => {
    const fixture = createDraftMaterializationFixture(); const before = structuredClone(fixture);
    const result = materializeEmbroideryObjectDrafts({ regions: fixture.regions, proposalPlan: fixture.proposalPlan });
    expect(result.metadata.inputMutationsDetected).toBe(false); expect(fixture).toEqual(before);
  });
});
