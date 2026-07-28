/**
 * mutationSafety.test.js — Hatch Lab (P0)
 * Guarantees every lab function is pure with respect to its inputs.
 */

import { validateSeedCase } from '@/lib/hatchLab/seed/validateSeed';
import { normalizeSeedCase } from '@/lib/hatchLab/seed/normalizeSeed';
import { extractMetrics } from '@/lib/hatchLab/bench/extractMetrics';
import { compareMetrics } from '@/lib/hatchLab/bench/compareMetrics';
import { buildBenchReport } from '@/lib/hatchLab/bench/buildBenchReport';
import { syntheticSeedCase } from '@/lib/hatchLab/seed/syntheticSeedExample';

const snap = v => JSON.stringify(v);

export function runMutationSafetyTests() {
  const fails = [];
  const ok = (cond, msg) => { if (!cond) fails.push(msg); };

  // validateSeedCase
  const seed = JSON.parse(JSON.stringify(syntheticSeedCase));
  const seedBefore = snap(seed);
  validateSeedCase(seed);
  ok(snap(seed) === seedBefore, 'validateSeedCase mutated its input');

  // normalizeSeedCase returns a new object and deep copies
  const normInput = JSON.parse(JSON.stringify(syntheticSeedCase));
  const normBefore = snap(normInput);
  const normalized = normalizeSeedCase(normInput);
  ok(snap(normInput) === normBefore, 'normalizeSeedCase mutated its input');
  ok(normalized !== normInput, 'normalizeSeedCase returned the same reference');
  ok(normalized.evidence !== normInput.evidence, 'normalizeSeedCase shared the evidence array');
  normalized.evidence.push({ evidenceId: 'X' });
  ok(normInput.evidence.length === 1, 'mutating the copy affected the original');

  // extractMetrics
  const result = {
    regions: [{ id: 'a', color: '#123456', path_points: [[0, 0], [1, 0], [1, 1]], area_mm2: 10, holes: [] }],
    commands: [{ type: 'stitch', x: 1, y: 1 }],
    stageLog: [{ stage: 's', ms: 5, ok: true }],
  };
  const resultBefore = snap(result);
  extractMetrics(result, { smallRegionAreaThreshold: 5 });
  ok(snap(result) === resultBefore, 'extractMetrics mutated regions/commands/context');

  // compareMetrics
  const a = extractMetrics(result);
  const b = extractMetrics(result);
  const aBefore = snap(a), bBefore = snap(b);
  compareMetrics(a, b, { tolerances: { stitchCount: { absolute: 1 } } });
  ok(snap(a) === aBefore && snap(b) === bBefore, 'compareMetrics mutated its metric inputs');

  // buildBenchReport
  const seedForReport = JSON.parse(JSON.stringify(syntheticSeedCase));
  const reportSeedBefore = snap(seedForReport);
  const report = buildBenchReport({ baselineMetrics: a, candidateMetrics: b, seedCase: seedForReport });
  ok(snap(seedForReport) === reportSeedBefore, 'buildBenchReport mutated the seed case');
  ok(snap(a) === aBefore, 'buildBenchReport mutated the baseline metrics');
  ok(report.metrics.baseline === a, 'report should reference the provided metrics without copying semantics');

  return { name: 'hatchLab/mutationSafety', pass: fails.length === 0, fails };
}