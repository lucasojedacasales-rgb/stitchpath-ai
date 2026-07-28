/**
 * reportSchema.js — Hatch Lab (P0.1)
 * Declarative shape + vocabulary of the benchmark report. No logic.
 */

export const REPORT_VERSION = '1.1.0';

export const CONCLUSIONS = Object.freeze({
  PASS: 'pass',
  FAIL: 'fail',
  INCONCLUSIVE: 'inconclusive',
  NO_EXPECTED_RESULT: 'no_expected_result',
  INVALID_CASE: 'invalid_case',
});

export const CONCLUSION_VALUES = Object.freeze(Object.values(CONCLUSIONS));

export const REPORT_FIELDS = Object.freeze([
  'reportVersion', 'timestamp', 'baselineId', 'candidateId', 'seedCaseId',
  'syntheticCase', 'metrics', 'metricAvailability', 'extractionWarnings',
  'comparison', 'evaluatedCriteria', 'satisfiedCriteria', 'failedCriteria',
  'unavailableRequiredCriteria', 'incompleteRequiredCriteria',
  'unknownExpectedMetrics', 'warnings', 'regressions', 'improvements',
  'informationalDifferences', 'seedValidation', 'conclusion', 'conclusionReason',
]);

/**
 * Exact conclusion rules (P0.1):
 *  invalid_case      — seed invalid, expectedResult invalid, unknown metric or operator.
 *  no_expected_result— syntheticExample case, no expectedResult, or empty criteria.
 *  inconclusive      — a required metric is unavailable / incomplete / notComparable,
 *                      unknown command types affect a required metric, or no required
 *                      criterion could be evaluated (including zero required criteria).
 *  fail              — at least one required criterion evaluated and not satisfied.
 *  pass              — valid non-synthetic seed, ≥1 required criterion, ALL required
 *                      criteria available + complete + comparable + evaluated + satisfied.
 * "pass" is NEVER a default and NEVER derives from mere absence of regressions.
 */
export const CONCLUSION_RULES = Object.freeze({
  invalid_case: 'seed or expectedResult failed validation',
  no_expected_result: 'no evaluable expectedResult (absent, empty criteria, or synthetic case)',
  inconclusive: 'required criteria could not all be evaluated reliably',
  fail: 'at least one required criterion evaluated and not satisfied',
  pass: 'all required criteria (≥1) evaluated and satisfied on complete data',
});