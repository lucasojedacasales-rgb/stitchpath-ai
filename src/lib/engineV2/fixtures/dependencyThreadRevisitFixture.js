import { createSequenceTechnicalFixture, createSyntheticTechnicalObject } from './simpleSequenceFixture.js';

export function createDependencyThreadRevisitFixture() {
  const greenBase = createSyntheticTechnicalObject('revisit-green-base', { threadId: 'thread:synthetic:green' });
  const redMiddle = createSyntheticTechnicalObject('revisit-red-middle', { threadId: 'thread:synthetic:red', visualColor: '#CC3344', dependencyIds: [greenBase.id], layer: 1, geometry: [{ x: 4, y: 3 }, { x: 16, y: 3 }, { x: 16, y: 7 }, { x: 4, y: 7 }] });
  const greenTop = createSyntheticTechnicalObject('revisit-green-top', { threadId: 'thread:synthetic:green', dependencyIds: [redMiddle.id], layer: 2, geometry: [{ x: 6, y: 4 }, { x: 14, y: 4 }, { x: 14, y: 6 }, { x: 6, y: 6 }] });
  return createSequenceTechnicalFixture([greenTop, redMiddle, greenBase]);
}
