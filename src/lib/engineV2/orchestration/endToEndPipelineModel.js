import { fingerprintEngineV2Value } from './deterministicStageFingerprint.js';

const clone = value => value == null ? value : structuredClone(value);
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value) || ArrayBuffer.isView(value) || value instanceof ArrayBuffer || (typeof Blob !== 'undefined' && value instanceof Blob)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export const ENGINE_V2_PIPELINE_STAGE_STATUSES = Object.freeze(['completed', 'blocked', 'skipped']);
export const ENGINE_V2_PIPELINE_OUTCOME_CATEGORIES = Object.freeze(['accepted', 'policy_blocked', 'validation_failed', 'upstream_blocked', 'not_executed']);

export function normalizeEngineV2BinaryFormat(format) {
  return typeof format === 'string' && format.trim() ? format.trim().toUpperCase() : null;
}

export function createEngineV2RegionToBinaryRequest(input = {}) {
  const format = normalizeEngineV2BinaryFormat(input.format);
  const regions = clone(input.regions ?? []);
  const designSizeMm = clone(input.designSizeMm ?? {});
  const stageConfig = clone(input.stageConfig ?? {});
  const provenance = clone(input.provenance ?? {});
  const sourceFingerprint = input.sourceFingerprint ?? fingerprintEngineV2Value({ regions, designSizeMm, stageConfig, provenance });
  return deepFreeze({
    id: input.id ?? `engine-v2-run:${format || 'missing'}:${sourceFingerprint}`,
    regions,
    designSizeMm,
    format,
    metadata: clone(input.metadata ?? {}),
    provenance,
    stageConfig,
    sourceFingerprint,
  });
}

export function createEngineV2PipelineStageDefinition(input = {}) {
  return deepFreeze({
    id: input.id ?? null,
    sequenceIndex: Number.isInteger(input.sequenceIndex) ? input.sequenceIndex : null,
    inputContract: input.inputContract ?? null,
    outputContract: input.outputContract ?? null,
    transactional: input.transactional !== false,
    sourceModule: input.sourceModule ?? null,
  });
}

export function pipelineStageResultId(sequenceIndex, stageId) {
  return `pipeline-stage:${String(sequenceIndex).padStart(2, '0')}:${stageId}`;
}

export function createEngineV2PipelineStageResult(input = {}) {
  const sequenceIndex = Number.isInteger(input.sequenceIndex) ? input.sequenceIndex : null;
  return deepFreeze({
    id: input.id ?? pipelineStageResultId(sequenceIndex, input.stageId),
    stageId: input.stageId ?? null,
    sequenceIndex,
    status: input.status ?? 'skipped',
    outcomeCategory: input.outcomeCategory ?? 'not_executed',
    inputFingerprint: input.inputFingerprint ?? null,
    outputFingerprint: input.outputFingerprint ?? null,
    inputCount: Number.isInteger(input.inputCount) ? input.inputCount : 0,
    outputCount: Number.isInteger(input.outputCount) ? input.outputCount : 0,
    valid: input.valid === true,
    errors: clone(input.errors ?? []),
    warnings: clone(input.warnings ?? []),
    summary: clone(input.summary ?? {}),
    result: clone(input.result ?? null),
    source: clone(input.source ?? null),
  });
}

export function createEngineV2RegionToBinaryResult(input = {}) {
  return deepFreeze({
    version: input.version ?? '2-region-to-binary-orchestrator',
    request: clone(input.request ?? null),
    stageRegistry: clone(input.stageRegistry ?? []),
    stageResults: clone(input.stageResults ?? []),
    regionIngestion: clone(input.regionIngestion ?? null),
    semanticAnalysis: clone(input.semanticAnalysis ?? null),
    objectPlanning: clone(input.objectPlanning ?? null),
    draftMaterialization: clone(input.draftMaterialization ?? null),
    threadResolution: clone(input.threadResolution ?? null),
    technicalPlanning: clone(input.technicalPlanning ?? null),
    globalSequence: clone(input.globalSequence ?? null),
    physicalGeneration: clone(input.physicalGeneration ?? null),
    canonicalCompilation: clone(input.canonicalCompilation ?? null),
    machineAdaptation: clone(input.machineAdaptation ?? null),
    binaryExport: clone(input.binaryExport ?? null),
    referenceCaptureManifest: clone(input.referenceCaptureManifest ?? null),
    valid: input.valid === true,
    pipelineCompleted: input.pipelineCompleted === true,
    binaryAccepted: input.binaryAccepted === true,
    policyBlocked: input.policyBlocked === true,
    firstBlockingStageId: input.firstBlockingStageId ?? null,
    errors: clone(input.errors ?? []),
    warnings: clone(input.warnings ?? []),
    summary: clone(input.summary ?? {}),
    config: clone(input.config ?? {}),
    metadata: clone(input.metadata ?? {}),
    diagnostic: clone(input.diagnostic ?? null),
  });
}
