/**
 * Pure P1.F1 -> P1.F2 adapter.
 *
 * One valid lab segment produces one absolute-mm productive stitch-command
 * shape. The start anchor remains outside the command list. Invalid input
 * produces diagnostics and an empty, unusable command list; nothing is repaired.
 */

import { computeCommandModelHash } from '../canonicalizeLabSatinCommands.js';
import {
  ADAPTER_ISOLATION,
  ADAPTER_LENGTH_LIMITS,
  CONTRACT_COMPATIBILITY,
  PRODUCTIVE_ADAPTER_ID,
  PRODUCTIVE_ADAPTER_VERSION,
  PRODUCTIVE_STITCH_LITERAL,
  SOURCE_MODEL_VERSION,
  INTEGRATION_REQUIREMENTS,
} from './adapterSchema.js';
import {
  isSupportedProductiveTargetContract,
  TARGET_CONTRACT_AUDIT_HASH,
} from './productiveCommandFieldMap.js';
import {
  computeProductiveAdapterHash,
  PRODUCTIVE_ADAPTER_CANONICALISATION_PROCEDURE,
} from './canonicalizeProductiveShapeCandidate.js';
import { validateProductiveShapeCandidate } from './validateProductiveShapeCandidate.js';

const finitePoint = (point) => Array.isArray(point)
  && point.length === 2
  && Number.isFinite(point[0])
  && Number.isFinite(point[1]);

function diagnoseInput(labCommandModel, targetContract, options) {
  const diagnostics = [];
  const reject = (code, message) => diagnostics.push({ code, message });

  if (!labCommandModel || typeof labCommandModel !== 'object') {
    reject('LAB_MODEL_MISSING', 'labCommandModel is required');
    return diagnostics;
  }
  if (labCommandModel.modelVersion !== SOURCE_MODEL_VERSION) {
    reject('MODEL_VERSION_INVALID', `expected ${SOURCE_MODEL_VERSION}`);
  }
  if (labCommandModel.candidateOnly !== true) reject('CANDIDATE_ONLY_REQUIRED', 'candidateOnly must be true');
  if (labCommandModel.integrated !== false) reject('MODEL_MUST_BE_ISOLATED', 'integrated must be false');
  if (labCommandModel.machineReady !== false) reject('MACHINE_READY_FORBIDDEN', 'machineReady must be false');
  if (labCommandModel.exportReady !== false) reject('EXPORT_READY_FORBIDDEN', 'exportReady must be false');
  if (labCommandModel.coordinateSpace !== 'mm') reject('COORDINATE_SPACE_INVALID', 'coordinateSpace must be mm');
  if (!finitePoint(labCommandModel.startAnchorMm)) reject('START_ANCHOR_INVALID', 'startAnchorMm must be finite');
  if (!Array.isArray(labCommandModel.commands)) reject('COMMANDS_INVALID', 'commands must be an array');
  if (!labCommandModel.regionId || typeof labCommandModel.regionId !== 'string') {
    reject('REGION_ID_INVALID', 'regionId must be a non-empty string');
  }
  if (labCommandModel.status !== 'lab_command_model_complete'
      || labCommandModel.safety?.modelComplete !== true) {
    reject('OVERALL_ELIGIBILITY_INVALID', 'the P1.F1 completion equivalent of overallEligibility=eligible is required');
  }
  if (labCommandModel.holeReconciliationStatus !== 'clear') {
    reject('HOLE_METADATA_NOT_CLEAR', 'holeReconciliationStatus must be clear');
  }
  if (labCommandModel.safety?.splitRequired !== false) {
    reject('SPLIT_REQUIRED', 'splitRequired must be false');
  }
  if (!isSupportedProductiveTargetContract(targetContract)) {
    reject('TARGET_CONTRACT_UNSUPPORTED', 'targetContract is not the audited absolute-mm command core');
  }
  if (options?.metadata != null) {
    reject('METADATA_CONFLICT', 'laboratory metadata cannot be injected into productiveCommands');
  }
  if (options?.regionId != null && options.regionId !== labCommandModel.regionId) {
    reject('REGION_ID_CONFLICT', 'options.regionId conflicts with labCommandModel.regionId');
  }

  const commands = Array.isArray(labCommandModel.commands) ? labCommandModel.commands : [];
  if (labCommandModel.metrics?.commandCount !== commands.length) {
    reject('COMMAND_COUNT_INVALID', 'metrics.commandCount must equal commands.length');
  }
  if (labCommandModel.metrics?.zeroLengthCommandCount !== 0) {
    reject('ZERO_LENGTH_COMMAND', 'zero-length commands are forbidden');
  }
  if (labCommandModel.metrics?.belowMinimumCommandCount !== 0) {
    reject('BELOW_MINIMUM_COMMAND', 'commands below 0.3 mm are forbidden');
  }
  if (labCommandModel.metrics?.aboveMaximumCommandCount !== 0) {
    reject('ABOVE_MAXIMUM_COMMAND', 'commands above 12.1 mm are forbidden');
  }
  if (labCommandModel.metrics?.nonFiniteCommandCount !== 0) {
    reject('NON_FINITE_COMMAND', 'non-finite commands are forbidden');
  }

  let previous = labCommandModel.startAnchorMm;
  for (let index = 0; index < commands.length; index++) {
    const command = commands[index];
    if (command?.op !== PRODUCTIVE_STITCH_LITERAL) {
      reject('FORBIDDEN_OPERATION', `command ${index} op must be stitch`);
    }
    if (command?.commandIndex !== index || command?.sourcePointIndex !== index + 1) {
      reject('COMMAND_ORDER_INVALID', `command ${index} indices are not canonical`);
    }
    if (!finitePoint(command?.fromMm) || !finitePoint(command?.toMm) || !finitePoint(command?.deltaMm)) {
      reject('COMMAND_COORDINATE_INVALID', `command ${index} coordinates must be finite`);
      previous = command?.toMm;
      continue;
    }
    if (command.fromMm[0] !== previous?.[0] || command.fromMm[1] !== previous?.[1]) {
      reject('COMMAND_CONTINUITY_INVALID', `command ${index} does not start at the preceding destination`);
    }
    const dx = command.toMm[0] - command.fromMm[0];
    const dy = command.toMm[1] - command.fromMm[1];
    const length = Math.hypot(dx, dy);
    if (command.deltaMm[0] !== dx || command.deltaMm[1] !== dy) {
      reject('COMMAND_DELTA_INVALID', `command ${index} delta differs from endpoints`);
    }
    if (!Number.isFinite(command.lengthMm) || Math.abs(command.lengthMm - length) > 1e-12) {
      reject('COMMAND_LENGTH_INVALID', `command ${index} length differs from endpoints`);
    } else if (command.lengthMm === 0
      || command.lengthMm < ADAPTER_LENGTH_LIMITS.minStitchLengthMm
      || command.lengthMm > ADAPTER_LENGTH_LIMITS.maxStitchLengthMm) {
      reject('COMMAND_LENGTH_OUT_OF_RANGE', `command ${index} is outside the audited window`);
    }
    previous = command.toMm;
  }

  if (!labCommandModel.commandModelHash
      || labCommandModel.commandModelHash !== computeCommandModelHash(labCommandModel)) {
    reject('SOURCE_HASH_INVALID', 'commandModelHash is missing or not reproducible');
  }

  return diagnostics;
}

function rejectedCandidate(labCommandModel, targetContract, diagnostics) {
  return {
    adapterVersion: PRODUCTIVE_ADAPTER_VERSION,
    adapterId: PRODUCTIVE_ADAPTER_ID,
    caseId: labCommandModel?.caseId ?? null,
    regionId: labCommandModel?.regionId ?? null,
    sourceLabModelHash: labCommandModel?.commandModelHash ?? null,
    targetContractId: targetContract?.contractId ?? null,
    targetContractAuditHash: targetContract?.targetContractAuditHash ?? null,
    contractCompatibility: targetContract?.compatibility ?? null,
    coordinateSpace: 'mm',
    ...ADAPTER_ISOLATION,
    startAnchor: null,
    productiveCommands: [],
    trace: [],
    metrics: null,
    validation: {
      valid: false,
      checks: [],
      failedChecks: diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`),
    },
    integrationRequirements: [...INTEGRATION_REQUIREMENTS],
    warnings: ['input rejected; no usable adapted commands were produced'],
    diagnostics,
    canonicalisationProcedure: PRODUCTIVE_ADAPTER_CANONICALISATION_PROCEDURE,
    productiveAdapterHash: null,
    status: 'productive_shape_candidate_rejected',
  };
}

/**
 * @param {{
 *   labCommandModel?: Object,
 *   targetContract?: Object,
 *   options?: Object
 * }} [input]
 */
export function adaptLabSatinCommandsToProductiveShape({
  labCommandModel,
  targetContract,
  options = {},
} = {}) {
  const diagnostics = diagnoseInput(labCommandModel, targetContract, options);
  if (diagnostics.length > 0) {
    return rejectedCandidate(labCommandModel, targetContract, diagnostics);
  }

  const productiveCommands = labCommandModel.commands.map((command) => ({
    type: PRODUCTIVE_STITCH_LITERAL,
    x: command.toMm[0],
    y: command.toMm[1],
    regionId: labCommandModel.regionId,
  }));
  const trace = labCommandModel.commands.map((command, index) => ({
    productiveCommandIndex: index,
    sourceLabCommandIndex: command.commandIndex,
    sourceSegmentKind: command.segmentKind,
    sourceFromMm: [...command.fromMm],
    sourceToMm: [...command.toMm],
    sourceLengthMm: command.lengthMm,
  }));

  const candidate = {
    adapterVersion: PRODUCTIVE_ADAPTER_VERSION,
    adapterId: PRODUCTIVE_ADAPTER_ID,
    caseId: labCommandModel.caseId,
    regionId: labCommandModel.regionId,
    sourceLabModelHash: labCommandModel.commandModelHash,
    targetContractId: targetContract.contractId,
    targetContractAuditHash: TARGET_CONTRACT_AUDIT_HASH,
    contractCompatibility: CONTRACT_COMPATIBILITY,
    coordinateSpace: 'mm',
    ...ADAPTER_ISOLATION,
    startAnchor: {
      pointMm: [...labCommandModel.startAnchorMm],
      source: 'labCommandModel.startAnchorMm',
      requiresExternalSequencing: true,
    },
    productiveCommands,
    trace,
    metrics: null,
    validation: null,
    integrationRequirements: [...INTEGRATION_REQUIREMENTS],
    warnings: [
      'shape-compatible candidate only; it is not active productive output',
      'thread color and object entry/exit sequencing remain external requirements',
    ],
    diagnostics: [],
    canonicalisationProcedure: PRODUCTIVE_ADAPTER_CANONICALISATION_PROCEDURE,
    productiveAdapterHash: null,
    status: 'productive_shape_candidate_complete',
  };

  const validation = validateProductiveShapeCandidate({
    candidate,
    labCommandModel,
    targetContract,
  });
  candidate.metrics = validation.metrics;
  candidate.validation = {
    valid: validation.valid,
    checks: validation.checks,
    failedChecks: validation.failedChecks,
  };
  candidate.productiveAdapterHash = validation.valid
    ? computeProductiveAdapterHash(candidate)
    : null;

  if (!validation.valid) {
    candidate.productiveCommands = [];
    candidate.trace = [];
    candidate.status = 'productive_shape_candidate_rejected';
    candidate.warnings.push('post-adaptation validation failed; commands were made unusable');
  }

  return candidate;
}

export { diagnoseInput as diagnoseLabSatinProductiveAdapterInput };
