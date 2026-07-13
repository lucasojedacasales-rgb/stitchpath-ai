import { createSatinPhysicalFixture } from './satinPhysicalFixture.js';

export function createSatinBlockingFixture() {
  return {
    tooWide: createSatinPhysicalFixture({ id: 'physical-satin-wide', geometry: [{ x: 0, y: 0 }, { x: 14, y: 0 }, { x: 14, y: 10 }, { x: 0, y: 10 }] }),
    withHole: createSatinPhysicalFixture({ id: 'physical-satin-hole', holes: [[{ x: 5, y: 0.8 }, { x: 9, y: 0.8 }, { x: 9, y: 2.2 }, { x: 5, y: 2.2 }]] }),
    branching: createSatinPhysicalFixture({ id: 'physical-satin-branch', geometry: [{ x: 0, y: 0 }, { x: 14, y: 0 }, { x: 14, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 2 }, { x: 0, y: 2 }] }),
  };
}
