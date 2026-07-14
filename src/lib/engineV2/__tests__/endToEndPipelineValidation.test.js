import { beforeAll, describe, expect, it } from 'vitest';
import { createEndToEndDSTFixture } from '../fixtures/endToEndDSTFixture.js';
import { createEndToEndDSBStrictFixture } from '../fixtures/endToEndDSBStrictFixture.js';
import { createEndToEndRegionFixture } from '../fixtures/endToEndRegionFixture.js';
import { createUnresolvedReviewEndToEndFixture } from '../fixtures/unresolvedReviewPolicyFixture.js';
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

describe('Phase 13A1 review-policy orchestration validation', () => {
  let blocked;
  beforeAll(() => { blocked = createUnresolvedReviewEndToEndFixture().result; }, 60000);
  const mutate = callback => { const value = structuredClone(blocked); callback(value); return value; };
  it('accepts a correctly review-blocked result', () => expect(validateEngineV2RegionToBinaryResult(blocked).valid).toBe(true));
  it('detects downstream execution after review block', () => { const value = mutate(result => { result.stageResults[4] = { ...result.stageResults[4], status: 'completed', outcomeCategory: 'accepted', valid: true, result: {} }; }); expect(codes(validateEngineV2RegionToBinaryResult(value))).toContain('DOWNSTREAM_INVOKED_AFTER_UNRESOLVED_REVIEW'); });
  it('detects intermediate policy block marked completed', () => { const value = mutate(result => { result.stageResults[3].status = 'completed'; result.stageResults[3].valid = true; }); expect(codes(validateEngineV2RegionToBinaryResult(value))).toContain('INTERMEDIATE_POLICY_BLOCK_MARKED_COMPLETED'); });
  it('detects nontransactional intermediate policy blocking', () => { const value = mutate(result => { result.stageResults[8] = { ...result.stageResults[8], status: 'completed', outcomeCategory: 'accepted', valid: true, result: { commands: [] } }; }); expect(codes(validateEngineV2RegionToBinaryResult(value))).toContain('INTERMEDIATE_POLICY_BLOCK_NOT_TRANSACTIONAL'); });
  it('detects deferred review with a binary artifact', () => { const value = mutate(result => { result.binaryExport = { artifact: { bytes: [1] } }; }); expect(codes(validateEngineV2RegionToBinaryResult(value))).toContain('DEFERRED_REVIEW_BINARY_ARTIFACT'); });
  it('detects blocked review with a binary artifact', () => { const value = mutate(result => { result.stageResults[3].summary.reviewReadiness.deferredDecisionCount = 0; result.stageResults[3].summary.reviewReadiness.blockedDecisionCount = 1; result.binaryExport = { artifact: { bytes: [1] } }; }); expect(codes(validateEngineV2RegionToBinaryResult(value))).toContain('BLOCKED_REVIEW_BINARY_ARTIFACT'); });
  it('detects no-draft canonical compilation', () => { const value = mutate(result => { result.stageResults[8] = { ...result.stageResults[8], status: 'completed', outcomeCategory: 'accepted', valid: true, result: { commands: [] } }; }); expect(codes(validateEngineV2RegionToBinaryResult(value))).toContain('EMPTY_DRAFT_CANONICAL_COMPILATION'); });
  it('detects review policy reported as validation failure', () => { const value = mutate(result => { result.stageResults[3].outcomeCategory = 'validation_failed'; }); expect(codes(validateEngineV2RegionToBinaryResult(value))).toContain('REVIEW_POLICY_REPORTED_AS_VALIDATION_FAILURE'); });
  it('detects missing affected proposal IDs', () => { const value = mutate(result => { result.stageResults[3].summary.reviewReadiness.affectedProposalIds = []; }); expect(codes(validateEngineV2RegionToBinaryResult(value))).toContain('REVIEW_POLICY_AFFECTED_IDS_MISSING'); });
  it('detects missing affected region IDs', () => { const value = mutate(result => { result.stageResults[3].summary.reviewReadiness.affectedRegionIds = []; }); expect(codes(validateEngineV2RegionToBinaryResult(value))).toContain('REVIEW_POLICY_AFFECTED_IDS_MISSING'); });
  it('detects proposal result mutation', () => { const value = mutate(result => { result.objectPlanning.proposals = []; }); expect(codes(validateEngineV2RegionToBinaryResult(value))).toContain('PROPOSAL_RESULT_MUTATION'); });
  it('detects draft result mutation', () => { const value = mutate(result => { result.draftMaterialization.decisions = []; }); expect(codes(validateEngineV2RegionToBinaryResult(value))).toContain('DRAFT_RESULT_MUTATION'); });
  it('detects review decision count mutation', () => { const value = mutate(result => { result.stageResults[3].summary.reviewReadiness.deferredDecisionCount = 0; }); expect(codes(validateEngineV2RegionToBinaryResult(value))).toContain('REVIEW_DECISION_MUTATION'); });
  it('detects materialized draft count mutation', () => { const value = mutate(result => { result.stageResults[3].summary.reviewReadiness.materializedDraftCount = 1; }); expect(codes(validateEngineV2RegionToBinaryResult(value))).toContain('DRAFT_COUNT_MUTATION'); });
  it('preserves DSB final policy validation', () => expect(validateEngineV2RegionToBinaryResult(createEndToEndDSBStrictFixture().result).valid).toBe(true));
  it('preserves DST accepted validation', () => expect(validateEngineV2RegionToBinaryResult(createEndToEndDSTFixture().result).valid).toBe(true));
});
