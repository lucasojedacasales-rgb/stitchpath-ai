/**
 * runHatchLabTests.js — Hatch Lab (P0.1)
 * Aggregator following the repository convention (no test runner installed).
 * Executed by hatchLabTests.html via the Vite dev server.
 */

import { runSeedValidationTests } from './seedValidation.test.js';
import { runMetricExtractionTests } from './metricExtraction.test.js';
import { runMetricComparisonTests } from './metricComparison.test.js';
import { runMutationSafetyTests } from './mutationSafety.test.js';
import { runAWidthsSeedIntegrityTests } from './aWidthsSeedIntegrity.test.js';
import { runSeedStructuralConformanceTests } from './seedStructuralConformance.test.js';
import { runAWidthsEvaluatorTests } from './aWidthsEvaluator.test.js';
import { runAWidthsBaselineHarnessTests } from './aWidthsBaselineHarness.test.js';
import { runAWidthsStoredBaselineTests } from './aWidthsStoredBaseline.test.js';
import { runAWidthsArchiveClosureTests } from './aWidthsArchiveClosure.test.js';
import { runAWidthsSatinFoundationTests } from './aWidthsSatinFoundation.test.js';

export function runHatchLabTests() {
  const suites = [];
  for (const fn of [runSeedValidationTests, runMetricExtractionTests, runMetricComparisonTests, runMutationSafetyTests, runAWidthsSeedIntegrityTests, runSeedStructuralConformanceTests, runAWidthsEvaluatorTests, runAWidthsBaselineHarnessTests, runAWidthsStoredBaselineTests, runAWidthsArchiveClosureTests, runAWidthsSatinFoundationTests]) {
    try {
      suites.push(fn());
    } catch (e) {
      suites.push({ name: fn.name, pass: false, checks: 0, fails: [`suite crashed: ${e.message}`] });
    }
  }
  const pass = suites.filter(s => s.pass).length;
  const checks = suites.reduce((s, x) => s + (x.checks || 0), 0);
  return {
    suites,
    summary: { total: suites.length, pass, fail: suites.length - pass, checks },
  };
}