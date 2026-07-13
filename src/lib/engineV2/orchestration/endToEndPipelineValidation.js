import { validateRegionV2 } from '../modelValidation.js';
import { ENGINE_V2_END_TO_END_STAGE_REGISTRY } from './endToEndStageRegistry.js';
import { ENGINE_V2_PIPELINE_OUTCOME_CATEGORIES, ENGINE_V2_PIPELINE_STAGE_STATUSES, normalizeEngineV2BinaryFormat, pipelineStageResultId } from './endToEndPipelineModel.js';
import { fingerprintEngineV2Value } from './deterministicStageFingerprint.js';

const issue = (code, path, message) => ({ code, path, message });
const fingerprintPattern = /^[0-9a-f]{8}$/;

export function validateEngineV2RegionToBinaryRequest(request) {
  const errors = [];
  if (!Array.isArray(request?.regions) || request.regions.length === 0) errors.push(issue('ENGINE_V2_REGIONS_REQUIRED', 'regions', 'At least one RegionV2 is required.'));
  (request?.regions || []).forEach((region, index) => errors.push(...validateRegionV2(region).errors.map(error => ({ ...error, path: `regions[${index}].${error.path}` }))));
  ['width', 'height'].forEach(key => { if (!Number.isFinite(request?.designSizeMm?.[key]) || request.designSizeMm[key] <= 0) errors.push(issue('ENGINE_V2_DESIGN_SIZE_INVALID', `designSizeMm.${key}`, `${key} must be finite and positive.`)); });
  if (!request?.format) errors.push(issue('ENGINE_V2_BINARY_FORMAT_REQUIRED', 'format', 'Explicit DST or DSB format is required.'));
  else if (!['DST', 'DSB'].includes(normalizeEngineV2BinaryFormat(request.format))) errors.push(issue('ENGINE_V2_BINARY_FORMAT_UNSUPPORTED', 'format', `Unsupported format ${request.format}.`));
  if (!fingerprintPattern.test(request?.sourceFingerprint || '')) errors.push(issue('ENGINE_V2_SOURCE_FINGERPRINT_INVALID', 'sourceFingerprint', 'Source fingerprint must be deterministic hexadecimal text.'));
  const expectedId = `engine-v2-run:${request?.format || 'missing'}:${request?.sourceFingerprint}`;
  if (request?.id !== expectedId) errors.push(issue('ENGINE_V2_REQUEST_ID_NONDETERMINISTIC', 'id', 'Request ID differs from its deterministic value.'));
  if (request?.sourceFingerprint && request.sourceFingerprint !== fingerprintEngineV2Value({ regions: request.regions, designSizeMm: request.designSizeMm, stageConfig: request.stageConfig, provenance: request.provenance })) errors.push(issue('ENGINE_V2_SOURCE_FINGERPRINT_MISMATCH', 'sourceFingerprint', 'Source fingerprint differs from request content.'));
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function validateEngineV2PipelineStageResult(stageResult) {
  const errors = [];
  const definition = ENGINE_V2_END_TO_END_STAGE_REGISTRY[stageResult?.sequenceIndex];
  if (!definition || definition.id !== stageResult?.stageId) errors.push(issue('PIPELINE_STAGE_REGISTRY_MISMATCH', 'stageId', 'Stage result does not match the fixed registry.'));
  if (stageResult?.id !== pipelineStageResultId(stageResult?.sequenceIndex, stageResult?.stageId)) errors.push(issue('PIPELINE_STAGE_RESULT_ID_INVALID', 'id', 'Stage result ID is not deterministic.'));
  if (!ENGINE_V2_PIPELINE_STAGE_STATUSES.includes(stageResult?.status)) errors.push(issue('PIPELINE_STAGE_STATUS_INVALID', 'status', 'Stage status is invalid.'));
  if (!ENGINE_V2_PIPELINE_OUTCOME_CATEGORIES.includes(stageResult?.outcomeCategory)) errors.push(issue('PIPELINE_STAGE_OUTCOME_INVALID', 'outcomeCategory', 'Stage outcome is invalid.'));
  if (!fingerprintPattern.test(stageResult?.inputFingerprint || '') || !fingerprintPattern.test(stageResult?.outputFingerprint || '')) errors.push(issue('PIPELINE_STAGE_FINGERPRINT_MISSING', 'fingerprint', 'Input and output fingerprints are required.'));
  if (stageResult?.status === 'completed' && stageResult.result == null) errors.push(issue('COMPLETED_STAGE_RESULT_MISSING', 'result', 'Completed stage requires its direct result.'));
  if (stageResult?.status === 'blocked' && stageResult.valid) errors.push(issue('BLOCKED_STAGE_MARKED_VALID', 'valid', 'Blocked stage cannot be valid.'));
  if (stageResult?.status === 'skipped' && (stageResult.result != null || stageResult.outcomeCategory !== 'upstream_blocked')) errors.push(issue('SKIPPED_STAGE_INCONSISTENT', 'status', 'Skipped stage must have upstream_blocked outcome and no result.'));
  if (stageResult?.status !== 'skipped' && stageResult.outcomeCategory === 'upstream_blocked') errors.push(issue('INVOKED_STAGE_MARKED_UPSTREAM_BLOCKED', 'outcomeCategory', 'Invoked stage cannot be upstream-blocked.'));
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function validateEngineV2RegionToBinaryResult(result) {
  const errors = [];
  const stages = result?.stageResults || []; const registry = result?.stageRegistry || [];
  if (registry.length !== 11 || stages.length !== 11) errors.push(issue('PIPELINE_STAGE_COVERAGE_INCOMPLETE', 'stageResults', 'Exactly eleven registry entries and stage results are required.'));
  const ids = stages.map(stage => stage.stageId);
  if (new Set(ids).size !== ids.length) errors.push(issue('DUPLICATE_PIPELINE_STAGE_RESULT', 'stageResults', 'Stage IDs must be unique.'));
  stages.forEach((stage, index) => {
    errors.push(...validateEngineV2PipelineStageResult(stage).errors.map(error => ({ ...error, path: `stageResults[${index}].${error.path}` })));
    if (registry[index]?.id !== ENGINE_V2_END_TO_END_STAGE_REGISTRY[index]?.id || stage.stageId !== registry[index]?.id || stage.sequenceIndex !== index) errors.push(issue('PIPELINE_STAGE_ORDER_MUTATED', `stageResults[${index}]`, 'Stage order differs from the fixed registry.'));
  });
  const firstBlocked = stages.findIndex(stage => stage.status === 'blocked');
  if (firstBlocked >= 0 && stages.slice(firstBlocked + 1).some(stage => stage.status !== 'skipped')) errors.push(issue('DOWNSTREAM_STAGE_EXECUTED_AFTER_BLOCK', 'stageResults', 'Downstream stages must be skipped after a block.'));
  if (firstBlocked < 0 && stages.some(stage => stage.status === 'skipped')) errors.push(issue('STAGE_SKIPPED_WITHOUT_BLOCKER', 'stageResults', 'A stage was skipped without an upstream blocker.'));
  const summary = result?.summary || {};
  if (summary.pipelineStageDispositionCoveragePercent !== 100 || summary.silentPipelineStageDropCount !== 0 || summary.duplicatePipelineStageResultCount !== 0) errors.push(issue('PIPELINE_STAGE_DISPOSITION_INCOMPLETE', 'summary', 'Stage disposition coverage must remain complete.'));
  if (summary.crossStageReferenceCoveragePercent !== 100 || summary.crossStageReferenceMismatchCount !== 0) errors.push(issue('CROSS_STAGE_REFERENCE_COVERAGE_INCOMPLETE', 'summary', 'Cross-stage references must remain complete.'));
  ['sourceRequestMutationCount', 'stageInputMutationCount', 'stageOrderMutationCount', 'objectOrderMutationCount', 'threadBlockOrderMutationCount', 'threadIdMutationCount', 'geometryMutationCount', 'holeMutationCount', 'visualColorMutationCount', 'Base44InvocationCount', 'applicationInvocationCount', 'browserDownloadCreationCount'].forEach(key => { if (summary[key] !== 0) errors.push(issue('END_TO_END_INVARIANT_MUTATED', `summary.${key}`, `${key} must remain zero.`)); });
  if (summary.realReferenceFixtureAvailable || summary.realReferenceFixtureCaptured || summary.physicalMachineAcceptanceVerified || summary.readyForApplicationIntegration || summary.readyForProductionRelease) errors.push(issue('END_TO_END_READINESS_CLAIM_FORBIDDEN', 'summary', 'Phase 13A cannot claim real, physical, application, or production readiness.'));
  if (result?.pipelineCompleted && firstBlocked >= 0) errors.push(issue('PIPELINE_COMPLETED_WITH_INTERNAL_BLOCK', 'pipelineCompleted', 'An internally blocked pipeline cannot be complete.'));
  if (result?.policyBlocked && result?.binaryAccepted) errors.push(issue('POLICY_BLOCKED_BINARY_ACCEPTED', 'binaryAccepted', 'Policy-blocked binary cannot be accepted.'));
  return { valid: errors.length === 0, errors, warnings: [] };
}
