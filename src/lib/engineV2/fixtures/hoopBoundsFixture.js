import { adaptCanonicalCommandsForMachine } from '../machineAdaptation/machineCommandAdapter.js';
import { createSyntheticCanonicalCompilation } from './identityMachineAdaptationFixture.js';
import { createBoundedSyntheticProfile } from './stitchMovementSplittingFixture.js';
export function createHoopBoundsFixture(outside = false, blockOutOfBounds = true) { const canonicalCompilation = createSyntheticCanonicalCompilation([{ type: 'jump', x: outside ? 20 : 2, y: 2 }, { type: 'end' }]); const machineProfile = createBoundedSyntheticProfile({ hoopBoundsMm: { minX: -5, maxX: 5, minY: -5, maxY: 5 } }); return { canonicalCompilation, machineProfile, machineAdaptedStream: adaptCanonicalCommandsForMachine({ canonicalCompilation, machineProfile, config: { blockOutOfBounds } }) }; }
