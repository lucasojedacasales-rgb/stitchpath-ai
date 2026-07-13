import { buildTechnicalEmbroideryPlan } from '../technical/technicalPlanningPipeline.js';
import { createGenericMascotTechnicalFixture } from './genericMascotTechnicalFixture.js';

export function createGenericMascotSequenceFixture() {
  const fixture = createGenericMascotTechnicalFixture();
  const technicalPlan = buildTechnicalEmbroideryPlan({ regions: fixture.regions, threadedObjectMaterialization: fixture.threadedObjectMaterialization });
  return { ...fixture, technicalPlan };
}
