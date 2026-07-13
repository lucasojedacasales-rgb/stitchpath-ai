import { beforeAll, describe, expect, it } from 'vitest';
import { createEndToEndDSTFixture } from '../fixtures/endToEndDSTFixture.js';
import { createEndToEndRegionFixture } from '../fixtures/endToEndRegionFixture.js';
import { createEngineV2PipelineStageResult, createEngineV2RegionToBinaryRequest } from '../orchestration/endToEndPipelineModel.js';
import { validateEngineV2PipelineStageResult, validateEngineV2RegionToBinaryRequest, validateEngineV2RegionToBinaryResult } from '../orchestration/endToEndPipelineValidation.js';

const codes = value => value.errors.map(error => error.code);

describe('Phase 13A end-to-end validation', () => {
  let validResult;
  beforeAll(() => { validResult = createEndToEndDSTFixture().result; }, 60000);
  it('accepts a valid request', () => expect(validateEngineV2RegionToBinaryRequest(validResult.request).valid).toBe(true));
  it('accepts a valid result', () => expect(validateEngineV2RegionToBinaryResult(validResult).valid).toBe(true));
  it.each([['width', 0], ['height', -1], ['width', Number.NaN], ['height', Infinity]])('rejects invalid design %s=%s', (key, value) => { const fixture = createEndToEndRegionFixture({ designSizeMm: { width: 30, height: 35, [key]: value } }); expect(codes(validateEngineV2RegionToBinaryRequest(createEngineV2RegionToBinaryRequest(fixture)))).toContain('ENGINE_V2_DESIGN_SIZE_INVALID'); });
  it.each([[null, 'ENGINE_V2_BINARY_FORMAT_REQUIRED'], ['PES', 'ENGINE_V2_BINARY_FORMAT_UNSUPPORTED']])('rejects invalid format %#', (format, code) => { const request = createEngineV2RegionToBinaryRequest({ ...createEndToEndRegionFixture(), format }); expect(codes(validateEngineV2RegionToBinaryRequest(request))).toContain(code); });
  it('rejects empty regions', () => { const request = createEngineV2RegionToBinaryRequest(createEndToEndRegionFixture({ regions: [] })); expect(codes(validateEngineV2RegionToBinaryRequest(request))).toContain('ENGINE_V2_REGIONS_REQUIRED'); });
  it('rejects mismatched request ID', () => expect(codes(validateEngineV2RegionToBinaryRequest({ ...validResult.request, id: 'wrong' }))).toContain('ENGINE_V2_REQUEST_ID_NONDETERMINISTIC'));
  it('rejects mismatched source fingerprint', () => expect(codes(validateEngineV2RegionToBinaryRequest({ ...validResult.request, sourceFingerprint: '12345678', id: `engine-v2-run:DST:12345678` }))).toContain('ENGINE_V2_SOURCE_FINGERPRINT_MISMATCH'));

  const baseStage = { stageId: 'region_ingestion', sequenceIndex: 0, status: 'completed', outcomeCategory: 'accepted', inputFingerprint: '12345678', outputFingerprint: 'abcdef01', valid: true, result: { valid: true } };
  it('accepts a valid stage result', () => expect(validateEngineV2PipelineStageResult(createEngineV2PipelineStageResult(baseStage)).valid).toBe(true));
  it.each([
    [{ stageId: 'wrong' }, 'PIPELINE_STAGE_REGISTRY_MISMATCH'],
    [{ id: 'wrong' }, 'PIPELINE_STAGE_RESULT_ID_INVALID'],
    [{ status: 'unknown' }, 'PIPELINE_STAGE_STATUS_INVALID'],
    [{ outcomeCategory: 'unknown' }, 'PIPELINE_STAGE_OUTCOME_INVALID'],
    [{ inputFingerprint: null }, 'PIPELINE_STAGE_FINGERPRINT_MISSING'],
    [{ outputFingerprint: null }, 'PIPELINE_STAGE_FINGERPRINT_MISSING'],
    [{ result: null }, 'COMPLETED_STAGE_RESULT_MISSING'],
    [{ status: 'blocked', valid: true }, 'BLOCKED_STAGE_MARKED_VALID'],
    [{ status: 'skipped', outcomeCategory: 'accepted', valid: false, result: null }, 'SKIPPED_STAGE_INCONSISTENT'],
    [{ outcomeCategory: 'upstream_blocked' }, 'INVOKED_STAGE_MARKED_UPSTREAM_BLOCKED'],
  ])('detects stage contract violation %#', (override, code) => expect(codes(validateEngineV2PipelineStageResult({ ...createEngineV2PipelineStageResult(baseStage), ...override }))).toContain(code));
  it.each(['sourceRequestMutationCount', 'stageInputMutationCount', 'stageOrderMutationCount', 'objectOrderMutationCount', 'threadBlockOrderMutationCount', 'threadIdMutationCount', 'geometryMutationCount', 'holeMutationCount', 'visualColorMutationCount', 'Base44InvocationCount', 'applicationInvocationCount', 'browserDownloadCreationCount'])('rejects nonzero result invariant %s', key => { const mutated = { ...validResult, summary: { ...validResult.summary, [key]: 1 } }; expect(codes(validateEngineV2RegionToBinaryResult(mutated))).toContain('END_TO_END_INVARIANT_MUTATED'); });
  it.each(['realReferenceFixtureAvailable', 'realReferenceFixtureCaptured', 'physicalMachineAcceptanceVerified', 'readyForApplicationIntegration', 'readyForProductionRelease'])('rejects readiness claim %s', key => { const mutated = { ...validResult, summary: { ...validResult.summary, [key]: true } }; expect(codes(validateEngineV2RegionToBinaryResult(mutated))).toContain('END_TO_END_READINESS_CLAIM_FORBIDDEN'); });
});
