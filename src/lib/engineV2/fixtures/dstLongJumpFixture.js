import { createSyntheticDSTMachineStream } from './dstBasicFormatFixture.js';

export function createDSTLongJumpFixture(delta = 350) {
  return createSyntheticDSTMachineStream([{ type: 'jump', dxUnits: delta, dyUnits: Math.sign(delta) * 17 }, { type: 'stitch', dxUnits: 5, dyUnits: 5 }, { type: 'end' }], { fixtureId: 'dst-long-jump' });
}

