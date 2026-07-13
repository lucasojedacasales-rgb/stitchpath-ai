import { createSequenceTechnicalFixture, createSyntheticTechnicalObject } from './simpleSequenceFixture.js';

export function createSequenceTieFixture() {
  const alpha = createSyntheticTechnicalObject('tie-alpha', { threadId: 'thread:synthetic:green', geometry: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }] });
  const beta = createSyntheticTechnicalObject('tie-beta', { threadId: 'thread:synthetic:green', geometry: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }] });
  return createSequenceTechnicalFixture([beta, alpha]);
}
