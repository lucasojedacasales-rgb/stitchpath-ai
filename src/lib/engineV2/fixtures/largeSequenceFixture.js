import { createSequenceTechnicalFixture, createSyntheticTechnicalObject } from './simpleSequenceFixture.js';

export function createLargeSequenceFixture(count = 10) {
  const colors = [
    ['green', '#22AA55'], ['red', '#CC3344'], ['blue', '#3366CC'], ['yellow', '#DDCC22'], ['black', '#111111'],
  ];
  const objects = Array.from({ length: count }, (_, index) => {
    const [name, visualColor] = colors[index % colors.length]; const x = index * 6;
    return createSyntheticTechnicalObject(`large-${String(index).padStart(2, '0')}`, { threadId: `thread:synthetic:${name}`, visualColor, geometry: [{ x, y: 0 }, { x: x + 5, y: 0 }, { x: x + 5, y: 5 }, { x, y: 5 }] });
  });
  return createSequenceTechnicalFixture(objects);
}
