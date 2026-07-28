/**
 * seedValidation.test.js — Hatch Lab (P0.1)
 * Pure suite (repo convention: no test runner installed). Returns { name, pass, fails, checks }.
 */

import { validateSeedCase, validateSeedCollection, validateExpectedResult } from '@/lib/hatchLab/seed/validateSeed';
import { normalizeSeedCase, prepareSeedCase } from '@/lib/hatchLab/seed/normalizeSeed';
import { syntheticSeedCase, syntheticInvalidCases, validCriteriaExample } from '@/lib/hatchLab/seed/syntheticSeedExample';

export function runSeedValidationTests() {
  const fails = [];
  let checks = 0;
  const ok = (cond, msg) => { checks++; if (!cond) fails.push(msg); };
  const hasCode = (res, code) => res.errors.some(e => e.code === code);

  // valid synthetic seed
  const valid = validateSeedCase(syntheticSeedCase);
  ok(valid.valid, `synthetic case should validate: ${JSON.stringify(valid.errors)}`);
  ok(valid.warnings.some(w => w.code === 'SYNTHETIC_EXAMPLE'), 'synthetic case should carry SYNTHETIC_EXAMPLE warning');

  // invalid variants
  ok(hasCode(validateSeedCase(syntheticInvalidCases.emptyCaseId), 'EMPTY_CASE_ID'), 'empty caseId not rejected');
  ok(hasCode(validateSeedCase(syntheticInvalidCases.unknownPhase), 'UNKNOWN_PHASE'), 'unknown phase not rejected');
  ok(hasCode(validateSeedCase(syntheticInvalidCases.missingVersion), 'MISSING_VERSION'), 'missing seedVersion not rejected');
  ok(hasCode(validateSeedCase(syntheticInvalidCases.syntheticConfirmed), 'SYNTHETIC_CANNOT_BE_CONFIRMED'), 'synthetic case allowed to be confirmed');
  ok(hasCode(validateSeedCase(syntheticInvalidCases.negativeDimensions), 'NOT_POSITIVE'), 'non-positive dimensions not rejected');
  ok(hasCode(validateSeedCase(syntheticInvalidCases.duplicatedEvidence), 'DUPLICATE_EVIDENCE'), 'duplicated evidence not detected');
  ok(hasCode(validateSeedCase(syntheticInvalidCases.extractableEmb), 'NO_VERIFIED_PARSER'), 'extractable EMB not rejected');
  ok(hasCode(validateSeedCase(syntheticInvalidCases.observationAsRule), 'OBSERVATION_AS_RULE'), 'observation disguised as rule not rejected');

  // expectedResult validation (v1.1.0)
  ok(hasCode(validateSeedCase(syntheticInvalidCases.emptyExpectedResult), 'EMPTY_EXPECTED_RESULT'), 'empty expectedResult.criteria not rejected');
  ok(hasCode(validateSeedCase(syntheticInvalidCases.unknownExpectedMetric), 'UNKNOWN_EXPECTED_METRIC'), 'unknown expected metric not rejected');
  ok(hasCode(validateSeedCase(syntheticInvalidCases.unknownOperator), 'UNKNOWN_OPERATOR'), 'unknown operator not rejected');
  ok(hasCode(validateSeedCase(syntheticInvalidCases.nanValue), 'INVALID_VALUE'), 'NaN value not rejected');
  ok(hasCode(validateSeedCase(syntheticInvalidCases.requiredNotBoolean), 'REQUIRED_NOT_BOOLEAN'), 'non-boolean required not rejected');
  ok(hasCode(validateSeedCase(syntheticInvalidCases.incompatibleOperator), 'INCOMPATIBLE_OPERATOR'), 'operator/metric-type mismatch not rejected');
  const badBetween = validateExpectedResult({ criteria: [{ metric: 'regionCount', operator: 'between', min: 5, max: 1, required: true }] });
  ok(badBetween.errors.some(e => e.code === 'INVALID_VALUE'), 'between with min > max not rejected');
  const badTol = validateExpectedResult({ criteria: [{ metric: 'regionCount', operator: 'equals', value: 1, required: true, tolerance: { absolute: -1 } }] });
  ok(badTol.errors.some(e => e.code === 'INVALID_TOLERANCE'), 'negative tolerance not rejected');
  const validER = validateExpectedResult(validCriteriaExample);
  ok(validER.errors.length === 0 && !validER.empty, `valid criteria rejected: ${JSON.stringify(validER.errors)}`);

  // confirmed without evidence
  const confirmedNoEvidence = validateSeedCase({ ...syntheticSeedCase, syntheticExample: false, confidence: 'confirmed', evidence: [] });
  ok(hasCode(confirmedNoEvidence, 'CONFIRMED_WITHOUT_EVIDENCE'), 'confirmed case without evidence accepted');

  // collection duplicates
  const coll = validateSeedCollection([syntheticSeedCase, syntheticSeedCase]);
  ok(coll.errors.some(e => e.code === 'DUPLICATE_CASE_ID'), 'duplicated caseId in collection not detected');

  // ── safe normalization: required fields are NEVER auto-filled ──
  const bare = normalizeSeedCase({ title: 'x' });
  ok(bare.seedVersion === null, `missing seedVersion must stay null, got "${bare.seedVersion}"`);
  ok(bare.caseId === null, 'missing caseId must stay null');
  ok(bare.phase === null, 'missing phase must stay null');
  ok(bare.confidence === null, `missing confidence must stay null, got "${bare.confidence}"`);
  ok(bare.source === null, 'missing source must stay null');
  ok(bare.expectedResult === null, 'missing expectedResult must be null');
  ok(bare.dimensionsMm === null, 'missing dimensions must be null, not 0');

  // invalid case stays invalid after normalization; prepareSeedCase refuses it
  const prepared = prepareSeedCase({ title: 'still invalid' });
  ok(prepared.validation.valid === false, 'prepareSeedCase validated an invalid case');
  ok(prepared.normalized === null, 'prepareSeedCase normalized an invalid case');
  const renormalized = validateSeedCase(normalizeSeedCase({ title: 'still invalid' }));
  ok(renormalized.valid === false, 'normalizing an invalid case made it valid');

  // valid case flows through prepare
  const preparedValid = prepareSeedCase(syntheticSeedCase);
  ok(preparedValid.validation.valid === true && preparedValid.normalized !== null, 'valid case failed prepare flow');
  ok(preparedValid.normalized.confidence === 'hypothetical', 'normalizer altered a valid confidence');

  return { name: 'hatchLab/seedValidation', pass: fails.length === 0, fails, checks };
}