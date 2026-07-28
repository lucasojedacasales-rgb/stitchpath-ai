/**
 * seedSchema.js — Hatch Lab (P0.1)
 * Versioned schema definition for Hatch/Wilcom A–G technical seed cases.
 * Declarative only: validation logic lives in validateSeed.js.
 *
 * v1.1.0 changes:
 *  - expectedResult is now { criteria: [...] } with explicit operators and
 *    real target values. relative_to_baseline is the only baseline-relative
 *    operator. observation remains a strictly separate field.
 */

export const SEED_SCHEMA_VERSION = '1.1.0';

export const PHASES = Object.freeze([
  'A_WIDTHS', 'B_HOLES', 'C_OVERLAPS', 'D_TECHNIQUES',
  'E_FABRICS', 'F_SCALING', 'G_LETTERING',
]);

export const CONFIDENCE_LEVELS = Object.freeze(['confirmed', 'probable', 'hypothetical']);
export const VIABILITY_LEVELS = Object.freeze(['high', 'medium', 'low', 'insufficient']);

export const EVIDENCE_TYPES = Object.freeze([
  'screenshot', 'emb', 'dst', 'dsb', 'image', 'note', 'table', 'report', 'measurement',
]);

export const SOURCE_RELIABILITY = Object.freeze(['documented', 'measured', 'observed', 'anecdotal']);

/**
 * Evidence types with no verified parser in this repository — anything listed
 * here MUST declare extractable: false. VERIFIED_PARSERS stays empty in P0.
 */
export const NON_EXTRACTABLE_TYPES = Object.freeze(['emb', 'screenshot', 'image', 'note']);
export const VERIFIED_PARSERS = Object.freeze([]);

/**
 * expectedResult shape:
 * {
 *   criteria: [{
 *     metric: <key of bench METRIC_DEFS>,
 *     operator: 'equals'|'minimum'|'maximum'|'between'|'sequence_equals'|'set_equals'|'relative_to_baseline',
 *     value?: number|array,          // equals/minimum/maximum/sequence_equals/set_equals
 *     min?: number, max?: number,    // between
 *     direction?: 'higher'|'lower'|'equal',  // relative_to_baseline
 *     minimumDelta?: number, maximumDelta?: number, // relative_to_baseline (optional)
 *     required: boolean,             // mandatory, explicit
 *     tolerance?: { absolute?: number, relative?: number },
 *   }]
 * }
 */
export const CRITERION_FIELDS = Object.freeze([
  'metric', 'operator', 'value', 'min', 'max', 'direction',
  'minimumDelta', 'maximumDelta', 'required', 'tolerance',
]);

/** Top-level case fields. observation and expectedResult are separate by design. */
export const SEED_CASE_FIELDS = Object.freeze([
  'seedVersion', 'caseId', 'phase', 'title', 'source', 'input',
  'dimensionsMm', 'testedSizeMm', 'fabric', 'configuration', 'observation',
  'expectedResult', 'candidateRules', 'ruleScope', 'exceptions', 'evidence',
  'confidence', 'viability', 'holdout', 'syntheticExample',
]);