import { createGenericMascotPhysicalFixture } from './genericMascotPhysicalFixture.js';
import { compileCanonicalFixture } from './genericMascotCommandFixture.js';

export function createObjectTransitionCommandFixture(config = {}) {
  const fixture = compileCanonicalFixture(createGenericMascotPhysicalFixture(), config);
  const steps = fixture.sequencePlan.executionSteps;
  return { ...fixture, sameThreadPair: steps.slice(-2).map(item => item.objectId), differentThreadPair: steps.slice(0, 2).map(item => item.objectId) };
}
