import { createSyntheticDSTMachineStream } from './dstBasicFormatFixture.js';

export function createDSTColorSequenceFixture() {
  const threads = ['green', 'white', 'red', 'yellow', 'black'].map(name => `thread:synthetic:${name}`); const specs = [];
  threads.forEach((threadId, index) => {
    if (index) specs.push({ type: 'colorChange', threadId });
    specs.push({ type: 'stitch', dxUnits: 10 + index, dyUnits: index % 2 ? 2 : -2, threadId });
  });
  specs.push({ type: 'end', threadId: threads.at(-1) });
  return createSyntheticDSTMachineStream(specs, { fixtureId: 'dst-five-thread-blocks' });
}

