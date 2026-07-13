import { adaptCanonicalCommandsForMachine } from '../machineAdaptation/machineCommandAdapter.js';
import { createGenericMascotCommandFixture } from './genericMascotCommandFixture.js';
export function createGenericMascotMachineFixture(config = {}) { const source = createGenericMascotCommandFixture(); return { ...source, machineAdaptedStream: adaptCanonicalCommandsForMachine({ canonicalCompilation: source.canonicalCompilation, config }) }; }
