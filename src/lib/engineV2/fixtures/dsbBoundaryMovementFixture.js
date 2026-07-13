import { createSyntheticDSBMachineStream } from './dsbBasicFormatFixture.js';

export function createDSBBoundaryMovementFixture(type = 'stitch', delta = 127) {
  return createSyntheticDSBMachineStream([{ type, dxUnits: delta, dyUnits: -delta }, { type: 'end' }], { fixtureId: `dsb-boundary-${type}-${delta}` });
}
