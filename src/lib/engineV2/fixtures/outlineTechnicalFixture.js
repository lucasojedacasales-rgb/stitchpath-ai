import { createSyntheticTechnicalMaterialization, createSyntheticTechnicalObject } from './tatamiTechnicalFixture.js';

export function createOutlineTechnicalFixture() {
  const first = createSyntheticTechnicalObject('outline-first', { stitchType: 'running', role: 'outer_outline', geometry: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }], technicalIntent: { geometryType: 'closed_path', lineIntent: true }, technicalGeometryIntent: 'closed_path' });
  const second = createSyntheticTechnicalObject('outline-second', { stitchType: 'running', role: 'outer_outline', geometry: [{ x: 10, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 5 }, { x: 10, y: 5 }], technicalIntent: { geometryType: 'closed_path', lineIntent: true }, technicalGeometryIntent: 'closed_path' });
  return { first, second, ...createSyntheticTechnicalMaterialization([first, second]) };
}
