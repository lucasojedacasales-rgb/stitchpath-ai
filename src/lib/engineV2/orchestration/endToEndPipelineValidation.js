import { validateRegionV2 } from '../modelValidation.js';
import { ENGINE_V2_END_TO_END_STAGE_REGISTRY } from './endToEndStageRegistry.js';
import { ENGINE_V2_PIPELINE_OUTCOME_CATEGORIES, ENGINE_V2_PIPELINE_STAGE_STATUSES, normalizeEngineV2BinaryFormat, pipelineStageResultId } from './endToEndPipelineModel.js';
import { fingerprintEngineV2Value, stableSerializeEngineV2Value } from './deterministicStageFingerprint.js';

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
  const draftStageIndex = stages.findIndex(stage => stage.stageId === 'draft_materialization');
  const draftStage = stages[draftStageIndex];
  const readiness = draftStage?.summary?.reviewReadiness;
  const unresolvedReviewCount = readiness?.unresolvedReviewDecisionCount ?? 0;
  const laterStages = draftStageIndex < 0 ? [] : stages.slice(draftStageIndex + 1);
  if (unresolvedReviewCount > 0 && laterStages.some(stage => stage.status !== 'skipped')) errors.push(issue('DOWNSTREAM_INVOKED_AFTER_UNRESOLVED_REVIEW', 'stageResults', 'Unresolved review must skip every downstream stage.'));
  if (draftStage?.outcomeCategory === 'policy_blocked' && draftStage.status === 'completed') errors.push(issue('INTERMEDIATE_POLICY_BLOCK_MARKED_COMPLETED', 'stageResults.draft_materialization', 'Intermediate policy blocks must be blocked.'));
  if (draftStage?.status === 'blocked' && draftStage?.outcomeCategory === 'policy_blocked' && laterStages.some(stage => stage.status !== 'skipped')) errors.push(issue('INTERMEDIATE_POLICY_BLOCK_NOT_TRANSACTIONAL', 'stageResults', 'Every stage after an intermediate policy block must be skipped.'));
  if ((readiness?.deferredDecisionCount ?? 0) > 0 && result?.binaryExport?.artifact) errors.push(issue('DEFERRED_REVIEW_BINARY_ARTIFACT', 'binaryExport.artifact', 'Deferred review cannot produce a binary artifact.'));
  if ((readiness?.blockedDecisionCount ?? 0) > 0 && result?.binaryExport?.artifact) errors.push(issue('BLOCKED_REVIEW_BINARY_ARTIFACT', 'binaryExport.artifact', 'Blocked review cannot produce a binary artifact.'));
  if (unresolvedReviewCount > 0 && (readiness?.materializedDraftCount ?? 0) > 0 && result?.binaryExport?.artifact) errors.push(issue('PARTIAL_REVIEW_EXPORT_FORBIDDEN', 'binaryExport.artifact', 'A partial accepted subset cannot be exported.'));
  const canonicalStage = stages.find(stage => stage.stageId === 'canonical_compilation');
  if ((readiness?.sourceProposalCount ?? 0) > 0 && (readiness?.materializedDraftCount ?? 0) === 0 && canonicalStage?.status !== 'skipped') errors.push(issue('EMPTY_DRAFT_CANONICAL_COMPILATION', 'stageResults.canonical_compilation', 'An empty draft design cannot reach canonical compilation.'));
  if (readiness?.policyBlocked && draftStage?.outcomeCategory === 'validation_failed') errors.push(issue('REVIEW_POLICY_REPORTED_AS_VALIDATION_FAILURE', 'stageResults.draft_materialization', 'Review policy blocks must use policy_blocked outcome.'));
  if (draftStage?.outcomeCategory === 'policy_blocked' && (!(readiness?.affectedProposalIds?.length) || !(readiness?.affectedRegionIds?.length))) errors.push(issue('REVIEW_POLICY_AFFECTED_IDS_MISSING', 'stageResults.draft_materialization.summary.reviewReadiness', 'Review policy blocks require affected proposal and region IDs.'));
  const binaryStage = stages.find(stage => stage.stageId === 'binary_export');
  if (binaryStage?.outcomeCategory === 'policy_blocked' && binaryStage.status !== 'completed') errors.push(issue('FINAL_BINARY_POLICY_BLOCK_NOT_COMPLETED', 'stageResults.binary_export', 'Final binary policy blocking must remain a completed stage.'));
  const planningStage = stages.find(stage => stage.stageId === 'object_planning');
  if (planningStage?.result && result?.objectPlanning && stableSerializeEngineV2Value(planningStage.result) !== stableSerializeEngineV2Value(result.objectPlanning)) errors.push(issue('PROPOSAL_RESULT_MUTATION', 'objectPlanning', 'Preserved proposal planning output differs from its stage result.'));
  if (draftStage?.result && result?.draftMaterialization && stableSerializeEngineV2Value(draftStage.result) !== stableSerializeEngineV2Value(result.draftMaterialization)) errors.push(issue('DRAFT_RESULT_MUTATION', 'draftMaterialization', 'Preserved draft materialization output differs from its stage result.'));
  if (readiness) {
    const decisions = result?.draftMaterialization?.decisions || [];
    const actionCount = action => decisions.filter(decision => decision.action === action).length;
    if (readiness.reviewDecisionCount !== decisions.length || readiness.deferredDecisionCount !== actionCount('defer') || readiness.blockedDecisionCount !== actionCount('blocked')) errors.push(issue('REVIEW_DECISION_MUTATION', 'draftMaterialization.decisions', 'Review readiness counts differ from preserved decisions.'));
    if (readiness.materializedDraftCount !== (result?.draftMaterialization?.drafts?.length ?? 0)) errors.push(issue('DRAFT_COUNT_MUTATION', 'draftMaterialization.drafts', 'Review readiness draft count differs from preserved drafts.'));
  }
  if (summary.pipelineStageDispositionCoveragePercent !== 100 || summary.silentPipelineStageDropCount !== 0 || summary.duplicatePipelineStageResultCount !== 0) errors.push(issue('PIPELINE_STAGE_DISPOSITION_INCOMPLETE', 'summary', 'Stage disposition coverage must remain complete.'));
  if (summary.crossStageReferenceCoveragePercent !== 100 || summary.crossStageReferenceMismatchCount !== 0) errors.push(issue('CROSS_STAGE_REFERENCE_COVERAGE_INCOMPLETE', 'summary', 'Cross-stage references must remain complete.'));
  ['sourceRequestMutationCount', 'stageInputMutationCount', 'stageOrderMutationCount', 'objectOrderMutationCount', 'threadBlockOrderMutationCount', 'threadIdMutationCount', 'geometryMutationCount', 'holeMutationCount', 'visualColorMutationCount', 'Base44InvocationCount', 'applicationInvocationCount', 'browserDownloadCreationCount'].forEach(key => { if (summary[key] !== 0) errors.push(issue('END_TO_END_INVARIANT_MUTATED', `summary.${key}`, `${key} must remain zero.`)); });
  if (summary.realReferenceFixtureAvailable || summary.realReferenceFixtureCaptured || summary.physicalMachineAcceptanceVerified || summary.readyForApplicationIntegration || summary.readyForProductionRelease) errors.push(issue('END_TO_END_READINESS_CLAIM_FORBIDDEN', 'summary', 'Phase 13A cannot claim real, physical, application, or production readiness.'));
  if (result?.pipelineCompleted && firstBlocked >= 0) errors.push(issue('PIPELINE_COMPLETED_WITH_INTERNAL_BLOCK', 'pipelineCompleted', 'An internally blocked pipeline cannot be complete.'));
  if (result?.policyBlocked && result?.binaryAccepted) errors.push(issue('POLICY_BLOCKED_BINARY_ACCEPTED', 'binaryAccepted', 'Policy-blocked binary cannot be accepted.'));
  return { valid: errors.length === 0, errors, warnings: [] };
}
