import { createSyntheticTechnicalMaterialization, createSyntheticTechnicalObject } from './tatamiTechnicalFixture.js';

export function createSatinTechnicalFixture() {
  const valid = createSyntheticTechnicalObject('satin-valid', { stitchType: 'satin', role: 'internal_detail', geometry: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 3 }, { x: 0, y: 3 }] });
  const narrow = createSyntheticTechnicalObject('satin-narrow', { stitchType: 'satin', role: 'internal_detail', geometry: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 0.5 }, { x: 0, y: 0.5 }] });
  const wide = createSyntheticTechnicalObject('satin-wide', { stitchType: 'satin', role: 'internal_detail', geometry: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }] });
  const variable = createSyntheticTechnicalObject('satin-variable', { stitchType: 'satin', role: 'internal_detail', geometry: [{ x: 0, y: -1 }, { x: 12, y: -4 }, { x: 12, y: 4 }, { x: 0, y: 1 }] });
  return { valid, narrow, wide, variable, ...createSyntheticTechnicalMaterialization([valid, narrow, wide, variable]) };
}
