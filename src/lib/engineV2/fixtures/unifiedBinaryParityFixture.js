import { createUnifiedDSTExportFixture } from './unifiedDSTExportFixture.js';
import { createUnifiedDSBExplicitFixture } from './unifiedDSBExplicitFixture.js';

export function createUnifiedBinaryParityFixture(format = 'DST') {
  return format.toUpperCase() === 'DSB' ? createUnifiedDSBExplicitFixture(format) : createUnifiedDSTExportFixture(format);
}
