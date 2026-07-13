import { compileCanonicalCommandStream } from '../commandCompilation/canonicalCommandCompiler.js';
import { createGenericMascotPhysicalFixture } from './genericMascotPhysicalFixture.js';

export function compileCanonicalFixture(fixture, config = {}) {
  const canonicalCompilation = compileCanonicalCommandStream({ ...fixture, config });
  return { ...fixture, canonicalCompilation };
}

export function createGenericMascotCommandFixture(config = {}) {
  return compileCanonicalFixture(createGenericMascotPhysicalFixture(), config);
}
