import { createPathDiscontinuityFixture } from './pathDiscontinuityFixture.js';
import { compileCanonicalFixture } from './genericMascotCommandFixture.js';

export function createHoleGapCommandFixture(config = {}) {
  return compileCanonicalFixture(createPathDiscontinuityFixture(), config);
}
