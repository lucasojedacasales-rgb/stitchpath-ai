import { createSyntheticDSBMachineStream } from './dsbBasicFormatFixture.js';

export function createDSBBlockingFixture(kind = 'invalid_resolution') {
  if (kind === 'invalid_resolution') return createSyntheticDSBMachineStream([{ type: 'stitch', dxUnits: 1, dyUnits: 1 }, { type: 'end' }], { resolution: 0.2, fixtureId: kind });
  if (kind === 'missing_end') return createSyntheticDSBMachineStream([{ type: 'stitch', dxUnits: 1, dyUnits: 1 }], { fixtureId: kind });
  if (kind === 'duplicate_end') return createSyntheticDSBMachineStream([{ type: 'stitch', dxUnits: 1, dyUnits: 1 }, { type: 'end' }, { type: 'end' }], { fixtureId: kind });
  if (kind === 'command_after_end') return createSyntheticDSBMachineStream([{ type: 'stitch', dxUnits: 1, dyUnits: 1 }, { type: 'end' }, { type: 'stitch', dxUnits: 1, dyUnits: 1 }], { fixtureId: kind });
  if (kind === 'inconsistent_delta') return createSyntheticDSBMachineStream([{ type: 'stitch', dxUnits: 2, dyUnits: 2, forceXUnits: 9 }, { type: 'end' }], { fixtureId: kind });
  if (kind === 'initial_color_change') return createSyntheticDSBMachineStream([{ type: 'colorChange' }, { type: 'stitch', dxUnits: 1, dyUnits: 1 }, { type: 'end' }], { fixtureId: kind });
  if (kind === 'trailing_color_change') return createSyntheticDSBMachineStream([{ type: 'stitch', dxUnits: 1, dyUnits: 1 }, { type: 'colorChange' }, { type: 'end' }], { fixtureId: kind });
  return createSyntheticDSBMachineStream([{ type: 'end' }], { valid: false, fixtureId: kind });
}
