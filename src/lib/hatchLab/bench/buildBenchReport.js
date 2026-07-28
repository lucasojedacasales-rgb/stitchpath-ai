/**
 * buildBenchReport.js — Hatch Lab (P0.1)
 * Pure JSON report builder. Never mutates inputs. "pass" is never a default
 * and never derives from mere absence of regressions.
 */

import { REPORT_VERSION, CONCLUSIONS } from '../reports/reportSchema.js';
import { validateSeedCase, validateExpectedResult } from '../seed/validateSeed.js';
import { compareMetrics } from './compareMetrics.js';

/**
 * @param {object} args
 *   { baselineId, candidateId, baselineExtraction, candidateExtraction,
 *     seedCase?, expectedResult? (only when no seedCase), warnings?, timestamp? }
 *   *Extraction = full { metrics, availability, warnings } from extractMetrics.
 */
export function buildBenchReport(args = {}) {
  const {
    baselineId = null,
    candidateId = null,
    baselineExtraction = { metrics: {}, availability: {}, warnings: [] },
    candidateExtraction = { metrics: {}, availability: {}, warnings: [] },
    seedCase = null,
    warnings = [],
    timestamp = new Date().toISOString(),
  } = args;

  const syntheticCase = seedCase?.syntheticExample === true;
  const seedValidation = seedCase ? validateSeedCase(seedCase) : null;
  const expectedResult = seedCase ? (seedCase.expectedResult ?? null) : (args.expectedResult ?? null);
  const erValidation = seedCase ? null : validateExpectedResult(expectedResult);

  // synthetic expectedResult is IGNORED for approval purposes
  const evaluableExpectedResult = syntheticCase ? null : expectedResult;
  const comparison = compareMetrics(baselineExtraction, candidateExtraction, { expectedResult: evaluableExpectedResult });

  const criteria = comparison.criteria || [];
  const required = criteria.filter(c => c.required && !c.invalid);
  const satisfiedCriteria = criteria.filter(c => c.evaluated && c.satisfied === true);
  const failedCriteria = criteria.filter(c => c.evaluated && c.satisfied === false);
  const unavailableRequiredCriteria = required.filter(c => !c.available);
  const incompleteRequiredCriteria = required.filter(c => c.available && !c.complete);
  const notComparableRequired = required.filter(c => c.notComparable === true);
  const unevaluatedRequired = required.filter(c => !c.evaluated);
  const invalidCriteria = comparison.invalidCriteria || [];

  // ── conclusion resolution (exact rules — see reportSchema.CONCLUSION_RULES) ──
  let conclusion;
  let conclusionReason;

  const hasCriteria = expectedResult && Array.isArray(expectedResult.criteria) && expectedResult.criteria.length > 0;

  if (seedCase && !seedValidation.valid) {
    conclusion = CONCLUSIONS.INVALID_CASE;
    conclusionReason = `seed case invalid: ${seedValidation.errors.map(e => e.code).join(', ')}`;
  } else if (!seedCase && erValidation.errors.length > 0) {
    conclusion = CONCLUSIONS.INVALID_CASE;
    conclusionReason = `expectedResult invalid: ${erValidation.errors.map(e => e.code).join(', ')}`;
  } else if (invalidCriteria.length > 0) {
    conclusion = CONCLUSIONS.INVALID_CASE;
    conclusionReason = `invalid criteria: ${invalidCriteria.map(c => c.reason).join('; ')}`;
  } else if (syntheticCase) {
    conclusion = CONCLUSIONS.NO_EXPECTED_RESULT;
    conclusionReason = 'syntheticExample case — expectedResult ignored for approval; synthetic cases can never conclude pass or fail';
  } else if (!hasCriteria) {
    conclusion = CONCLUSIONS.NO_EXPECTED_RESULT;
    conclusionReason = 'no expectedResult criteria to evaluate';
  } else if (required.length === 0) {
    conclusion = CONCLUSIONS.INCONCLUSIVE;
    conclusionReason = 'no required criterion declared — a pass cannot be granted without at least one required criterion';
  } else if (unavailableRequiredCriteria.length > 0 || incompleteRequiredCriteria.length > 0 ||
             notComparableRequired.length > 0 || unevaluatedRequired.length > 0) {
    conclusion = CONCLUSIONS.INCONCLUSIVE;
    const parts = [];
    if (unavailableRequiredCriteria.length) parts.push(`${unavailableRequiredCriteria.length} required metric(s) unavailable`);
    if (incompleteRequiredCriteria.length) parts.push(`${incompleteRequiredCriteria.length} required metric(s) incomplete`);
    if (notComparableRequired.length) parts.push(`${notComparableRequired.length} required criterion/criteria not comparable`);
    const other = unevaluatedRequired.filter(c => c.available && c.complete && !c.notComparable);
    if (other.length) parts.push(`${other.length} required criterion/criteria could not be evaluated`);
    conclusionReason = parts.join('; ');
  } else if (required.some(c => c.satisfied === false)) {
    conclusion = CONCLUSIONS.FAIL;
    const failedReq = required.filter(c => c.satisfied === false);
    conclusionReason = `required criteria not satisfied: ${failedReq.map(c => `${c.metric} (${c.reason})`).join('; ')}`;
  } else {
    conclusion = CONCLUSIONS.PASS;
    conclusionReason = `all ${required.length} required criterion/criteria evaluated and satisfied on complete, comparable data`;
  }

  const allWarnings = [
    ...warnings,
    ...(seedValidation?.warnings || []).map(w => `seed:${w.code}:${w.message}`),
    ...(syntheticCase ? ['SYNTHETIC_EXAMPLE: report based on a synthetic schema-verification case — never evidence, never pass/fail'] : []),
    ...(comparison.unavailableMetrics.length ? [`metrics:UNAVAILABLE:${comparison.unavailableMetrics.length} informational metric(s) not comparable`] : []),
  ];

  return {
    reportVersion: REPORT_VERSION,
    timestamp,
    baselineId,
    candidateId,
    seedCaseId: seedCase?.caseId ?? null,
    syntheticCase,
    metrics: { baseline: baselineExtraction.metrics, candidate: candidateExtraction.metrics },
    metricAvailability: { baseline: baselineExtraction.availability, candidate: candidateExtraction.availability },
    extractionWarnings: {
      baseline: baselineExtraction.warnings || [],
      candidate: candidateExtraction.warnings || [],
    },
    comparison: {
      equal: comparison.equal,
      notComparable: comparison.notComparable,
      expectedResultProvided: comparison.expectedResultProvided,
    },
    evaluatedCriteria: criteria,
    satisfiedCriteria,
    failedCriteria,
    unavailableRequiredCriteria,
    incompleteRequiredCriteria,
    unknownExpectedMetrics: comparison.unknownExpectedMetrics || [],
    unavailableMetrics: comparison.unavailableMetrics,
    warnings: allWarnings,
    regressions: failedCriteria.filter(c => c.required),
    improvements: satisfiedCriteria.filter(c => c.operator === 'relative_to_baseline'),
    informationalDifferences: comparison.informationalDifferences,
    seedValidation: seedValidation ? { valid: seedValidation.valid, errors: seedValidation.errors } : (erValidation ? { valid: erValidation.errors.length === 0, errors: erValidation.errors } : null),
    conclusion,
    conclusionReason,
  };
}