import { canonicalCommandId } from '../commandCompilation/canonicalCommandId.js';
import { createCanonicalCommandCompilationV2 } from '../commandCompilation/canonicalCompilationModel.js';
import { createCanonicalCommandV2 } from '../model.js';
import { adaptCanonicalCommandsForMachine } from '../machineAdaptation/machineCommandAdapter.js';

export function createSyntheticCanonicalCompilation(points = [{ type: 'jump', x: 1, y: 1 }, { type: 'stitch', x: 2.25, y: 1.75 }, { type: 'trim' }, { type: 'colorChange', threadId: 'thread:two' }, { type: 'end' }]) {
  const commands = points.map((item, index) => createCanonicalCommandV2({ ...item, id: canonicalCommandId(index, item.type), sequenceIndex: index, threadId: item.threadId ?? 'thread:one', objectId: 'object:synthetic', regionId: 'region:synthetic', threadBlockId: item.threadId === 'thread:two' ? 'block:two' : 'block:one', reasonCode: 'SYNTHETIC_FIXTURE' }));
  return createCanonicalCommandCompilationV2({ commands, valid: true, executionOrder: ['object:synthetic'], threadBlockOrder: ['block:one', 'block:two'], summary: { commandCount: commands.length }, metadata: { syntheticFixture: true } });
}

export function createIdentityMachineAdaptationFixture(config = {}) { const canonicalCompilation = createSyntheticCanonicalCompilation(); return { canonicalCompilation, machineAdaptedStream: adaptCanonicalCommandsForMachine({ canonicalCompilation, config }) }; }
