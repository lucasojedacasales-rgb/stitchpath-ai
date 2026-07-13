import { createSequenceTechnicalFixture, createSyntheticTechnicalObject } from './simpleSequenceFixture.js';

export function createCandidateTravelFixture() {
  const left = createSyntheticTechnicalObject('candidate-left', { threadId: 'thread:synthetic:green', geometry: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] });
  const right = createSyntheticTechnicalObject('candidate-right', { threadId: 'thread:synthetic:green', geometry: [{ x: 12, y: 0 }, { x: 22, y: 0 }, { x: 22, y: 10 }, { x: 12, y: 10 }] });
  return createSequenceTechnicalFixture([right, left]);
}
