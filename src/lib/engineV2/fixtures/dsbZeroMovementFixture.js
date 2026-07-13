import { createSyntheticDSBMachineStream } from './dsbBasicFormatFixture.js';

export function createDSBZeroMovementFixture(type = 'stitch') {
  return createSyntheticDSBMachineStream([{ type, dxUnits: 0, dyUnits: 0 }, { type: 'end' }], { fixtureId: `dsb-zero-${type}` });
}
