import { createSyntheticTechnicalMaterialization, createSyntheticTechnicalObject } from './tatamiTechnicalFixture.js';

export function createTechnicalBlockingFixture() {
  const invalid = createSyntheticTechnicalObject('blocking-invalid', { geometry: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }] });
  const manual = createSyntheticTechnicalObject('blocking-manual', { stitchType: 'manual', role: 'internal_detail' });
  const broadRunning = createSyntheticTechnicalObject('blocking-running', { stitchType: 'running', role: 'internal_detail', technicalIntent: { geometryType: 'region_polygon' }, technicalGeometryIntent: 'region_polygon' });
  return { invalid, manual, broadRunning, ...createSyntheticTechnicalMaterialization([invalid, manual, broadRunning]) };
}
