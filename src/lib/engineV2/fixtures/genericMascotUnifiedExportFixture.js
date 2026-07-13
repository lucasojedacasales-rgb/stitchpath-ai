import { createUnifiedDSTExportFixture } from './unifiedDSTExportFixture.js';
import { createUnifiedDSBStrictFixture } from './unifiedDSBStrictFixture.js';
import { createUnifiedDSBExplicitFixture } from './unifiedDSBExplicitFixture.js';

export function createGenericMascotUnifiedExportFixture() {
  return { dst: createUnifiedDSTExportFixture(), dsbStrict: createUnifiedDSBStrictFixture(), dsbExplicit: createUnifiedDSBExplicitFixture() };
}
