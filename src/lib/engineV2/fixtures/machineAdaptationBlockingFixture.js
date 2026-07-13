import { adaptCanonicalCommandsForMachine } from '../machineAdaptation/machineCommandAdapter.js';
import { createSyntheticCanonicalCompilation } from './identityMachineAdaptationFixture.js';
export function createMachineAdaptationBlockingFixture() { const canonicalCompilation = createSyntheticCanonicalCompilation(); return { canonicalCompilation, machineAdaptedStream: adaptCanonicalCommandsForMachine({ canonicalCompilation, config: { encoding: true } }) }; }
