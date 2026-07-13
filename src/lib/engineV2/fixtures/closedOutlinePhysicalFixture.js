import { createPhysicalPlanFixture, createSyntheticTechnicalObject } from './runningPhysicalFixture.js';

export function createClosedOutlinePhysicalFixture() {
  const object = createSyntheticTechnicalObject('physical-closed-outline', { role: 'outer_outline', stitchType: 'running', geometry: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }], technicalIntent: { geometryType: 'closed_path', lineIntent: true }, technicalGeometryIntent: 'closed_path', source: { fixture: 'synthetic_phase_9' } });
  return createPhysicalPlanFixture([object]);
}
