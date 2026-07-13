import { createPhysicalPlanFixture, createSyntheticTechnicalObject } from './runningPhysicalFixture.js';

export function createSatinPhysicalFixture(options = {}) {
  const object = createSyntheticTechnicalObject(options.id || 'physical-satin', { role: 'internal_detail', stitchType: 'satin', geometry: options.geometry || [{ x: 0, y: 0 }, { x: 14, y: 0 }, { x: 14, y: 3 }, { x: 0, y: 3 }], holes: options.holes || [], visualColor: '#CC3344', threadId: 'thread:synthetic:red', source: { fixture: 'synthetic_phase_9' } });
  return createPhysicalPlanFixture([object]);
}
