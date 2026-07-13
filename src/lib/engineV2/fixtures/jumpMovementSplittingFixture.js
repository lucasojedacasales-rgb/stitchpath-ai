import { adaptCanonicalCommandsForMachine } from '../machineAdaptation/machineCommandAdapter.js';
import { createSyntheticCanonicalCompilation } from './identityMachineAdaptationFixture.js';
import { createBoundedSyntheticProfile } from './stitchMovementSplittingFixture.js';
export function createJumpMovementSplittingFixture() { const canonicalCompilation = createSyntheticCanonicalCompilation([{ type: 'jump', x: -4.7, y: 2.8 }, { type: 'end' }]); const machineProfile = createBoundedSyntheticProfile(); return { canonicalCompilation, machineProfile, machineAdaptedStream: adaptCanonicalCommandsForMachine({ canonicalCompilation, machineProfile }) }; }
