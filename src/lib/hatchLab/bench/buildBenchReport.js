/**
 * buildBenchReport.js — Hatch Lab (P0)
 * Pure JSON report builder. Never mutates its inputs.
 * "pass" is never the default conclusion.
 */

import { REPORT_VERSION, CONCLUSIONS } from '../reports/reportSchema.js';
import { validateSeedCase } from '../seed/validateSeed.js';
import { compareMetrics } from './compareMetrics.js';

function resolveConclusion({ seedCase, seedValid, comparison }) {
  if (seedCase && !seedValid) return CONCLUSIONS.INVALID_CASE;
  if (!comparison.expectedResultProvided) return CONCLUSIONS.NO_EXPECTED_RESULT;
  if (!comparison.conclusive) return CONCLUSIONS.INCONCLUSIVE;
  if (comparison.regressions.length > 0) return CONCLUSIONS.FAIL;
  return CONCLUSIONS.PASS;
}

/**
 * @param {object} args
 *   { baselineId, candidateId, baselineMetrics, candidateMetrics,
 *     seedCase?, tolerances?, warnings?, timestamp? }
 */
export function buildBenchReport(args = {}) {
  const {
    baselineId = null,
    candidateId = null,
    baselineMetrics = {},
    candidateMetrics = {},
    seedCase = null,
    tolerances = null,
    warnings = [],
    timestamp = new Date().toISOString(),
  } = args;

  const seedValidation = seedCase ? validateSeedCase(seedCase) : null;
  const seedValid = seedValidation ? seedValidation.valid : true;
  const expectedResult = seedValid && seedCase ? seedCase.expectedResult || null : null;

  const comparison = compareMetrics(baselineMetrics, candidateMetrics, { tolerances, expectedResult });

  const allWarnings = [
    ...warnings,
    ...(seedValidation?.warnings || []).map(w => `seed:${w.code}:${w.message}`),
    ...(seedCase?.syntheticExample ? ['seed:SYNTHETIC_EXAMPLE:report based on a synthetic schema-verification case, not evidence'] : []),
    ...(comparison.unavailableMetrics.length ? [`metrics:UNAVAILABLE:${comparison.unavailableMetrics.length} metrics could not be compared`] : []),
  ];

  return {
    reportVersion: REPORT_VERSION,
    timestamp,
    baselineId,
    candidateId,
    seedCaseId: seedCase?.caseId ?? null,
    metrics: { baseline: baselineMetrics, candidate: candidateMetrics },
    comparison: {
      equal: comparison.equal,
      notComparable: comparison.notComparable,
      tolerancesUsed: comparison.tolerancesUsed,
      expectedResultProvided: comparison.expectedResultProvided,
      conclusive: comparison.conclusive,
      missingEssentialMetrics: comparison.missingEssentialMetrics,
    },
    unavailableMetrics: comparison.unavailableMetrics,
    warnings: allWarnings,
    regressions: comparison.regressions,
    improvements: comparison.improvements,
    informationalDifferences: comparison.informationalDifferences,
    seedValidation: seedValidation ? { valid: seedValidation.valid, errors: seedValidation.errors } : null,
    conclusion: resolveConclusion({ seedCase, seedValid, comparison }),
  };
}