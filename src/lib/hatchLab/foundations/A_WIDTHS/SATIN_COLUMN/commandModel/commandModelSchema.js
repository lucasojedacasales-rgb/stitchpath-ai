/**
 * commandModelSchema.js — P1.F1 lab command model vocabulary and limits.
 *
 * This is a LABORATORY representation. It is deliberately NOT the productive
 * command shape of buildFinalCommands / flattenToCommands, and it is not a
 * machine command nor an export format. See productiveCommandContractAudit.md.
 */

export const COMMAND_MODEL_VERSION = 'P1.F1-A_WIDTHS-STRAIGHT-SATIN-LAB-COMMAND-MODEL-V1';
export const COMPILER_VERSION = 'compileStraightSatinCandidateToLabCommands@P1.F1-V1';

export const COORDINATE_SPACE = 'mm';

/** The only op this model may emit. */
export const ALLOWED_OPS = ['stitch'];

/** Segment classification vocabulary. */
export const SEGMENT_KINDS = ['cross_column', 'advance_diagonal'];

export const RAIL_LABELS = ['left', 'right'];

/**
 * Ops that belong to the productive/machine layers. Their presence in a lab
 * model is a validation FAILURE — never silently stripped.
 */
export const FORBIDDEN_OPS = [
  'jump', 'trim', 'color_change', 'colorChange', 'stop', 'end',
  'tie_in', 'tie_off', 'needle_up', 'needle_down',
  'underlay', 'compensation', 'export', 'machine_code',
];

/**
 * Audit-only stitch length window.
 * Provenance: machineSettings of BASE-ENGINE-A-WIDTHS-V1 (minStitchLength 0.3 mm;
 * maxStitchLength 12.1 mm, matching the ±121 unit DST delta limit).
 * These are NOT Hatch parameters and NOT a learned rule. They are never enforced
 * by mutation: no merging, no filtering, no autoSplit — diagnostics only.
 */
export const LENGTH_LIMITS = {
  minStitchLengthMm: 0.3,
  maxStitchLengthMm: 12.1,
  provenance: 'baseline machineSettings (BASE-ENGINE-A-WIDTHS-V1)',
  enforcement: 'diagnostic_only',
};

/** Compile statuses. */
export const COMPILE_STATUSES = [
  'unavailable',
  'ineligible',
  'metadata_conflict',
  'unsupported_requires_split',
  'invalid_geometry',
  'lab_command_model_complete',
  'lab_command_model_incomplete',
];

/** Field order used for the canonical form (hash stability). */
export const CANONICAL_COMMAND_FIELDS = [
  'commandIndex', 'op', 'fromMm', 'toMm', 'deltaMm', 'lengthMm',
  'segmentKind', 'sourcePointIndex', 'fromStationIndex', 'toStationIndex',
  'fromRail', 'toRail',
];

/** Envelope keys excluded from the hashed canonical form. */
export const HASH_EXCLUDED_KEYS = ['commandModelHash', 'generatedAt', 'fixturePath', 'fixtureSha256'];

export const LAYER_SEPARATION = {
  geometryCandidate: 'paired boundary zigzag points in mm (P1.F0 / P1.F0.2)',
  labCommandModel: 'this model: local per-segment stitch moves, absolute mm, no sequencing',
  productiveCommandContract: 'flattenToCommands objects { type, x, y, color, regionId, ... } — NOT produced here',
  machineCommand: 'encoder-level 0.1 mm deltas with control flags — NOT produced here',
  exportFormat: 'DST / DSB bytes — NOT produced here',
};