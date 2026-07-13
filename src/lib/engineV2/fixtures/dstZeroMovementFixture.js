import { createSyntheticDSTMachineStream } from './dstBasicFormatFixture.js';

export function createDSTZeroMovementFixture(type = 'jump') {
  return createSyntheticDSTMachineStream([{ type, dxUnits: 0, dyUnits: 0 }, { type: 'end' }], { fixtureId: `dst-zero-${type}` });
}

