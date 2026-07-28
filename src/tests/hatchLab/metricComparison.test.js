/**
 * metricComparison.test.js — Hatch Lab (P0.1)
 * Criterion evaluation + report conclusion rules.
 * NOTE: seed objects built here are unit-test fixtures only, never evidence.
 */

import { extractMetrics } from '@/lib/hatchLab/bench/extractMetrics';
import { evaluateCriterion, compareMetrics } from '@/lib/hatchLab/bench/compareMetrics';
import { buildBenchReport } from '@/lib/hatchLab/bench/buildBenchReport';
import { CONCLUSIONS } from '@/lib/hatchLab/reports/reportSchema';
import { syntheticSeedCase, syntheticCaseWithCriteria, syntheticInvalidCases } from '@/lib/hatchLab/seed/syntheticSeedExample';

const square = (o = 0) => [[o, o], [o + 0.1, o], [o + 0.1, o + 0.1], [o, o + 0.1]];
const mkRegion = (id, color, o, holes = 0) => ({ id, color, stitch_type: 'fill', path_points: square(o), area_mm2: 50, area_norm: 0.005, holes });
const mkCommands = n => [
  { type: 'jump', x: 0, y: 0, color: '#111111', regionId: 'a' },
  ...Array.from({ length: n }, (_, i) => ({ type: 'stitch', x: i, y: i, color: '#111111', regionId: 'a', stitchType: 'fill' })),
  { type: 'end', x: n, y: n, color: null },
];

const baseline = extractMetrics({ regions: [mkRegion('a', '#111111', 0), mkRegion('b', '#222222', 0.3)], commands: mkCommands(5) });
const candidateSame = extractMetrics({ regions: [mkRegion('a', '#111111', 0), mkRegion('b', '#222222', 0.3)], commands: mkCommands(5) });
const candidateFewer = extractMetrics({ regions: [mkRegion('a', '#111111', 0)], commands: mkCommands(3) });

// test-only seed factory (non-synthetic unit fixture, not evidence)
const testSeed = (expectedResult, extra = {}) => ({
  ...syntheticSeedCase,
  caseId: 'TEST-CASE-1',
  syntheticExample: false,
  expectedResult,
  ...extra,
});

export function runMetricComparisonTests() {
  const fails = [];
  let checks = 0;
  const ok = (cond, msg) => { checks++; if (!cond) fails.push(msg); };

  // ── operator evaluation against real target values ──
  const eq = evaluateCriterion({ metric: 'regionCount', operator: 'equals', value: 3, required: true, tolerance: { absolute: 1 } }, baseline, candidateSame);
  ok(eq.evaluated && eq.satisfied === true, `equals with tolerance failed: ${eq.reason}`);
  const eqStrict = evaluateCriterion({ metric: 'regionCount', operator: 'equals', value: 3, required: true, tolerance: { absolute: 0 } }, baseline, candidateSame);
  ok(eqStrict.satisfied === false, 'strict equals wrongly satisfied');

  const btw = evaluateCriterion({ metric: 'stitchCount', operator: 'between', min: 4, max: 6, required: true }, baseline, candidateSame);
  ok(btw.satisfied === true, `between failed: ${btw.reason}`);
  const btwOut = evaluateCriterion({ metric: 'stitchCount', operator: 'between', min: 10, max: 20, required: true }, baseline, candidateSame);
  ok(btwOut.satisfied === false, 'between wrongly satisfied outside range');

  ok(evaluateCriterion({ metric: 'stitchCount', operator: 'minimum', value: 5, required: true }, baseline, candidateSame).satisfied === true, 'minimum failed');
  ok(evaluateCriterion({ metric: 'stitchCount', operator: 'minimum', value: 6, required: true }, baseline, candidateSame).satisfied === false, 'minimum wrongly satisfied');
  ok(evaluateCriterion({ metric: 'stitchCount', operator: 'maximum', value: 5, required: true }, baseline, candidateSame).satisfied === true, 'maximum failed');
  ok(evaluateCriterion({ metric: 'stitchCount', operator: 'maximum', value: 2, required: true }, baseline, candidateSame).satisfied === false, 'maximum wrongly satisfied');

  const rel = evaluateCriterion({ metric: 'stitchCount', operator: 'relative_to_baseline', direction: 'lower', required: true }, baseline, candidateFewer);
  ok(rel.satisfied === true, `relative_to_baseline lower failed: ${rel.reason}`);
  const relWrong = evaluateCriterion({ metric: 'stitchCount', operator: 'relative_to_baseline', direction: 'higher', required: true }, baseline, candidateFewer);
  ok(relWrong.satisfied === false, 'relative_to_baseline higher wrongly satisfied');

  // target value not reached even though direction improved: 5 → 3, target equals 1
  const targetMiss = evaluateCriterion({ metric: 'stitchCount', operator: 'equals', value: 1, required: true, tolerance: { absolute: 0 } }, baseline, candidateFewer);
  ok(targetMiss.satisfied === false, 'improving vs baseline must NOT satisfy an absolute target');

  // sequences
  const seqOk = evaluateCriterion({ metric: 'colorSequence', operator: 'sequence_equals', value: ['#111111', '#222222'], required: true }, baseline, candidateSame);
  ok(seqOk.satisfied === true, `sequence_equals failed: ${seqOk.reason}`);
  const seqBad = evaluateCriterion({ metric: 'colorSequence', operator: 'sequence_equals', value: ['#222222', '#111111'], required: true }, baseline, candidateSame);
  ok(seqBad.satisfied === false, 'wrong sequence order wrongly satisfied');
  const setOk = evaluateCriterion({ metric: 'colorSequence', operator: 'set_equals', value: ['#222222', '#111111'], required: true }, baseline, candidateSame);
  ok(setOk.satisfied === true, `set_equals failed: ${setOk.reason}`);

  // notComparable (evaluator level): sequence operator on a numeric metric value
  const nc = evaluateCriterion({ metric: 'regionCount', operator: 'sequence_equals', value: [1], required: true }, baseline, candidateSame);
  ok(nc.notComparable === true && nc.satisfied === null, 'numeric actual under sequence operator must be notComparable');

  // ── informational diffs never carry verdicts ──
  const cmp = compareMetrics(baseline, candidateFewer, { expectedResult: null });
  ok(cmp.criteria.length === 0, 'criteria evaluated without expectedResult');
  ok(cmp.informationalDifferences.some(d => d.metric === 'regionCount'), 'regionCount diff not reported informationally');
  ok(cmp.informationalDifferences.every(d => d.note.includes('informational')), 'informational diffs must be labeled');

  // ── report conclusions ──
  const rp = (seedCase, candidate = candidateSame) => buildBenchReport({
    baselineId: 'base', candidateId: 'cand',
    baselineExtraction: baseline, candidateExtraction: candidate, seedCase,
  });

  // synthetic can never pass or fail — even with criteria that would pass/fail
  const passableSynthetic = rp({ ...syntheticCaseWithCriteria, expectedResult: { criteria: [{ metric: 'regionCount', operator: 'equals', value: 2, required: true }] } });
  ok(passableSynthetic.conclusion === CONCLUSIONS.NO_EXPECTED_RESULT, `synthetic forced pass: got ${passableSynthetic.conclusion}`);
  ok(passableSynthetic.warnings.some(w => w.includes('SYNTHETIC_EXAMPLE')), 'SYNTHETIC_EXAMPLE warning missing');
  ok(passableSynthetic.syntheticCase === true, 'syntheticCase flag missing');
  const failableSynthetic = rp(syntheticCaseWithCriteria); // criteria expect regionCount 1, candidate has 2 → would fail
  ok(failableSynthetic.conclusion === CONCLUSIONS.NO_EXPECTED_RESULT, `synthetic forced fail: got ${failableSynthetic.conclusion}`);

  // invalid_case family
  ok(rp(syntheticInvalidCases.emptyExpectedResult).conclusion === CONCLUSIONS.INVALID_CASE, 'empty expectedResult not invalid_case');
  ok(rp(syntheticInvalidCases.unknownExpectedMetric).conclusion === CONCLUSIONS.INVALID_CASE, 'unknown metric not invalid_case');
  ok(rp(syntheticInvalidCases.unknownOperator).conclusion === CONCLUSIONS.INVALID_CASE, 'unknown operator not invalid_case');
  ok(rp({ ...syntheticSeedCase, caseId: '' }).conclusion === CONCLUSIONS.INVALID_CASE, 'invalid seed not invalid_case');

  // no_expected_result
  const noEr = rp(testSeed(null));
  ok(noEr.conclusion === CONCLUSIONS.NO_EXPECTED_RESULT && noEr.conclusionReason.length > 5, 'missing expectedResult not no_expected_result with reason');

  // never pass without required criteria
  const onlyOptional = rp(testSeed({ criteria: [{ metric: 'regionCount', operator: 'equals', value: 2, required: false }] }));
  ok(onlyOptional.conclusion === CONCLUSIONS.INCONCLUSIVE, `no required criteria must be inconclusive, got ${onlyOptional.conclusion}`);
  ok(onlyOptional.conclusionReason.includes('required'), 'reason must explain missing required criteria');

  // real pass
  const passReport = rp(testSeed({ criteria: [
    { metric: 'regionCount', operator: 'equals', value: 2, required: true, tolerance: { absolute: 0 } },
    { metric: 'stitchCount', operator: 'between', min: 4, max: 6, required: true },
  ] }));
  ok(passReport.conclusion === CONCLUSIONS.PASS, `real pass expected, got ${passReport.conclusion}: ${passReport.conclusionReason}`);
  ok(passReport.satisfiedCriteria.length === 2 && passReport.failedCriteria.length === 0, 'pass report criteria lists wrong');
  ok(passReport.conclusionReason.includes('satisfied'), 'pass reason must explain itself');

  // real fail
  const failReport = rp(testSeed({ criteria: [{ metric: 'regionCount', operator: 'equals', value: 5, required: true, tolerance: { absolute: 0 } }] }));
  ok(failReport.conclusion === CONCLUSIONS.FAIL, `real fail expected, got ${failReport.conclusion}`);
  ok(failReport.regressions.length === 1 && failReport.conclusionReason.includes('regionCount'), 'fail report must name the failed metric');

  // inconclusive: required metric unavailable (no region declares holes at all)
  const regionNoHoles = { id: 'a', color: '#111111', stitch_type: 'fill', path_points: square(0), area_mm2: 50, area_norm: 0.005 };
  const candidateNoHoles = extractMetrics({ regions: [regionNoHoles, { ...regionNoHoles, id: 'b', color: '#222222', path_points: square(0.3) }], commands: mkCommands(5) });
  const incUnavailable = rp(testSeed({ criteria: [{ metric: 'explicitHoleCount', operator: 'equals', value: 1, required: true }] }), candidateNoHoles);
  ok(incUnavailable.conclusion === CONCLUSIONS.INCONCLUSIVE, `unavailable required metric: got ${incUnavailable.conclusion}`);
  ok(incUnavailable.unavailableRequiredCriteria.length === 1, 'unavailableRequiredCriteria not reported');

  // inconclusive: explicitHoleCount required but only PARTIALLY declared
  const candidatePartialHoles = extractMetrics({ regions: [mkRegion('a', '#111111', 0, 1), regionNoHoles && { ...regionNoHoles, id: 'c', color: '#333333', path_points: square(0.5) }], commands: mkCommands(5) });
  const incPartialHoles = rp(testSeed({ criteria: [{ metric: 'explicitHoleCount', operator: 'equals', value: 1, required: true }] }), candidatePartialHoles);
  ok(incPartialHoles.conclusion === CONCLUSIONS.INCONCLUSIVE, `partially declared holes must be inconclusive, got ${incPartialHoles.conclusion}`);
  ok(incPartialHoles.incompleteRequiredCriteria.length === 1, 'partial holes not reported as incomplete required criterion');

  // inconclusive: required metric incomplete (missing colors)
  const partialColors = extractMetrics({ regions: [mkRegion('a', '#111111', 0), { id: 'nc', stitch_type: 'fill', path_points: square(0.3), area_mm2: 10, area_norm: 0.001, holes: 0 }], commands: mkCommands(5) });
  const incIncomplete = buildBenchReport({
    baselineExtraction: baseline, candidateExtraction: partialColors,
    seedCase: testSeed({ criteria: [{ metric: 'colorCount', operator: 'equals', value: 1, required: true }] }),
  });
  ok(incIncomplete.conclusion === CONCLUSIONS.INCONCLUSIVE, `incomplete required metric: got ${incIncomplete.conclusion}`);
  ok(incIncomplete.incompleteRequiredCriteria.length === 1, 'incompleteRequiredCriteria not reported');

  // inconclusive: unknown command types poison a required command-derived metric
  const unknownCmds = extractMetrics({ regions: [mkRegion('a', '#111111', 0)], commands: [...mkCommands(5), { type: 'weird_cmd', x: 0, y: 0 }] });
  const incUnknownCmd = buildBenchReport({
    baselineExtraction: baseline, candidateExtraction: unknownCmds,
    seedCase: testSeed({ criteria: [{ metric: 'stitchCount', operator: 'equals', value: 5, required: true }] }),
  });
  ok(incUnknownCmd.conclusion === CONCLUSIONS.INCONCLUSIVE, `unknown command types must block conclusiveness, got ${incUnknownCmd.conclusion}`);

  // improvements only from satisfied relative_to_baseline
  const relReport = buildBenchReport({
    baselineExtraction: baseline, candidateExtraction: candidateFewer,
    seedCase: testSeed({ criteria: [
      { metric: 'stitchCount', operator: 'relative_to_baseline', direction: 'lower', required: true },
      { metric: 'regionCount', operator: 'equals', value: 1, required: true, tolerance: { absolute: 0 } },
    ] }),
  });
  ok(relReport.conclusion === CONCLUSIONS.PASS, `relative pass expected, got ${relReport.conclusion}: ${relReport.conclusionReason}`);
  ok(relReport.improvements.length === 1 && relReport.improvements[0].metric === 'stitchCount', 'improvement must come only from relative_to_baseline');

  // report structure fields
  for (const f of ['evaluatedCriteria', 'satisfiedCriteria', 'failedCriteria', 'unavailableRequiredCriteria',
    'incompleteRequiredCriteria', 'unknownExpectedMetrics', 'metricAvailability', 'extractionWarnings',
    'syntheticCase', 'conclusionReason']) {
    ok(f in passReport, `report missing field ${f}`);
  }

  return { name: 'hatchLab/metricComparison', pass: fails.length === 0, fails, checks };
}