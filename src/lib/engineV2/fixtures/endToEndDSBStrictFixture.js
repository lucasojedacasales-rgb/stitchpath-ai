import { runEngineV2RegionToBinary } from '../orchestration/regionToBinaryOrchestrator.js';
import { createEndToEndRegionFixture } from './endToEndRegionFixture.js';

export function createEndToEndDSBStrictFixture(overrides = {}) {
  const request = createEndToEndRegionFixture({ ...overrides, format: overrides.format ?? 'DSB', stageConfig: overrides.stageConfig ?? { binaryExport: { formatConfig: { label: 'PHASE13A' } } } });
  return { request, result: runEngineV2RegionToBinary(request) };
}
