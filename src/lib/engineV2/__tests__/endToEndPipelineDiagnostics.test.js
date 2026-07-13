import { beforeAll, describe, expect, it } from 'vitest';
import { createEndToEndDSTFixture } from '../fixtures/endToEndDSTFixture.js';
import { createEndToEndStageBlockingFixture } from '../fixtures/endToEndStageBlockingFixture.js';
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
