import { createTatamiPhysicalFixture } from './tatamiPhysicalFixture.js';
import { compileCanonicalFixture } from './genericMascotCommandFixture.js';

export function createSafeConnectorCommandFixture(config = {}) {
  return compileCanonicalFixture(createTatamiPhysicalFixture(), config);
}
