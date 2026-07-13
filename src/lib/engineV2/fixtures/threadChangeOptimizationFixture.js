import { createSequenceTechnicalFixture, createSyntheticTechnicalObject } from './simpleSequenceFixture.js';

export function createThreadChangeOptimizationFixture() {
  const greenLeft = createSyntheticTechnicalObject('green-left', { threadId: 'thread:synthetic:green', geometry: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }] });
  const redCenter = createSyntheticTechnicalObject('red-center', { threadId: 'thread:synthetic:red', visualColor: '#CC3344', geometry: [{ x: 7, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 5 }, { x: 7, y: 5 }] });
  const greenRight = createSyntheticTechnicalObject('green-right', { threadId: 'thread:synthetic:green', geometry: [{ x: 14, y: 0 }, { x: 19, y: 0 }, { x: 19, y: 5 }, { x: 14, y: 5 }] });
  return createSequenceTechnicalFixture([redCenter, greenRight, greenLeft]);
}
