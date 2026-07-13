import { createSyntheticDSTMachineStream } from './dstBasicFormatFixture.js';

export function createDSTBlockingFixture(kind = 'invalid_resolution') {
  if (kind === 'invalid_resolution') return createSyntheticDSTMachineStream([{ type: 'stitch', dxUnits: 1, dyUnits: 1 }, { type: 'end' }], { resolution: 0.2, fixtureId: kind });
  if (kind === 'missing_end') return createSyntheticDSTMachineStream([{ type: 'stitch', dxUnits: 1, dyUnits: 1 }], { fixtureId: kind });
  if (kind === 'duplicate_end') return createSyntheticDSTMachineStream([{ type: 'stitch', dxUnits: 1, dyUnits: 1 }, { type: 'end' }, { type: 'end' }], { fixtureId: kind });
  if (kind === 'command_after_end') return createSyntheticDSTMachineStream([{ type: 'stitch', dxUnits: 1, dyUnits: 1 }, { type: 'end' }, { type: 'stitch', dxUnits: 1, dyUnits: 1 }], { fixtureId: kind });
  if (kind === 'inconsistent_delta') return createSyntheticDSTMachineStream([{ type: 'stitch', dxUnits: 2, dyUnits: 2, forceXUnits: 9 }, { type: 'end' }], { fixtureId: kind });
  if (kind === 'unknown_thread') return createSyntheticDSTMachineStream([{ type: 'stitch', dxUnits: 1, dyUnits: 1, threadId: null }, { type: 'end', threadId: null }], { fixtureId: kind });
  return createSyntheticDSTMachineStream([{ type: 'end' }], { valid: false, fixtureId: kind });
}

