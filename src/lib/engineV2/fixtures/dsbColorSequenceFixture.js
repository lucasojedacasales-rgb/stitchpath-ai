import { createSyntheticDSBMachineStream } from './dsbBasicFormatFixture.js';

export function createDSBColorSequenceFixture(colorChangeCount = 4) {
  const specs = [{ type: 'stitch', dxUnits: 5, dyUnits: 5, threadId: 'thread:synthetic:0' }];
  for (let index = 1; index <= colorChangeCount; index += 1) {
    specs.push({ type: 'colorChange', threadId: `thread:synthetic:${index}` });
    specs.push({ type: 'stitch', dxUnits: 2, dyUnits: 1, threadId: `thread:synthetic:${index}` });
  }
  specs.push({ type: 'end', threadId: null });
  return createSyntheticDSBMachineStream(specs, { fixtureId: `dsb-colors-${colorChangeCount}` });
}
