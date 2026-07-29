/**
 * Verified field map from a P1.F1 segment command to the common productive
 * stitch-command core emitted by exportPipeline.flattenToCommands.
 *
 * The target deliberately excludes fields for which the lab model has no
 * authoritative value. Their absence is an integration requirement, not a
 * fabricated default.
 */

import { canonicalStringify, fnv1a32 } from '../canonicalizeLabSatinCommands.js';
import {
  CONTRACT_COMPATIBILITY,
  PRODUCTIVE_COMMAND_FIELDS,
  PRODUCTIVE_STITCH_LITERAL,
  TARGET_CONTRACT_ID,
} from './adapterSchema.js';

export const PRODUCTIVE_COMMAND_FIELD_MAP = Object.freeze({
  type: Object.freeze({
    source: 'labCommand.op',
    transform: 'literal-preserving rename',
    sourceLiteral: 'stitch',
    targetLiteral: PRODUCTIVE_STITCH_LITERAL,
  }),
  x: Object.freeze({
    source: 'labCommand.toMm[0]',
    transform: 'identity',
    unit: 'mm',
    coordinateMode: 'absolute',
  }),
  y: Object.freeze({
    source: 'labCommand.toMm[1]',
    transform: 'identity',
    unit: 'mm',
    coordinateMode: 'absolute',
  }),
  regionId: Object.freeze({
    source: 'labCommandModel.regionId',
    transform: 'identity',
  }),
});

const TARGET_CONTRACT_BASE = {
  contractId: TARGET_CONTRACT_ID,
  producerFile: 'src/lib/exportPipeline.js',
  producerFunction: 'flattenToCommands',
  immediateConsumer: 'buildFinalCommands',
  operationField: 'type',
  stitchLiteral: PRODUCTIVE_STITCH_LITERAL,
  xField: 'x',
  yField: 'y',
  coordinateSpace: 'mm',
  coordinateMode: 'absolute',
  exactCommandFields: [...PRODUCTIVE_COMMAND_FIELDS],
  requiredConsumerFields: ['type', 'x', 'y'],
  contextualFields: ['regionId'],
  compatibility: CONTRACT_COMPATIBILITY,
  quantized: false,
};

export const TARGET_CONTRACT_AUDIT_HASH =
  `fnv1a32:${fnv1a32(canonicalStringify(TARGET_CONTRACT_BASE))}`;

export const PRODUCTIVE_COMMAND_TARGET_CONTRACT = Object.freeze({
  ...TARGET_CONTRACT_BASE,
  exactCommandFields: Object.freeze([...TARGET_CONTRACT_BASE.exactCommandFields]),
  requiredConsumerFields: Object.freeze([...TARGET_CONTRACT_BASE.requiredConsumerFields]),
  contextualFields: Object.freeze([...TARGET_CONTRACT_BASE.contextualFields]),
  targetContractAuditHash: TARGET_CONTRACT_AUDIT_HASH,
});

export function isSupportedProductiveTargetContract(contract) {
  if (!contract || typeof contract !== 'object') return false;
  return contract.contractId === TARGET_CONTRACT_ID
    && contract.operationField === 'type'
    && contract.stitchLiteral === PRODUCTIVE_STITCH_LITERAL
    && contract.xField === 'x'
    && contract.yField === 'y'
    && contract.coordinateSpace === 'mm'
    && contract.coordinateMode === 'absolute'
    && contract.quantized === false
    && contract.compatibility === CONTRACT_COMPATIBILITY
    && canonicalStringify(contract.exactCommandFields) === canonicalStringify(PRODUCTIVE_COMMAND_FIELDS)
    && contract.targetContractAuditHash === TARGET_CONTRACT_AUDIT_HASH;
}
