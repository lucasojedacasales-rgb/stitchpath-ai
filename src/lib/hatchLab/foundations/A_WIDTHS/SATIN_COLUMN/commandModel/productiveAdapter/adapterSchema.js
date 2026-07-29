/**
 * P1.F2 isolated productive-command shape adapter vocabulary.
 *
 * This module describes a laboratory candidate only. It does not import or
 * execute flattenToCommands, buildFinalCommands, CE01, an encoder, or an export.
 */

import {
  COMMAND_MODEL_VERSION,
  FORBIDDEN_OPS as LAB_FORBIDDEN_OPS,
  LENGTH_LIMITS,
} from '../commandModelSchema.js';

export const PRODUCTIVE_ADAPTER_VERSION =
  'P1.F2-A_WIDTHS-STRAIGHT-SATIN-PRODUCTIVE-COMMAND-ADAPTER-V1';
export const PRODUCTIVE_ADAPTER_ID =
  'P1.F2-A_WIDTHS-STRAIGHT-SATIN-PRODUCTIVE-SHAPE-CANDIDATE-V1';

export const TARGET_CONTRACT_ID =
  'STITCHPATH-FLATTEN-TO-COMMANDS-ABSOLUTE-MM-STITCH-CORE-V1';
export const CONTRACT_COMPATIBILITY =
  'PRODUCTIVE_MM_CONTRACT_REQUIRES_START_ANCHOR_ADAPTER';

export const SOURCE_MODEL_VERSION = COMMAND_MODEL_VERSION;
export const PRODUCTIVE_COMMAND_FIELDS = Object.freeze([
  'type',
  'x',
  'y',
  'regionId',
]);
export const PRODUCTIVE_STITCH_LITERAL = 'stitch';

export const FORBIDDEN_PRODUCTIVE_OPERATIONS = Object.freeze([
  ...LAB_FORBIDDEN_OPS,
  'color_change',
  'colorChange',
]);

export const ADAPTER_LENGTH_LIMITS = Object.freeze({
  minStitchLengthMm: LENGTH_LIMITS.minStitchLengthMm,
  maxStitchLengthMm: LENGTH_LIMITS.maxStitchLengthMm,
});

export const INTEGRATION_REQUIREMENTS = Object.freeze([
  'external sequencing must place the needle at startAnchor.pointMm',
  'external productive context must supply thread color when required',
  'a later phase must validate the candidate against CE01 in shadow mode',
  'a later phase must validate encoder quantization and machine behavior',
]);

export const ADAPTER_ISOLATION = Object.freeze({
  phase: 'P1.F2',
  candidateOnly: true,
  integrated: false,
  machineReady: false,
  exportReady: false,
  ce01Validated: false,
  encoderValidated: false,
  physicallyValidated: false,
  productiveImports: Object.freeze([]),
  enginesExecuted: Object.freeze([]),
  runPipelineExecuted: false,
  buildFinalCommandsExecuted: false,
  ce01Executed: false,
  encodersExecuted: false,
  exportsPerformed: false,
  mutatesRegions: false,
  changesStitchType: false,
});

export const PRODUCTIVE_ADAPTER_HASH_EXCLUDED_KEYS = Object.freeze([
  'productiveAdapterHash',
  'fixtureSha256',
  'generatedAt',
]);
