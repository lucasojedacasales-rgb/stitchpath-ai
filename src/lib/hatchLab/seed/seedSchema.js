/**
 * seedSchema.js — Hatch Lab (P0)
 * Versioned schema definition for Hatch/Wilcom A–G technical seed cases.
 * Declarative only: no validation logic here (see validateSeed.js).
 */

export const SEED_SCHEMA_VERSION = '1.0.0';

export const PHASES = Object.freeze([
  'A_WIDTHS',
  'B_HOLES',
  'C_OVERLAPS',
  'D_TECHNIQUES',
  'E_FABRICS',
  'F_SCALING',
  'G_LETTERING',
]);

export const CONFIDENCE_LEVELS = Object.freeze(['confirmed', 'probable', 'hypothetical']);
export const VIABILITY_LEVELS = Object.freeze(['high', 'medium', 'low', 'insufficient']);

export const EVIDENCE_TYPES = Object.freeze([
  'screenshot', 'emb', 'dst', 'dsb', 'image', 'note', 'table', 'report', 'measurement',
]);

export const SOURCE_RELIABILITY = Object.freeze(['documented', 'measured', 'observed', 'anecdotal']);

/**
 * Evidence types for which no verified parser exists in this repository.
 * Anything listed here MUST declare extractable: false.
 */
export const NON_EXTRACTABLE_TYPES = Object.freeze(['emb', 'screenshot', 'image', 'note']);

/** Parsers that actually exist and are verified for the lab. Empty by design in P0. */
export const VERIFIED_PARSERS = Object.freeze([]);

/**
 * Field contract. `required: true` fields are rejected when missing.
 * `observation` and `candidateRules` are deliberately separate fields: an
 * observation never becomes a rule implicitly.
 */
export const SEED_CASE_FIELDS = Object.freeze({
  seedVersion:      { type: 'string', required: true },
  caseId:           { type: 'string', required: true, nonEmpty: true },
  phase:            { type: 'enum', required: true, values: PHASES },
  title:            { type: 'string', required: false, default: null },
  source:           { type: 'object', required: true, shape: ['tool', 'version', 'author', 'date'] },
  input:            { type: 'object', required: false, shape: ['imageRef', 'description'], default: null },
  dimensionsMm:     { type: 'object', required: false, shape: ['width', 'height'], positive: true, default: null },
  testedSizeMm:     { type: 'object', required: false, shape: ['width', 'height'], positive: true, default: null },
  fabric:           { type: 'string', required: false, default: null },
  configuration:    { type: 'object', required: false, default: null },
  observation:      { type: 'object', required: false, shape: ['text', 'measured'], default: null },
  expectedResult:   { type: 'object', required: false, default: null },
  candidateRules:   { type: 'array', required: false, default: [], itemShape: ['ruleId', 'expression', 'parameters'] },
  ruleScope:        { type: 'object', required: false, shape: ['phase', 'geometryClass', 'sizeRangeMm', 'fabric'], default: null },
  exceptions:       { type: 'array', required: false, default: [] },
  evidence:         { type: 'array', required: false, default: [], itemShape: ['evidenceId', 'type', 'reference', 'extractable', 'description', 'sourceReliability'] },
  confidence:       { type: 'enum', required: true, values: CONFIDENCE_LEVELS },
  viability:        { type: 'enum', required: false, values: VIABILITY_LEVELS, default: 'insufficient' },
  holdout:          { type: 'boolean', required: false, default: false },
  syntheticExample: { type: 'boolean', required: false, default: false },
});

export const EVIDENCE_FIELDS = Object.freeze({
  evidenceId:       { type: 'string', required: true, nonEmpty: true },
  type:             { type: 'enum', required: true, values: EVIDENCE_TYPES },
  reference:        { type: 'string', required: true, nonEmpty: true },
  extractable:      { type: 'boolean', required: true },
  description:      { type: 'string', required: false, default: null },
  sourceReliability:{ type: 'enum', required: false, values: SOURCE_RELIABILITY, default: 'observed' },
});