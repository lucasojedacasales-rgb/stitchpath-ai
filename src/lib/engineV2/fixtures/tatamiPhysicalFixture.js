import { createPhysicalPlanFixture, createSyntheticTechnicalObject } from './runningPhysicalFixture.js';

export function createTatamiPhysicalFixture(options = {}) {
  const object = createSyntheticTechnicalObject(options.id || 'physical-tatami', { stitchType: 'tatami', role: 'base_fill', geometry: options.geometry || [{ x: 0, y: 0 }, { x: 18, y: 0 }, { x: 18, y: 12 }, { x: 0, y: 12 }], holes: options.holes || [], threadId: options.threadId, visualColor: options.visualColor, source: { fixture: 'synthetic_phase_9' } });
  return createPhysicalPlanFixture([object], options.config);
}
