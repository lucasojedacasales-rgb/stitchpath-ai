import { createSyntheticDSBMachineStream } from './dsbBasicFormatFixture.js';

export function createDSBLongJumpFixture(dxUnits = 350, dyUnits = -280, type = 'jump') {
  return createSyntheticDSBMachineStream([{ type, dxUnits, dyUnits }, { type: 'end' }], { fixtureId: `dsb-long-${type}` });
}
