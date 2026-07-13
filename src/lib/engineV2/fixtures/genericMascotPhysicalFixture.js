import { buildMachineIndependentPhysicalStitchPlan } from '../stitchGeneration/physicalStitchPipeline.js';
import { createGenericMascotSequenceFixture } from './genericMascotSequenceFixture.js';
import { buildGlobalSequencePlan } from '../sequencing/globalSequencePlanner.js';

export function createGenericMascotPhysicalFixture(config = {}) {
  const fixture = createGenericMascotSequenceFixture(); const sequencePlan = buildGlobalSequencePlan({ regions: fixture.regions, threadedObjectMaterialization: fixture.threadedObjectMaterialization, technicalPlan: fixture.technicalPlan });
  const physicalPlan = buildMachineIndependentPhysicalStitchPlan({ regions: fixture.regions, threadedObjectMaterialization: fixture.threadedObjectMaterialization, technicalPlan: fixture.technicalPlan, sequencePlan, config });
  return { ...fixture, sequencePlan, physicalPlan };
}
