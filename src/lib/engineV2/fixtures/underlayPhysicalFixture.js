import { createSatinPhysicalFixture } from './satinPhysicalFixture.js';
import { createTatamiPhysicalFixture } from './tatamiPhysicalFixture.js';

export function createUnderlayPhysicalFixture() {
  return { satin: createSatinPhysicalFixture({ id: 'physical-underlay-satin' }), tatami: createTatamiPhysicalFixture({ id: 'physical-underlay-tatami' }) };
}
