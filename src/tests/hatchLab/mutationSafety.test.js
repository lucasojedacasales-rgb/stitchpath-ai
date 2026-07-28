/**
 * mutationSafety.test.js — Hatch Lab (P0.1)
 * Every lab function must be pure with respect to its inputs.
 */

import { validateSeedCase, validateExpectedResult } from '@/lib/hatchLab/seed/validateSeed';
import { normalizeSeedCase, prepareSeedCase } from '@/lib/hatchLab/seed/normalizeSeed';
import { extractMetrics } from '@/lib/hatchLab/bench/extractMetrics';
import { evaluateCriterion, compareMetrics } from '@/lib/hatchLab/bench/compareMetrics';
import { buildBenchReport } from '@/lib/hatchLab/bench/buildBenchReport';
import { syntheticSeedCase } from '@/lib/hatchLab/seed/syntheticSeedExample';

const snap = v => JSON.stringify(v);

export function runMutationSafetyTests() {
  const fails = [];
  let checks = 0;
  const ok = (cond, msg) => { checks++; if (!cond) fails.push(msg); };

  // validateSeedCase / validateExpectedResult
  const seed = JSON.parse(JSON.stringify(syntheticSeedCase));
  const seedBefore = snap(seed);
  validateSeedCase(seed);
  ok(snap(seed) === seedBefore, 'validateSeedCase mutated its input');
  const er = { criteria: [{ metric: 'regionCount', operator: 'equals', value: 1, required: true }] };
  const erBefore = snap(er);
  validateExpectedResult(er);
  ok(snap(er) === erBefore, 'validateExpectedResult mutated its input');

  // normalizeSeedCase: new object, deep copies, no shared references
  const normInput = JSON.parse(JSON.stringify(syntheticSeedCase));
  const normBefore = snap(normInput);
  const normalized = normalizeSeedCase(normInput);
  ok(snap(normInput) === normBefore, 'normalizeSeedCase mutated its input');
  ok(normalized !== normInput && normalized.evidence !== normInput.evidence, 'normalizeSeedCase shared references');
  normalized.evidence.push({ evidenceId: 'X' });
  ok(normInput.evidence.length === 1, 'mutating the copy affected the original');
  const prepInput = JSON.parse(JSON.stringify(syntheticSeedCase));
  const prepBefore = snap(prepInput);
  prepareSeedCase(prepInput);
  ok(snap(prepInput) === prepBefore, 'prepareSeedCase mutated its input');

  // extractMetrics
  const result = {
    regions: [{ id: 'a', color: '#123456', stitch_type: 'fill', path_points: [[0, 0], [0.1, 0], [0.1, 0.1]], area_mm2: 10, area_norm: 0.001, holes: 0 }],
    commands: [{ type: 'stitch', x: 1, y: 1, color: '#123456', regionId: 'a' }, { type: 'end', x: 1, y: 1, color: null }],
    stageLog: [{ stage: 's', durationMs: 5, ok: true, ts: 1 }],
    warnings: [],
    errors: [],
  };
  const resultBefore = snap(result);
  const extraction = extractMetrics(result, { smallRegionAreaThresholdMm2: 5 });
  ok(snap(result) === resultBefore, 'extractMetrics mutated regions/commands/stageLog');

  // evaluateCriterion / compareMetrics
  const criterion = { metric: 'regionCount', operator: 'equals', value: 1, required: true, tolerance: { absolute: 0 } };
  const critBefore = snap(criterion);
  const a = extractMetrics(result);
  const b = extractMetrics(result);
  const aBefore = snap(a), bBefore = snap(b);
  evaluateCriterion(criterion, a, b);
  compareMetrics(a, b, { expectedResult: { criteria: [criterion] } });
  ok(snap(criterion) === critBefore, 'criterion mutated during evaluation');
  ok(snap(a) === aBefore && snap(b) === bBefore, 'compareMetrics mutated its extractions');

  // buildBenchReport
  const seedForReport = { ...JSON.parse(JSON.stringify(syntheticSeedCase)), syntheticExample: false, expectedResult: { criteria: [criterion] } };
  const reportSeedBefore = snap(seedForReport);
  buildBenchReport({ baselineExtraction: a, candidateExtraction: b, seedCase: seedForReport });
  ok(snap(seedForReport) === reportSeedBefore, 'buildBenchReport mutated the seed case');
  ok(snap(a) === aBefore && snap(b) === bBefore, 'buildBenchReport mutated the extractions');
  ok(snap(extraction) === snap(extractMetrics(result, { smallRegionAreaThresholdMm2: 5 })), 'extractMetrics not deterministic on identical input');

  return { name: 'hatchLab/mutationSafety', pass: fails.length === 0, fails, checks };
}