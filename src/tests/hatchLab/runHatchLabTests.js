/**
 * runHatchLabTests.js — Hatch Lab (P0)
 * Aggregator following the repository convention (no test runner installed).
 * Not registered anywhere: import and call it manually from a console or a
 * future lab-only page.
 */

import { runSeedValidationTests } from './seedValidation.test.js';
import { runMetricExtractionTests } from './metricExtraction.test.js';
import { runMetricComparisonTests } from './metricComparison.test.js';
import { runMutationSafetyTests } from './mutationSafety.test.js';

export function runHatchLabTests() {
  const suites = [
    runSeedValidationTests(),
    runMetricExtractionTests(),
    runMetricComparisonTests(),
    runMutationSafetyTests(),
  ];
  const pass = suites.filter(s => s.pass).length;
  return {
    suites,
    summary: { total: suites.length, pass, fail: suites.length - pass },
  };
}