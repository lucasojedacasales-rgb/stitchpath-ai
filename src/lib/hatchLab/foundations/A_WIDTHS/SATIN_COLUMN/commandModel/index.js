/**
 * P1.F1 lab command model — public laboratory API.
 * Zero productive imports. Produces no machine commands and no export bytes.
 */

export {
  COMMAND_MODEL_VERSION, COMPILER_VERSION, COORDINATE_SPACE,
  ALLOWED_OPS, FORBIDDEN_OPS, SEGMENT_KINDS, RAIL_LABELS,
  LENGTH_LIMITS, COMPILE_STATUSES, CANONICAL_COMMAND_FIELDS,
  HASH_EXCLUDED_KEYS, LAYER_SEPARATION,
} from './commandModelSchema.js';
export { buildLabSatinCandidate } from './buildLabSatinCandidate.js';
export { compileStraightSatinCandidateToLabCommands } from './compileStraightSatinCandidateToLabCommands.js';
export { validateLabSatinCommandModel } from './validateLabSatinCommandModel.js';
export { measureLabSatinCommands, buildLabSatinSafety } from './measureLabSatinCommands.js';
export {
  canonicalizeLabSatinCommands, canonicalizeCommand, canonicalStringify,
  computeCommandModelHash, fnv1a32,
} from './canonicalizeLabSatinCommands.js';

// P1.F2: isolated productive-command shape adapter.
export * from './productiveAdapter/index.js';

export const COMMAND_MODEL_ISOLATION = {
  phase: 'P1.F1',
  candidateOnly: true,
  integrated: false,
  machineReady: false,
  exportReady: false,
  productiveImports: [],
  enginesExecuted: [],
  producesMachineCommands: false,
  producesExportBytes: false,
  mutatesRegions: false,
  changesStitchType: false,
};
