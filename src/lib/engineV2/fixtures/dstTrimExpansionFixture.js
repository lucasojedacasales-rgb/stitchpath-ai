import { createSyntheticDSTMachineStream } from './dstBasicFormatFixture.js';

export function createDSTTrimExpansionFixture(trimCount = 1) {
  const specs = [{ type: 'stitch', dxUnits: 10, dyUnits: 10 }];
  for (let index = 0; index < trimCount; index += 1) specs.push({ type: 'trim' });
  specs.push({ type: 'end' });
  return createSyntheticDSTMachineStream(specs, { fixtureId: `dst-trim-${trimCount}` });
}

