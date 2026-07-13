import { describe, expect, it } from 'vitest';
import { createObjectDraftMaterializationDiagnostic, materializeEmbroideryObjectDrafts } from '../index.js';
import { createProposalReviewFixture } from '../fixtures/proposalReviewFixture.js';

function diagnostic() { const fixture = createProposalReviewFixture(); const materialization = materializeEmbroideryObjectDrafts({ regions: fixture.regions, proposalPlan: fixture.proposalPlan }); return createObjectDraftMaterializationDiagnostic({ regions: fixture.regions, proposalPlan: fixture.proposalPlan, materialization }); }

describe('Phase 5 object draft diagnostics', () => {
  it('reports valid materialization', () => expect(diagnostic().valid).toBe(true));
  it('reports complete proposal disposition coverage', () => expect(diagnostic().proposalDispositionCoveragePercent).toBe(100));
  it('reports no silent proposal drops', () => expect(diagnostic().silentProposalDropCount).toBe(0));
  it('matches pending thread assignments to drafts', () => expect(diagnostic().pendingThreadAssignmentCount).toBe(diagnostic().materializedDraftCount));
  it('reports no dependency cycles', () => expect(diagnostic().dependencyCycleCount).toBe(0));
  it('reports no synthetic outlines', () => expect(diagnostic().syntheticOutlineDraftCount).toBe(0));
  it('reports no disconnected-region merges', () => expect(diagnostic().disconnectedRegionMergeCount).toBe(0));
  it.each(['geometryMutationCount', 'holeMutationCount', 'visualColorMutationCount'])('reports zero %s', field => expect(diagnostic()[field]).toBe(0));
  it('reports no assigned thread IDs', () => expect(diagnostic().threadIdsAssigned).toBe(false));
  it('reports no thread definitions', () => expect(diagnostic().threadDefinitionsCreated).toBe(false));
  it('reports no thread blocks', () => expect(diagnostic().threadBlocksCreated).toBe(false));
  it('reports no stitch coordinates', () => expect(diagnostic().stitchCoordinatesGenerated).toBe(false));
  it('reports no canonical commands', () => expect(diagnostic().canonicalCommandsGenerated).toBe(false));
  it('reports no machine adaptation', () => expect(diagnostic().machineAdaptationApplied).toBe(false));
  it('reports no input mutations', () => expect(diagnostic().inputMutationsDetected).toBe(false));
  it('reports role and stitch-type distributions', () => { expect(diagnostic().roleDistribution.base_fill).toBe(1); expect(diagnostic().stitchTypeDistribution.tatami).toBeGreaterThan(0); });
});
