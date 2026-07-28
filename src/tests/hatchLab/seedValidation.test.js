/**
 * seedValidation.test.js — Hatch Lab (P0)
 *
 * The repository has no test runner installed (no vitest/jest in package.json).
 * Following the existing convention (src/tests/runEmbroideryRegression.js),
 * each suite exports a pure runner returning { name, pass, fails }.
 */

import { validateSeedCase, validateSeedCollection } from '@/lib/hatchLab/seed/validateSeed';
import { normalizeSeedCase } from '@/lib/hatchLab/seed/normalizeSeed';
import { syntheticSeedCase, syntheticInvalidCases } from '@/lib/hatchLab/seed/syntheticSeedExample';

export function runSeedValidationTests() {
  const fails = [];
  const ok = (cond, msg) => { if (!cond) fails.push(msg); };
  const hasCode = (res, code) => res.errors.some(e => e.code === code);

  // valid synthetic seed
  const valid = validateSeedCase(syntheticSeedCase);
  ok(valid.valid, `synthetic case should validate: ${JSON.stringify(valid.errors)}`);
  ok(valid.warnings.some(w => w.code === 'NOT_EVIDENCE'), 'synthetic case should warn it is not evidence');

  // invalid variants
  ok(hasCode(validateSeedCase(syntheticInvalidCases.emptyCaseId), 'EMPTY_CASE_ID'), 'empty caseId not rejected');
  ok(hasCode(validateSeedCase(syntheticInvalidCases.unknownPhase), 'UNKNOWN_PHASE'), 'unknown phase not rejected');
  ok(hasCode(validateSeedCase(syntheticInvalidCases.missingVersion), 'MISSING_VERSION'), 'missing seedVersion not rejected');
  ok(hasCode(validateSeedCase(syntheticInvalidCases.syntheticConfirmed), 'SYNTHETIC_CANNOT_BE_CONFIRMED'), 'synthetic case allowed to be confirmed');
  ok(hasCode(validateSeedCase(syntheticInvalidCases.negativeDimensions), 'NOT_POSITIVE'), 'non-positive dimensions not rejected');
  ok(hasCode(validateSeedCase(syntheticInvalidCases.duplicatedEvidence), 'DUPLICATE_EVIDENCE'), 'duplicated evidence not detected');
  ok(hasCode(validateSeedCase(syntheticInvalidCases.extractableEmb), 'NO_VERIFIED_PARSER'), 'extractable EMB not rejected');
  ok(hasCode(validateSeedCase(syntheticInvalidCases.observationAsRule), 'OBSERVATION_AS_RULE'), 'observation disguised as rule not rejected');

  // confirmed without evidence
  const confirmedNoEvidence = validateSeedCase({ ...syntheticSeedCase, syntheticExample: false, confidence: 'confirmed', evidence: [] });
  ok(hasCode(confirmedNoEvidence, 'CONFIRMED_WITHOUT_EVIDENCE'), 'confirmed case without evidence accepted');

  // collection: duplicated caseIds
  const coll = validateSeedCollection([syntheticSeedCase, syntheticSeedCase]);
  ok(coll.errors.some(e => e.code === 'DUPLICATE_CASE_ID'), 'duplicated caseId in collection not detected');

  // normalization never raises confidence and never invents zeros
  const norm = normalizeSeedCase({ caseId: 'X', phase: 'B_HOLES' });
  ok(norm.confidence === 'hypothetical', `normalizer raised confidence to ${norm.confidence}`);
  ok(norm.expectedResult === null, 'missing expectedResult must be null, not a value');
  ok(norm.dimensionsMm === null, 'missing dimensions must be null, not 0');
  ok(Array.isArray(norm.evidence) && norm.evidence.length === 0, 'evidence must default to an empty array');

  return { name: 'hatchLab/seedValidation', pass: fails.length === 0, fails };
}