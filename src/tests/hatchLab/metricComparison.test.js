/**
 * metricComparison.test.js — Hatch Lab (P0)
 */

import { compareMetrics } from '@/lib/hatchLab/bench/compareMetrics';
import { buildBenchReport } from '@/lib/hatchLab/bench/buildBenchReport';
import { extractMetrics } from '@/lib/hatchLab/bench/extractMetrics';
import { UNAVAILABLE } from '@/lib/hatchLab/bench/metricAvailability';
import { CONCLUSIONS } from '@/lib/hatchLab/reports/reportSchema';
import { syntheticSeedCase } from '@/lib/hatchLab/seed/syntheticSeedExample';

const base = extractMetrics({
  regions: [{ id: 'a', color: '#111111', path_points: [[0, 0], [1, 0], [1, 1]], area_mm2: 100 }],
  commands: [{ type: 'stitch', x: 0, y: 0 }, { type: 'stitch', x: 1, y: 1 }],
});

export function runMetricComparisonTests() {
  const fails = [];
  const ok = (cond, msg) => { if (!cond) fails.push(msg); };

  // identical
  const same = compareMetrics(base, base);
  ok(same.regressions.length === 0 && same.improvements.length === 0, 'identical metrics produced verdicts');
  ok(same.informationalDifferences.length === 0, 'identical metrics produced differences');
  ok(same.equal.some(e => e.metric === 'regionCount'), 'regionCount not reported as equal');
  ok(same.conclusive === true, 'identical comparison should be conclusive');

  // difference without expectedResult → informational, never improvement
  const fewer = { ...base, regionCount: 0, stitchCount: 1 };
  const diff = compareMetrics(base, fewer);
  ok(diff.improvements.length === 0, 'fewer regions/stitches wrongly classified as improvement');
  ok(diff.regressions.length === 0, 'difference without expectedResult wrongly classified as regression');
  ok(diff.informationalDifferences.some(d => d.metric === 'regionCount'), 'regionCount difference not reported');

  // expectedResult drives direction
  const withExpected = compareMetrics(base, fewer, { expectedResult: { regionCount: { direction: 'lower' } } });
  ok(withExpected.improvements.some(i => i.metric === 'regionCount'), 'expected "lower" not classified as improvement');
  const wrongWay = compareMetrics(base, fewer, { expectedResult: { regionCount: { direction: 'higher' } } });
  ok(wrongWay.regressions.some(r => r.metric === 'regionCount'), 'expected "higher" not classified as regression');

  // tolerances
  const slight = { ...base, stitchCount: 2, commandCount: 2 };
  const tolerant = compareMetrics({ ...base, stitchCount: 2, commandCount: 2 }, { ...slight, stitchCount: 2 }, { tolerances: { stitchCount: { absolute: 1 } } });
  ok(tolerant.equal.some(e => e.metric === 'stitchCount'), 'tolerance not applied to stitchCount');
  const strict = compareMetrics({ ...base, stitchCount: 10 }, { ...base, stitchCount: 12 }, { tolerances: { stitchCount: { absolute: 0 } } });
  ok(strict.informationalDifferences.some(d => d.metric === 'stitchCount'), 'strict tolerance did not flag difference');

  // missing essential metrics → inconclusive
  const missing = compareMetrics({ ...base, regionCount: UNAVAILABLE }, base);
  ok(missing.conclusive === false, 'missing essential metric should be inconclusive');
  ok(missing.unavailableMetrics.some(u => u.metric === 'regionCount'), 'unavailable metric not listed');

  // report conclusions
  const noExpected = buildBenchReport({ baselineId: 'base', candidateId: 'cand', baselineMetrics: base, candidateMetrics: fewer, seedCase: syntheticSeedCase });
  ok(noExpected.conclusion === CONCLUSIONS.NO_EXPECTED_RESULT, `expected no_expected_result, got ${noExpected.conclusion}`);
  ok(noExpected.warnings.some(w => w.includes('SYNTHETIC_EXAMPLE')), 'synthetic seed not flagged in report warnings');

  const invalid = buildBenchReport({ baselineMetrics: base, candidateMetrics: base, seedCase: { ...syntheticSeedCase, caseId: '' } });
  ok(invalid.conclusion === CONCLUSIONS.INVALID_CASE, `expected invalid_case, got ${invalid.conclusion}`);

  const failing = buildBenchReport({
    baselineMetrics: base, candidateMetrics: fewer,
    seedCase: { ...syntheticSeedCase, expectedResult: { regionCount: { direction: 'higher' } } },
  });
  ok(failing.conclusion === CONCLUSIONS.FAIL, `expected fail, got ${failing.conclusion}`);

  const passing = buildBenchReport({
    baselineMetrics: base, candidateMetrics: fewer,
    seedCase: { ...syntheticSeedCase, expectedResult: { regionCount: { direction: 'lower' } } },
  });
  ok(passing.conclusion === CONCLUSIONS.PASS, `expected pass, got ${passing.conclusion}`);
  ok(passing.reportVersion && passing.timestamp, 'report missing version/timestamp');

  const inconclusive = buildBenchReport({
    baselineMetrics: { ...base, regionCount: UNAVAILABLE }, candidateMetrics: base,
    seedCase: { ...syntheticSeedCase, expectedResult: { colorCount: { direction: 'lower' } } },
  });
  ok(inconclusive.conclusion === CONCLUSIONS.INCONCLUSIVE, `expected inconclusive, got ${inconclusive.conclusion}`);

  // never pass by default
  const bare = buildBenchReport({ baselineMetrics: base, candidateMetrics: base });
  ok(bare.conclusion !== CONCLUSIONS.PASS, 'report passed by default without expectedResult');

  return { name: 'hatchLab/metricComparison', pass: fails.length === 0, fails };
}