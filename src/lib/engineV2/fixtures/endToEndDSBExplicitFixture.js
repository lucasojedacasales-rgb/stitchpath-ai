import { runEngineV2RegionToBinary } from '../orchestration/regionToBinaryOrchestrator.js';
import { createEndToEndRegionFixture } from './endToEndRegionFixture.js';
import { explicitDSBTrimNoOutputConfig } from './dsbTrimPolicyFixture.js';

export function createEndToEndDSBExplicitFixture(overrides = {}) {
  const request = createEndToEndRegionFixture({ ...overrides, format: overrides.format ?? 'DSB', stageConfig: overrides.stageConfig ?? { binaryExport: { formatConfig: explicitDSBTrimNoOutputConfig({ label: 'PHASE13A' }) } } });
  return { request, result: runEngineV2RegionToBinary(request) };
}
