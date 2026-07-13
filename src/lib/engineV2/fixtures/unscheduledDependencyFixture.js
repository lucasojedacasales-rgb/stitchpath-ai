import { createObjectTechnicalSpecificationV2 } from '../technical/technicalPlanningModel.js';
import { createSequenceTechnicalFixture, createSyntheticTechnicalObject } from './simpleSequenceFixture.js';

function withManualSpecification(fixture, objectId) {
  const specifications = fixture.technicalPlan.specifications.map(specification => specification.objectId === objectId
    ? createObjectTechnicalSpecificationV2({ ...specification, status: 'manual_required', blockingReasons: [{ code: 'SYNTHETIC_MANUAL_REVIEW' }] })
    : specification);
  return { ...fixture, technicalPlan: { ...fixture.technicalPlan, specifications, bySpecificationId: Object.fromEntries(specifications.map(item => [item.id, item])), byObjectId: Object.fromEntries(specifications.map(item => [item.objectId, item])) } };
}
export function createUnscheduledDependencyFixture() {
  const manual = createSyntheticTechnicalObject('manual-source');
  const dependent = createSyntheticTechnicalObject('manual-dependent', { dependencyIds: [manual.id], layer: 1 });
  const transitive = createSyntheticTechnicalObject('manual-transitive', { dependencyIds: [dependent.id], layer: 2 });
  return withManualSpecification(createSequenceTechnicalFixture([transitive, dependent, manual]), manual.id);
}
