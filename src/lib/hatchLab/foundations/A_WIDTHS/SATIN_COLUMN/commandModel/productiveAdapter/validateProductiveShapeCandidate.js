/**
 * Pure validation and parity measurement for a P1.F2 shape candidate.
 * Reports differences; never repairs or mutates either input.
 */

import {
  ADAPTER_LENGTH_LIMITS,
  CONTRACT_COMPATIBILITY,
  FORBIDDEN_PRODUCTIVE_OPERATIONS,
  PRODUCTIVE_ADAPTER_VERSION,
  PRODUCTIVE_COMMAND_FIELDS,
  PRODUCTIVE_STITCH_LITERAL,
  SOURCE_MODEL_VERSION,
} from './adapterSchema.js';
import {
  isSupportedProductiveTargetContract,
  TARGET_CONTRACT_AUDIT_HASH,
} from './productiveCommandFieldMap.js';
import { recoverLabPathFromAdaptedCommands } from './recoverLabPathFromAdaptedCommands.js';

const samePoint = (a, b) => Array.isArray(a)
  && Array.isArray(b)
  && a.length === 2
  && b.length === 2
  && a[0] === b[0]
  && a[1] === b[1];

const fieldSignature = (value) => Object.keys(value || {}).sort().join('|');
const expectedFieldSignature = [...PRODUCTIVE_COMMAND_FIELDS].sort().join('|');

function pathLength(points) {
  let total = 0;
  const lengths = [];
  for (let i = 1; i < points.length; i++) {
    const length = Math.hypot(
      points[i][0] - points[i - 1][0],
      points[i][1] - points[i - 1][1],
    );
    lengths.push(length);
    total += length;
  }
  return { total, lengths };
}

/**
 * @param {{
 *   candidate?: Object,
 *   labCommandModel?: Object,
 *   targetContract?: Object
 * }} [input]
 */
export function validateProductiveShapeCandidate({
  candidate,
  labCommandModel,
  targetContract,
} = {}) {
  const checks = [];
  const add = (name, satisfied, detail = null) => {
    checks.push({ name, satisfied: !!satisfied, detail });
  };

  const labCommands = Array.isArray(labCommandModel?.commands)
    ? labCommandModel.commands
    : [];
  const productiveCommands = Array.isArray(candidate?.productiveCommands)
    ? candidate.productiveCommands
    : [];
  const trace = Array.isArray(candidate?.trace) ? candidate.trace : [];

  const recovered = recoverLabPathFromAdaptedCommands({
    startAnchor: candidate?.startAnchor,
    productiveCommands,
    targetContract,
  });
  const expectedPoints = [
    ...(Array.isArray(labCommandModel?.startAnchorMm)
      ? [[...labCommandModel.startAnchorMm]]
      : []),
    ...labCommands.map((command) => [...command.toMm]),
  ];

  let coordinateMismatchCount = expectedPoints.length;
  if (recovered.valid) {
    coordinateMismatchCount = Math.abs(expectedPoints.length - recovered.pointsMm.length);
    for (let index = 0; index < Math.min(expectedPoints.length, recovered.pointsMm.length); index++) {
      if (!samePoint(recovered.pointsMm[index], expectedPoints[index])) {
        coordinateMismatchCount++;
      }
    }
  }
  const orderingMismatchCount = productiveCommands.reduce((count, command, index) => {
    const source = labCommands[index];
    const traceEntry = trace[index];
    const ordered = source
      && traceEntry?.productiveCommandIndex === index
      && traceEntry?.sourceLabCommandIndex === index
      && command?.x === source.toMm[0]
      && command?.y === source.toMm[1];
    return count + (ordered ? 0 : 1);
  }, 0);
  const missingCommandCount = Math.max(0, labCommands.length - productiveCommands.length);
  const additionalCommandCount = Math.max(0, productiveCommands.length - labCommands.length);
  const operationMismatchCount = productiveCommands.filter(
    (command, index) => command?.type !== PRODUCTIVE_STITCH_LITERAL
      || labCommands[index]?.op !== PRODUCTIVE_STITCH_LITERAL,
  ).length;
  const exactFieldSetMismatchCount = productiveCommands.filter(
    (command) => fieldSignature(command) !== expectedFieldSignature,
  ).length;
  const forbiddenOperationCount = productiveCommands.filter(
    (command) => command?.type !== PRODUCTIVE_STITCH_LITERAL
      || FORBIDDEN_PRODUCTIVE_OPERATIONS.includes(command?.type),
  ).length;

  const recoveredMeasure = recovered.valid
    ? pathLength(recovered.pointsMm)
    : { total: NaN, lengths: [] };
  const labLengths = labCommands.map((command) => command.lengthMm);
  const totalLabPathLengthMm = labLengths.reduce((sum, length) => sum + length, 0);
  const totalAdaptedPathLengthMm = recoveredMeasure.total;
  const pathLengthDeltaMm = totalAdaptedPathLengthMm - totalLabPathLengthMm;

  let maximumCoordinateDeltaMm = 0;
  if (recovered.valid) {
    for (let i = 0; i < Math.min(recovered.pointsMm.length, expectedPoints.length); i++) {
      maximumCoordinateDeltaMm = Math.max(
        maximumCoordinateDeltaMm,
        Math.abs(recovered.pointsMm[i][0] - expectedPoints[i][0]),
        Math.abs(recovered.pointsMm[i][1] - expectedPoints[i][1]),
      );
    }
  } else {
    maximumCoordinateDeltaMm = Infinity;
  }

  const finiteLengths = recoveredMeasure.lengths.filter(Number.isFinite);
  const zeroLengthCommandCount = finiteLengths.filter((length) => length === 0).length;
  const belowMinimumCommandCount = finiteLengths.filter(
    (length) => length < ADAPTER_LENGTH_LIMITS.minStitchLengthMm,
  ).length;
  const aboveMaximumCommandCount = finiteLengths.filter(
    (length) => length > ADAPTER_LENGTH_LIMITS.maxStitchLengthMm,
  ).length;
  const nonFiniteCoordinateCount = productiveCommands.filter(
    (command) => !Number.isFinite(command?.x) || !Number.isFinite(command?.y),
  ).length;

  const metrics = {
    labCommandCount: labCommands.length,
    productiveCommandCount: productiveCommands.length,
    traceCount: trace.length,
    recoveredPointCount: recovered.valid ? recovered.pointsMm.length : 0,
    coordinateMismatchCount,
    orderingMismatchCount,
    missingCommandCount,
    additionalCommandCount,
    operationMismatchCount,
    totalLabPathLengthMm,
    totalAdaptedPathLengthMm,
    pathLengthDeltaMm,
    maximumCoordinateDeltaMm,
    minimumCommandLengthMm: finiteLengths.length ? Math.min(...finiteLengths) : null,
    maximumCommandLengthMm: finiteLengths.length ? Math.max(...finiteLengths) : null,
    zeroLengthCommandCount,
    belowMinimumCommandCount,
    aboveMaximumCommandCount,
    forbiddenOperationCount,
    exactFieldSetMismatchCount,
    nonFiniteCoordinateCount,
  };

  add('adapterVersion', candidate?.adapterVersion === PRODUCTIVE_ADAPTER_VERSION);
  add('sourceModelVersion', labCommandModel?.modelVersion === SOURCE_MODEL_VERSION);
  add('targetContractSupported', isSupportedProductiveTargetContract(targetContract));
  add('targetContractAuditHash', candidate?.targetContractAuditHash === TARGET_CONTRACT_AUDIT_HASH);
  add('contractCompatibility', candidate?.contractCompatibility === CONTRACT_COMPATIBILITY);
  add('candidateOnly', candidate?.candidateOnly === true);
  add('notIntegrated', candidate?.integrated === false);
  add('notMachineReady', candidate?.machineReady === false && candidate?.exportReady === false);
  add('notValidatedDownstream',
    candidate?.ce01Validated === false
      && candidate?.encoderValidated === false
      && candidate?.physicallyValidated === false);
  add('startAnchorPreserved',
    samePoint(candidate?.startAnchor?.pointMm, labCommandModel?.startAnchorMm)
      && candidate?.startAnchor?.source === 'labCommandModel.startAnchorMm'
      && candidate?.startAnchor?.requiresExternalSequencing === true);
  add('noStartAnchorCommand', productiveCommands.length === labCommands.length);
  add('oneToOneCount',
    metrics.productiveCommandCount === metrics.labCommandCount
      && metrics.traceCount === metrics.labCommandCount);
  add('coordinatesExact', coordinateMismatchCount === 0 && maximumCoordinateDeltaMm === 0);
  add('orderExact', orderingMismatchCount === 0);
  add('operationExact', operationMismatchCount === 0 && forbiddenOperationCount === 0);
  add('fieldSetExact', exactFieldSetMismatchCount === 0);
  add('pathLengthExact', Number.isFinite(pathLengthDeltaMm) && Math.abs(pathLengthDeltaMm) <= 1e-12);
  add('finiteCoordinates', nonFiniteCoordinateCount === 0);
  add('lengthWindow',
    zeroLengthCommandCount === 0
      && belowMinimumCommandCount === 0
      && aboveMaximumCommandCount === 0);
  add('noMissingOrAdditionalCommands',
    missingCommandCount === 0 && additionalCommandCount === 0);
  add('recoveredPathComplete',
    recovered.valid
      && recovered.pointsMm.length === labCommands.length + 1
      && coordinateMismatchCount === 0);

  const failed = checks.filter((check) => !check.satisfied);
  return {
    valid: failed.length === 0,
    checks,
    failedChecks: failed.map(
      (check) => `${check.name}${check.detail ? ` (${check.detail})` : ''}`,
    ),
    recoveredPath: recovered,
    metrics,
  };
}
