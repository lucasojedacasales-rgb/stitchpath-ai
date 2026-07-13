import { createRunningPhysicalFixture } from './runningPhysicalFixture.js';
import { compileCanonicalFixture } from './genericMascotCommandFixture.js';

export function createContinuousSubpathCommandFixture(config = {}) {
  return compileCanonicalFixture(createRunningPhysicalFixture(), config);
}
