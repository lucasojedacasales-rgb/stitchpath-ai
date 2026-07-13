import { buildGlobalSequencePlan } from '../sequencing/globalSequencePlanner.js';
import { buildMachineIndependentPhysicalStitchPlan } from '../stitchGeneration/physicalStitchPipeline.js';
import { createSequenceTechnicalFixture, createSyntheticTechnicalObject } from './simpleSequenceFixture.js';

export function createPhysicalSequenceFixture(objects) {
  const fixture = createSequenceTechnicalFixture(objects); const sequencePlan = buildGlobalSequencePlan({ regions: fixture.regions, threadedObjectMaterialization: fixture.threadedObjectMaterialization, technicalPlan: fixture.technicalPlan });
  return { ...fixture, sequencePlan };
}

export function createPhysicalPlanFixture(objects, config = {}) {
  const fixture = createPhysicalSequenceFixture(objects); const physicalPlan = buildMachineIndependentPhysicalStitchPlan({ regions: fixture.regions, threadedObjectMaterialization: fixture.threadedObjectMaterialization, technicalPlan: fixture.technicalPlan, sequencePlan: fixture.sequencePlan, config });
  return { ...fixture, physicalPlan };
}

export function createRunningPhysicalFixture() {
  const object = createSyntheticTechnicalObject('physical-running-open', { role: 'internal_detail', stitchType: 'running', geometry: [{ x: 0, y: 0 }, { x: 3, y: 2 }, { x: 8, y: 2 }, { x: 12, y: 0 }], technicalIntent: { geometryType: 'open_path', lineIntent: true }, technicalGeometryIntent: 'open_path', source: { fixture: 'synthetic_phase_9' } });
  return createPhysicalPlanFixture([object]);
}

export { createSyntheticTechnicalObject };
