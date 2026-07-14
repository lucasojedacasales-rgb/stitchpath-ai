import { beforeAll, describe, expect, it } from 'vitest';
import { createEndToEndDSTFixture } from '../fixtures/endToEndDSTFixture.js';
import { createEndToEndStageBlockingFixture } from '../fixtures/endToEndStageBlockingFixture.js';
import { createUnresolvedReviewEndToEndFixture } from '../fixtures/unresolvedReviewPolicyFixture.js';
import { createEndToEndPipelineDiagnostic } from '../orchestration/endToEndPipelineDiagnostics.js';

describe('Phase 13A end-to-end diagnostics', () => {
  let accepted; let blocked;
  beforeAll(() => { accepted = createEndToEndDSTFixture(); blocked = createEndToEndStageBlockingFixture('invalid_region'); }, 60000);
  it.each([
    ['valid', true], ['pipelineStageDispositionCoveragePercent', 100], ['silentPipelineStageDropCount', 0],
    ['crossStageReferenceCoveragePercent', 100], ['crossStageReferenceMismatchCount', 0], ['requestedFormat', 'DST'],
    ['binaryAccepted', true], ['parserRoundtripPassed', true], ['deterministicBytesVerified', true],
    ['manualDirectStageParityPercent', 100], ['manualDirectBinaryParity', true], ['sourceMutationsDetected', false],
    ['stageMutationsDetected', false], ['realReferenceFixtureAvailable', false], ['physicalMachineAcceptanceVerified', false],
    ['readyForApplicationIntegration', false], ['readyForProductionRelease', false], ['Base44Invoked', false],
    ['applicationConnected', false], ['browserDownloadCreated', false],
  ])('reports accepted field %s', (key, value) => expect(createEndToEndPipelineDiagnostic({ request: accepted.result.request, pipelineResult: accepted.result })[key]).toBe(value));
  it('reports eleven fingerprints', () => expect(Object.keys(accepted.result.diagnostic.stageFingerprints)).toHaveLength(11));
  it('reports all accepted stages completed', () => expect(accepted.result.diagnostic.stageStatusDistribution.completed).toBe(11));
  it('reports first blocked stage', () => expect(blocked.result.diagnostic.firstBlockingStageId).toBe('region_ingestion'));
  it('reports downstream skips', () => expect(blocked.result.diagnostic.stageStatusDistribution.skipped).toBe(10));
  it('freezes diagnostic root', () => expect(Object.isFrozen(accepted.result.diagnostic)).toBe(true));
  it('freezes stage fingerprints', () => expect(Object.isFrozen(accepted.result.diagnostic.stageFingerprints)).toBe(true));
});

describe('Phase 13A1 review-policy diagnostics', () => {
  let diagnostic;
  beforeAll(() => { const fixture = createUnresolvedReviewEndToEndFixture(); diagnostic = createEndToEndPipelineDiagnostic({ request: fixture.result.request, pipelineResult: fixture.result }); }, 60000);
  it.each([
    ['reviewRequired', true], ['reviewPolicyBlocked', true], ['reviewPolicyReasonCode', 'EXPLICIT_REVIEW_REQUIRED'],
    ['unresolvedReviewDecisionCount', 3], ['deferredReviewDecisionCount', 3], ['blockedReviewDecisionCount', 0],
    ['materializedDraftCount', 0], ['partialReviewExportPrevented', true], ['downstreamInvocationAfterReviewBlockCount', 0],
    ['firstBlockingStageId', 'draft_materialization'], ['canonicalCommandCount', 0], ['machineCommandCount', 0],
    ['binaryAccepted', false], ['binaryByteLength', 0],
  ])('reports review diagnostic field %s', (key, expected) => expect(diagnostic[key]).toBe(expected));
  it('includes immutable review readiness', () => expect(Object.isFrozen(diagnostic.reviewReadiness)).toBe(true));
  it('includes all affected proposal IDs', () => expect(diagnostic.reviewReadiness.affectedProposalIds).toHaveLength(3));
  it('includes all affected region IDs', () => expect(diagnostic.reviewReadiness.affectedRegionIds).toHaveLength(3));
  it('reports policy-blocked outcome distribution', () => expect(diagnostic.stageOutcomeDistribution.policy_blocked).toBe(1));
  it('reports seven skipped stages', () => expect(diagnostic.stageStatusDistribution.skipped).toBe(7));
});
