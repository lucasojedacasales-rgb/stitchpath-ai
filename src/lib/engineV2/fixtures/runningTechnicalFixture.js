import { createSyntheticTechnicalMaterialization, createSyntheticTechnicalObject } from './tatamiTechnicalFixture.js';

export function createRunningTechnicalFixture() {
  const open = createSyntheticTechnicalObject('running-open', { stitchType: 'running', role: 'internal_detail', geometry: [{ x: 0, y: 0 }, { x: 5, y: 2 }, { x: 10, y: 0 }], technicalIntent: { geometryType: 'open_path', lineIntent: true }, technicalGeometryIntent: 'open_path' });
  const closedOutline = createSyntheticTechnicalObject('running-outline', { stitchType: 'running', role: 'outer_outline', geometry: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }], technicalIntent: { geometryType: 'closed_path', lineIntent: true }, technicalGeometryIntent: 'closed_path' });
  const broadPolygon = createSyntheticTechnicalObject('running-broad', { stitchType: 'running', role: 'internal_detail', geometry: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }], technicalIntent: { geometryType: 'region_polygon' }, technicalGeometryIntent: 'region_polygon' });
  const manual = createSyntheticTechnicalObject('manual', { stitchType: 'manual', role: 'internal_detail' });
  return { open, closedOutline, broadPolygon, manual, ...createSyntheticTechnicalMaterialization([open, closedOutline, broadPolygon, manual]) };
}
