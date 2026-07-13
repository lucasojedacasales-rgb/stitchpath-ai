import { createTatamiPhysicalFixture } from './tatamiPhysicalFixture.js';

export function createTatamiHolePhysicalFixture() {
  return createTatamiPhysicalFixture({ id: 'physical-tatami-hole', holes: [[{ x: 6, y: 3 }, { x: 12, y: 3 }, { x: 12, y: 9 }, { x: 6, y: 9 }]] });
}

export function createTatamiMultipleHolePhysicalFixture() {
  return createTatamiPhysicalFixture({ id: 'physical-tatami-multiple-holes', holes: [[{ x: 3, y: 3 }, { x: 6, y: 3 }, { x: 6, y: 8 }, { x: 3, y: 8 }], [{ x: 11, y: 2 }, { x: 15, y: 2 }, { x: 15, y: 7 }, { x: 11, y: 7 }]] });
}
