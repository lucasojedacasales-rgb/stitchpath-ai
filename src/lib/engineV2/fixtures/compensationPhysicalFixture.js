import { createSatinPhysicalFixture } from './satinPhysicalFixture.js';
import { createTatamiPhysicalFixture } from './tatamiPhysicalFixture.js';

export function createCompensationPhysicalFixture() {
  return { tatami: createTatamiPhysicalFixture({ id: 'physical-compensation-tatami' }), satin: createSatinPhysicalFixture({ id: 'physical-compensation-satin' }) };
}
