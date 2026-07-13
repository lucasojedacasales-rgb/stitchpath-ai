import { createSyntheticDSTMachineStream } from './dstBasicFormatFixture.js';

export function createDSTBoundaryMovementFixture({ type = 'stitch', dxUnits = 121, dyUnits = 0 } = {}) {
  return createSyntheticDSTMachineStream([{ type, dxUnits, dyUnits }, { type: 'end' }], { fixtureId: 'dst-boundary-movement' });
}

