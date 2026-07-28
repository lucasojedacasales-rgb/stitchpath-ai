/**
 * syntheticSeedExample.js — Hatch Lab (P0.1)
 *
 * ⚠ SYNTHETIC. Not Hatch/Wilcom evidence. Exists ONLY to exercise the schema,
 * the validator, the normalizer and the report conclusion rules. Never use it
 * to derive rules; it can never conclude pass or fail.
 */

import { SEED_SCHEMA_VERSION } from './seedSchema.js';

export const syntheticSeedCase = Object.freeze({
  seedVersion: SEED_SCHEMA_VERSION,
  caseId: 'SYNTHETIC-A-0001',
  phase: 'A_WIDTHS',
  title: 'Synthetic schema-verification case (not real evidence)',
  source: { tool: 'synthetic', version: 'n/a', author: 'hatchLab P0.1', date: null },
  input: { imageRef: null, description: 'placeholder input, no real design attached' },
  dimensionsMm: { width: 100, height: 100 },
  testedSizeMm: { width: 100, height: 100 },
  fabric: null,
  configuration: null,
  observation: { text: 'placeholder observation used to verify field separation', measured: false },
  expectedResult: null,
  candidateRules: [],
  ruleScope: { phase: 'A_WIDTHS', geometryClass: null, sizeRangeMm: null, fabric: null },
  exceptions: [],
  evidence: [
    {
      evidenceId: 'SYNTHETIC-EV-1',
      type: 'note',
      reference: 'inline://synthetic-placeholder',
      extractable: false,
      description: 'placeholder note; no parser, no measurement',
      sourceReliability: 'anecdotal',
    },
  ],
  confidence: 'hypothetical',
  viability: 'insufficient',
  holdout: false,
  syntheticExample: true,
});

/** Valid criteria example — used only against synthetic pass/fail blocking. */
export const validCriteriaExample = Object.freeze({
  criteria: [
    {
      metric: 'regionCount',
      operator: 'equals',
      value: 1,
      required: true,
      tolerance: { absolute: 0, relative: 0 },
    },
  ],
});

/**
 * A synthetic case that carries a (valid) expectedResult and tries to force
 * pass/fail. The report must ignore it and conclude no_expected_result.
 */
export const syntheticCaseWithCriteria = Object.freeze({
  ...syntheticSeedCase,
  caseId: 'SYNTHETIC-A-0002',
  expectedResult: validCriteriaExample,
});

/** Invalid variants — the test suite proves the validator rejects each one. */
export const syntheticInvalidCases = Object.freeze({
  emptyCaseId: { ...syntheticSeedCase, caseId: '' },
  unknownPhase: { ...syntheticSeedCase, phase: 'H_UNKNOWN' },
  missingVersion: { ...syntheticSeedCase, seedVersion: undefined },
  syntheticConfirmed: { ...syntheticSeedCase, confidence: 'confirmed' },
  negativeDimensions: { ...syntheticSeedCase, dimensionsMm: { width: -10, height: 0 } },
  emptyExpectedResult: { ...syntheticSeedCase, syntheticExample: false, expectedResult: { criteria: [] } },
  unknownExpectedMetric: {
    ...syntheticSeedCase, syntheticExample: false,
    expectedResult: { criteria: [{ metric: 'totallyMadeUpMetric', operator: 'equals', value: 1, required: true }] },
  },
  unknownOperator: {
    ...syntheticSeedCase, syntheticExample: false,
    expectedResult: { criteria: [{ metric: 'regionCount', operator: 'approximately', value: 1, required: true }] },
  },
  nanValue: {
    ...syntheticSeedCase, syntheticExample: false,
    expectedResult: { criteria: [{ metric: 'regionCount', operator: 'equals', value: NaN, required: true }] },
  },
  requiredNotBoolean: {
    ...syntheticSeedCase, syntheticExample: false,
    expectedResult: { criteria: [{ metric: 'regionCount', operator: 'equals', value: 1, required: 'yes' }] },
  },
  incompatibleOperator: {
    ...syntheticSeedCase, syntheticExample: false,
    expectedResult: { criteria: [{ metric: 'colorSequence', operator: 'equals', value: 1, required: true }] },
  },
  duplicatedEvidence: {
    ...syntheticSeedCase,
    evidence: [
      { evidenceId: 'DUP-1', type: 'note', reference: 'inline://a', extractable: false, description: null, sourceReliability: 'observed' },
      { evidenceId: 'DUP-1', type: 'note', reference: 'inline://b', extractable: false, description: null, sourceReliability: 'observed' },
    ],
  },
  extractableEmb: {
    ...syntheticSeedCase,
    evidence: [
      { evidenceId: 'EMB-1', type: 'emb', reference: 'file://sample.emb', extractable: true, description: 'claims extractable without a parser', sourceReliability: 'documented' },
    ],
  },
  observationAsRule: {
    ...syntheticSeedCase,
    candidateRules: [{ ruleId: 'R-1', text: 'looks narrower' }],
  },
});