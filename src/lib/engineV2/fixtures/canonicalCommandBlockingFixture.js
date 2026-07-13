import { compileCanonicalFixture } from './genericMascotCommandFixture.js';
import { createGenericMascotPhysicalFixture } from './genericMascotPhysicalFixture.js';

const clone = value => structuredClone(value);
function changed(mutator) { const fixture = clone(createGenericMascotPhysicalFixture()); mutator(fixture); return compileCanonicalFixture(fixture); }

export function createCanonicalCommandBlockingFixture() {
  return {
    missingPhysicalPath: changed(fixture => { fixture.physicalPlan.objectPaths.pop(); }),
    incompletePhysicalPath: changed(fixture => { fixture.physicalPlan.objectPaths[0].subpaths.pop(); }),
    unknownThread: changed(fixture => { fixture.threadedObjectMaterialization.threads.pop(); }),
    changedPhysicalCoordinate: changed(fixture => { fixture.physicalPlan.objectPaths[0].subpaths[0].points[0].x += 1; }),
    changedSelectedCandidate: changed(fixture => { fixture.physicalPlan.objectPaths[0].entryCandidateId = 'candidate:changed'; }),
    objectOrderMutation: changed(fixture => { fixture.sequencePlan.executionSteps.reverse(); }),
    threadBlockOrderMutation: changed(fixture => { fixture.sequencePlan.threadBlocks.reverse(); }),
  };
}
