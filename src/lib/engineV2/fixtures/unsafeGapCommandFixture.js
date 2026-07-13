import { createTatamiHolePhysicalFixture } from './tatamiHolePhysicalFixture.js';
import { compileCanonicalFixture } from './genericMascotCommandFixture.js';

export function createUnsafeGapCommandFixture(config = {}) {
  return compileCanonicalFixture(createTatamiHolePhysicalFixture(), config);
}
