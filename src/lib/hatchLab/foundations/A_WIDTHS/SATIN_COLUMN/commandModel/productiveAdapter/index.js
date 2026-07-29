/**
 * P1.F2 isolated productive-command shape adapter public laboratory API.
 * Zero productive imports and zero engine/export execution.
 */

export {
  PRODUCTIVE_ADAPTER_VERSION,
  PRODUCTIVE_ADAPTER_ID,
  TARGET_CONTRACT_ID,
  CONTRACT_COMPATIBILITY,
  SOURCE_MODEL_VERSION,
  PRODUCTIVE_COMMAND_FIELDS,
  PRODUCTIVE_STITCH_LITERAL,
  FORBIDDEN_PRODUCTIVE_OPERATIONS,
  ADAPTER_LENGTH_LIMITS,
  INTEGRATION_REQUIREMENTS,
  ADAPTER_ISOLATION,
  PRODUCTIVE_ADAPTER_HASH_EXCLUDED_KEYS,
} from './adapterSchema.js';
export {
  PRODUCTIVE_COMMAND_FIELD_MAP,
  PRODUCTIVE_COMMAND_TARGET_CONTRACT,
  TARGET_CONTRACT_AUDIT_HASH,
  isSupportedProductiveTargetContract,
} from './productiveCommandFieldMap.js';
export {
  adaptLabSatinCommandsToProductiveShape,
  diagnoseLabSatinProductiveAdapterInput,
} from './adaptLabSatinCommandsToProductiveShape.js';
export { validateProductiveShapeCandidate } from './validateProductiveShapeCandidate.js';
export { recoverLabPathFromAdaptedCommands } from './recoverLabPathFromAdaptedCommands.js';
export {
  canonicalizeProductiveShapeCandidate,
  computeProductiveAdapterHash,
  PRODUCTIVE_ADAPTER_CANONICALISATION_PROCEDURE,
} from './canonicalizeProductiveShapeCandidate.js';
