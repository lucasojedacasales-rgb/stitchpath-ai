import { adaptCanonicalCommandsForMachine } from '../machineAdaptation/machineCommandAdapter.js';
import { createSyntheticCanonicalCompilation } from './identityMachineAdaptationFixture.js';
import { createBoundedSyntheticProfile } from './stitchMovementSplittingFixture.js';
export function createTrimCapabilityFixture(trimCapability = 'native', unsupportedTrimPolicy = 'preserve_intent') { const canonicalCompilation = createSyntheticCanonicalCompilation([{ type: 'jump', x: 1, y: 1 }, { type: 'trim' }, { type: 'end' }]); const machineProfile = createBoundedSyntheticProfile({ trimCapability, unsupportedTrimPolicy }); return { canonicalCompilation, machineProfile, machineAdaptedStream: adaptCanonicalCommandsForMachine({ canonicalCompilation, machineProfile }) }; }
