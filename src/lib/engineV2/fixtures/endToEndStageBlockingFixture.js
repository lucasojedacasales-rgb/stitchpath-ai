import { createRegionV2 } from '../model.js';
import { runEngineV2RegionToBinary } from '../orchestration/regionToBinaryOrchestrator.js';
import { createEndToEndRegionFixture } from './endToEndRegionFixture.js';

export function createEndToEndStageBlockingFixture(kind = 'invalid_region') {
  const overrides = {};
  if (kind === 'invalid_region') overrides.regions = [createRegionV2({ id: 'invalid', geometry: [{ x: 0, y: 0 }], visualColor: '#000000' })];
  if (kind === 'invalid_design_size') overrides.designSizeMm = { width: 0, height: 35 };
  if (kind === 'semantic_analysis') overrides.stageConfig = { semantics: { minimumAcceptedConfidence: 2 } };
  if (kind === 'object_planning') overrides.stageConfig = { objectPlanning: { minimumPlanningConfidence: 2 } };
  if (kind === 'draft_materialization') overrides.stageConfig = { review: { minimumAutoAcceptConfidence: 2 } };
  if (kind === 'thread_resolution') overrides.stageConfig = { threadResolution: { policy: 'unsupported' } };
  if (kind === 'technical_planning') overrides.stageConfig = { technicalPlanning: { profile: 'unsupported' } };
  if (kind === 'global_sequence') overrides.stageConfig = { sequencing: { exactSearchObjectLimit: 0 } };
  if (kind === 'physical_generation') overrides.stageConfig = { physicalGeneration: { maximumTotalPoints: 0 } };
  if (kind === 'canonical_compilation') overrides.stageConfig = { canonicalCompilation: { coordinatePrecisionDecimals: -1 } };
  if (kind === 'machine_adaptation') overrides.stageConfig = { machineAdaptation: { machineProfile: 'unsupported' } };
  if (kind === 'missing_format') overrides.format = null;
  if (kind === 'unsupported_format') overrides.format = 'PES';
  const request = createEndToEndRegionFixture(overrides);
  if (kind === 'missing_format') request.format = null;
  return { kind, request, result: runEngineV2RegionToBinary(request) };
}
