import { adaptCanonicalCommandsForMachine } from '../machineAdaptation/machineCommandAdapter.js';
import { createSyntheticCanonicalCompilation } from './identityMachineAdaptationFixture.js';
export function createCoordinateTransformFixture(transform = {}) { const canonicalCompilation = createSyntheticCanonicalCompilation(); return { canonicalCompilation, transform, machineAdaptedStream: adaptCanonicalCommandsForMachine({ canonicalCompilation, config: { transform } }) }; }
