import { createPhysicalPlanFixture, createSyntheticTechnicalObject } from './runningPhysicalFixture.js';

export function createPhysicalPointLimitFixture() {
  const object = createSyntheticTechnicalObject('physical-point-limit', { stitchType: 'tatami', geometry: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }], source: { fixture: 'synthetic_phase_9' } });
  return { objectLimit: createPhysicalPlanFixture([object], { maximumPointsPerObject: 20 }), totalLimit: createPhysicalPlanFixture([object], { maximumTotalPoints: 20 }) };
}
