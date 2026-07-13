import { createSyntheticTechnicalMaterialization, createSyntheticTechnicalObject } from './tatamiTechnicalFixture.js';

export function createEntryExitCandidateFixture() {
  const object = createSyntheticTechnicalObject('candidate-hole', { holes: [[{ x: 8, y: 3 }, { x: 12, y: 3 }, { x: 12, y: 7 }, { x: 8, y: 7 }]] });
  return { object, holePoint: { x: 10, y: 5 }, validInteriorPoint: { x: 4, y: 5 }, ...createSyntheticTechnicalMaterialization([object]) };
}
