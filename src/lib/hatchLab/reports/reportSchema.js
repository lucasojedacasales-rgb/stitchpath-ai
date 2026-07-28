/**
 * reportSchema.js — Hatch Lab (P0)
 * Declarative shape + vocabulary of the benchmark report. No logic.
 */

export const REPORT_VERSION = '1.0.0';

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
  'metrics', 'comparison', 'unavailableMetrics', 'warnings', 'regressions',
  'improvements', 'informationalDifferences', 'conclusion',
]);

/** "pass" is never a default: it requires an expectedResult and zero regressions. */
export const CONCLUSION_RULES = Object.freeze({
  invalid_case: 'seed case failed validation',
  no_expected_result: 'no seed expectedResult available — direction of change undefined',
  inconclusive: 'essential metrics unavailable in baseline or candidate',
  fail: 'expectedResult present and at least one regression detected',
  pass: 'expectedResult present, no regressions, essential metrics available',
});