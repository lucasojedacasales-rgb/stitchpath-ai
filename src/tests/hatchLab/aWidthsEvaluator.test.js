/**
 * aWidthsEvaluator.test.js — Hatch Lab (P0.3A.1)
 * Tests ONLY the A_WIDTHS evaluator. The other suites are run once by the
 * aggregator and are never re-executed here.
 * Every engine result and every extra case below is a SYNTHETIC fixture,
 * never real evidence.
 */

import {
  evaluateAWidthsResult, selectRegionSource, matchCasesToRegions, buildMeasuredCandidates,
  buildPlanIndex, detectPossibleMergedRegions, normalizeTechniqueValue, buildUnderlayFields,
  buildReference, createPointConverter, measureRegion, solveAssignmentOptions,
  CONCLUSIONS, DEFAULT_OPTIONS, EVALUATOR_VERSION, AVAILABILITY, COMPARISON_STATUS,
} from '@/lib/hatchLab/evaluators/A_WIDTHS/index.js';
import { A_WIDTHS_CASES } from '@/lib/hatchLab/seed/real/A_WIDTHS/index.js';

const DESIGN_MM = { widthMm: 100, heightMm: 80, coordinateSpace: 'mm' };

/** SYNTHETIC bar in mm — not real evidence. */
function bar({ id, cx, cy, w, h, extra = {} }) {
  const region = {
    id,
    path_points: [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]],
    stitch_type: 'satin',
    density: 0.36,
    pull_compensation: 0.4,
    angle: 0,
    underlay: true,
    recommended_underlay: { enabled: true, type: 'edge_walk_zigzag', density_mm: 2, angle_deg: 90 },
    color: '#000000',
    ...extra,
  };
  for (const key of Object.keys(region)) if (region[key] === undefined) delete region[key];
  return region;
}

/** SYNTHETIC seed case — schema-shaped, declared synthetic, never evidence. */
function syntheticCase({ caseId, cx, cy, w, h }) {
  return {
    caseId, phase: 'A_WIDTHS', syntheticExample: true,
    input: { centerXMm: cx, centerYMm: cy, geometry: 'barra_recta' },
    testedSizeMm: { width: w, height: h },
    observation: { measured: { nominalWidthMm: w, nominalHeightMm: h } },
    configuration: { documented: {} },
    ruleScope: { phase: 'A_WIDTHS', geometryClass: 'barra_recta' },
    candidateRules: [], expectedResult: null,
  };
}

const CASE_GEOMETRY = { 'HATCH-A-WIDTHS-A1': [7, 13, 0.5], 'HATCH-A-WIDTHS-A5': [55, 13, 3], 'HATCH-A-WIDTHS-A6': [67, 13, 4], 'HATCH-A-WIDTHS-A7': [80, 13, 6], 'HATCH-A-WIDTHS-A8': [93, 13, 8] };
const realCase = id => A_WIDTHS_CASES.find(c => c.caseId === id);

function mmResult(ids = Object.keys(CASE_GEOMETRY), extra = {}) {
  return { regions: ids.map(id => { const [cx, cy, w] = CASE_GEOMETRY[id]; return bar({ id: `bar_${id}`, cx, cy, w, h: 16, extra }); }) };
}
const run = (result, seedCases = A_WIDTHS_CASES, options = {}, design = DESIGN_MM) =>
  evaluateAWidthsResult({ result, seedCases, design, options });

const R9 = v => Math.round(v * 1e9) / 1e9;

/**
 * INDEPENDENT exhaustive oracle (P0.3A.3). Written from scratch inside the test
 * file: it enumerates every one-to-one assignment, never prunes, never uses
 * maximumBranches or candidatesPerCaseLimit, and never calls the
 * branch-and-bound implementation it verifies.
 */
function bruteForceAssignmentOracle(caseOptions, margin) {
  const cases = caseOptions.map(c => ({ caseId: String(c.caseId), options: [...(c.options || [])] }));
  const caseIds = cases.map(c => c.caseId).sort((a, b) => a.localeCompare(b));
  const solutions = [];

  const summarize = chosen => {
    const assigned = chosen.filter(a => a.internalCandidateKey != null);
    return {
      assignments: assigned.map(a => ({ ...a })).sort((x, y) => x.caseId.localeCompare(y.caseId)),
      matchCount: assigned.length,
      totalScore: R9(assigned.reduce((s, a) => s + a.score, 0)),
      totalCenterDistance: R9(assigned.reduce((s, a) => s + a.centerDistanceMm, 0)),
      signature: [...chosen].sort((a, b) => a.caseId.localeCompare(b.caseId))
        .map(a => `${a.caseId}→${a.internalCandidateKey ?? '∅'}`).join('|'),
    };
  };

  const walk = (index, used, chosen) => {
    if (index === cases.length) { solutions.push(summarize(chosen)); return; }
    const { caseId, options } = cases[index];
    for (const option of options) {
      if (used.has(option.internalCandidateKey)) continue;
      walk(index + 1, new Set([...used, option.internalCandidateKey]),
        [...chosen, { caseId, internalCandidateKey: option.internalCandidateKey, score: option.score, centerDistanceMm: option.centerDistanceMm }]);
    }
    walk(index + 1, used, [...chosen, { caseId, internalCandidateKey: null, score: 0, centerDistanceMm: 0 }]);
  };
  walk(0, new Set(), []);

  // Same declared objective order, implemented independently.
  let best = null;
  for (const s of solutions) {
    if (best === null) { best = s; continue; }
    if (s.matchCount > best.matchCount) { best = s; continue; }
    if (s.matchCount < best.matchCount) continue;
    if (s.totalScore > best.totalScore) { best = s; continue; }
    if (s.totalScore < best.totalScore) continue;
    if (s.totalCenterDistance < best.totalCenterDistance) { best = s; continue; }
    if (s.totalCenterDistance > best.totalCenterDistance) continue;
    if (s.signature.localeCompare(best.signature) < 0) best = s;
  }
  const resolved = best || { assignments: [], matchCount: 0, totalScore: 0, totalCenterDistance: 0, signature: '' };
  const equallyGood = solutions.filter(s => s.matchCount === resolved.matchCount && Math.abs(s.totalScore - resolved.totalScore) < margin);
  const ambiguousCaseIds = caseIds.filter(id => {
    const keys = new Set(equallyGood.map(s => (s.assignments.find(a => a.caseId === id) || {}).internalCandidateKey ?? '∅'));
    return keys.size > 1;
  }).sort();

  return {
    matchCount: resolved.matchCount,
    totalScore: resolved.totalScore,
    totalCenterDistance: resolved.totalCenterDistance,
    signature: resolved.signature,
    assignments: resolved.assignments,
    ambiguousCaseIds,
    alternativeSolutionCount: equallyGood.length,
    enumeratedSolutions: solutions.length,
  };
}

/**
 * Replica of the PREVIOUS (0.2.0) pruning rule, kept only inside the test file to
 * prove that the adversarial fixture really discriminates the corrected bound.
 */
function legacyBuggySolve(caseOptions, margin) {
  const order = [...caseOptions].map(c => ({ caseId: String(c.caseId), options: [...(c.options || [])] }))
    .sort((a, b) => a.options.length - b.options.length || a.caseId.localeCompare(b.caseId));
  const suffixPossible = new Array(order.length + 1).fill(0);
  const suffixBestScore = new Array(order.length + 1).fill(0);
  for (let i = order.length - 1; i >= 0; i--) {
    suffixPossible[i] = suffixPossible[i + 1] + (order[i].options.length > 0 ? 1 : 0);
    suffixBestScore[i] = suffixBestScore[i + 1] + (order[i].options.length > 0 ? Math.max(...order[i].options.map(o => o.score)) : 0);
  }
  let best = null;
  const walk = (index, used, chosen, currentScore, assignedSoFar) => {
    if (index === order.length) {
      const solution = { matchCount: assignedSoFar, totalScore: R9(currentScore) };
      if (!best || solution.matchCount > best.matchCount
        || (solution.matchCount === best.matchCount && solution.totalScore > best.totalScore)) best = solution;
      return;
    }
    if (best) {
      if (assignedSoFar + suffixPossible[index] < best.matchCount) return;
      // the 0.2.0 bug: score pruning applied regardless of the match-count bound
      if (currentScore + suffixBestScore[index] < best.totalScore - margin) return;
    }
    for (const option of order[index].options) {
      if (used.has(option.internalCandidateKey)) continue;
      walk(index + 1, new Set([...used, option.internalCandidateKey]), chosen, currentScore + option.score, assignedSoFar + 1);
    }
    walk(index + 1, used, chosen, currentScore, assignedSoFar);
  };
  walk(0, new Set(), [], 0, 0);
  return best || { matchCount: 0, totalScore: 0 };
}

/** Deterministic pseudo-random generator (fixed seed, no Math.random). */
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}

/** SYNTHETIC bipartite instances built directly on caseOptions. */
function buildRandomInstances(count, seed) {
  const rnd = makeRandom(seed);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const SCORES = [0.75, 0.8, 0.8, 0.9, 1.0, 1.0];
  const DISTANCES = [0, 0.1, 0.25, 0.25, 0.5];
  const instances = [];
  for (let i = 0; i < count; i++) {
    const caseCount = 1 + Math.floor(rnd() * 5);
    const candidateCount = 1 + Math.floor(rnd() * 7);
    const keys = Array.from({ length: candidateCount }, (_, k) => `K${String(k).padStart(2, '0')}`);
    const caseOptions = Array.from({ length: caseCount }, (_, c) => {
      const caseId = `SYN-RND-${String(i).padStart(3, '0')}-${String(c).padStart(2, '0')}`;
      const options = keys.filter(() => rnd() < 0.55)
        .map(key => ({ internalCandidateKey: key, score: pick(SCORES), centerDistanceMm: pick(DISTANCES) }));
      return { caseId, options };
    });
    instances.push(caseOptions);
  }
  return instances;
}

export function runAWidthsEvaluatorTests() {
  const fails = [];
  let checks = 0;
  const ok = (label, cond) => { checks++; if (!cond) fails.push(label); };
  const caseOf = (out, id) => out.cases.find(c => c.caseId === id);
  const cmp = (c, name) => c.comparisons.find(x => x.name === name);
  const errorCodes = out => out.errors.map(e => e.code);

  ok('0. version 0.2.1 and conflict availability declared', EVALUATOR_VERSION === '0.2.1-A_WIDTHS' && AVAILABILITY.includes('conflict'));

  const base = run(mmResult());
  const a7 = caseOf(base, 'HATCH-A-WIDTHS-A7');

  // 1 — one region cannot serve two cases
  const shared = syntheticCase({ caseId: 'SYN-SHARED', cx: 80, cy: 13, w: 6, h: 15 });
  const oneRegion = run({ regions: [bar({ id: 'bar_shared', cx: 80, cy: 13, w: 6, h: 16 })] }, [realCase('HATCH-A-WIDTHS-A7'), shared]);
  const keys = oneRegion.assignment.assignments.map(a => a.internalCandidateKey);
  ok('1. a region is assigned to at most one case', keys.length === 1 && new Set(keys).size === keys.length && oneRegion.assignment.collisionsPrevented.length === 1);
  ok('1b. the losing case is not matched', oneRegion.matchCoverage.matched === 1 && oneRegion.assignment.unassignedCases.length === 1);

  // 2 — global assignment beats naive greedy
  const s1 = syntheticCase({ caseId: 'SYN-G1', cx: 20, cy: 13, w: 4, h: 16 });
  const s2 = syntheticCase({ caseId: 'SYN-G2', cx: 20.8, cy: 13, w: 4, h: 14 });
  const greedyRegions = [bar({ id: 'R_x', cx: 20.6, cy: 13, w: 4, h: 15 }), bar({ id: 'R_y', cx: 20, cy: 13, w: 4, h: 18 })];
  const globalOut = run({ regions: greedyRegions }, [s1, s2]);
  const cands = buildMeasuredCandidates({ regions: greedyRegions, sourceKey: 'regions', convertPoint: createPointConverter({ status: 'resolved', space: 'mm' }) }).candidates;
  const assign = matchCasesToRegions({ seedCases: [s1, s2], measuredCandidates: cands, options: DEFAULT_OPTIONS });
  const greedyCount = (() => { const used = new Set(); let n = 0;
    for (const id of ['SYN-G1', 'SYN-G2']) {
      const best = (assign.evaluationsByCase.get(id).evaluations.filter(e => e.eligibility === 'accepted' && !used.has(e.internalCandidateKey)))[0];
      if (best) { used.add(best.internalCandidateKey); n += 1; }
    } return n; })();
  ok('2. global assignment matches both cases where naive greedy matches one', globalOut.matchCoverage.matched === 2 && greedyCount === 1);
  ok('2b. the case does not keep its own best candidate when that blocks the optimum', caseOf(globalOut, 'SYN-G1').match.selectedRegionId === 'R_y' && caseOf(globalOut, 'SYN-G2').match.selectedRegionId === 'R_x');
  ok('2c. assignment method and tie-break declared', globalOut.assignment.assignmentMethod === 'exact_branch_and_bound' && /caseId/.test(globalOut.assignment.deterministicTieBreak));

  // 3 / 4 — order independence
  const shuffledCases = [A_WIDTHS_CASES[3], A_WIDTHS_CASES[0], A_WIDTHS_CASES[4], A_WIDTHS_CASES[1], A_WIDTHS_CASES[2]];
  const byCaseOrder = run(mmResult(), shuffledCases);
  const byRegionOrder = run({ regions: [...mmResult().regions].reverse() });
  const signature = out => JSON.stringify(out.cases.map(c => [c.caseId, c.match.selectedRegionId]));
  ok('3. independent of case order', signature(byCaseOrder) === signature(base));
  ok('4. independent of region order', signature(byRegionOrder) === signature(base));

  // 5 — inside search radius, outside acceptance
  const outsideAccepted = run({ regions: [bar({ id: 'shift', cx: 83, cy: 13, w: 6, h: 16 })] }, [realCase('HATCH-A-WIDTHS-A7')]);
  const oaCase = outsideAccepted.cases[0];
  const oaCandidate = oaCase.match.candidates[0];
  ok('5. inside the search radius but outside acceptance → not matched', oaCase.status === 'unmatched' && oaCandidate.withinSearchRadius === true
    && oaCandidate.rejectedBy.includes('OUTSIDE_ACCEPTED_CENTER_DISTANCE') && oaCandidate.eligibility === 'rejected');
  ok('5b. tolerances used are reported, no hidden constants', oaCase.match.tolerancesUsed.acceptance.acceptedCenterDistanceMm === DEFAULT_OPTIONS.acceptedCenterDistanceMm
    && oaCase.match.tolerancesUsed.searchRadius.maximumCenterDistanceMm === DEFAULT_OPTIONS.maximumCenterDistanceMm);

  // 6 — score below minimum
  const lowScore = run({ regions: [bar({ id: 'low', cx: 80.9, cy: 13, w: 8, h: 16 })] }, [realCase('HATCH-A-WIDTHS-A7')]);
  const lowCandidate = lowScore.cases[0].match.candidates[0];
  ok('6. candidate below minimumAcceptedScore is rejected', lowCandidate.rejectedBy.includes('SCORE_BELOW_MINIMUM') && lowCandidate.score < DEFAULT_OPTIONS.minimumAcceptedScore);
  ok('6b. score components exposed', Object.keys(lowCandidate.scoreComponents).length === 4);

  // 7 — incompatible height
  const badHeight = run({ regions: [bar({ id: 'tall', cx: 80, cy: 13, w: 6, h: 26 })] }, [realCase('HATCH-A-WIDTHS-A7')]);
  ok('7. incompatible height rejected', badHeight.cases[0].match.candidates[0].rejectedBy.includes('HEIGHT_DIFFERENCE_EXCEEDED') && badHeight.cases[0].status === 'unmatched');

  // 8 — abnormally wide region
  const wide = run({ regions: [bar({ id: 'wide', cx: 80, cy: 13, w: 30, h: 16 })] }, [realCase('HATCH-A-WIDTHS-A7')]);
  const wideDiag = wide.mergeDiagnostics[0];
  ok('8. abnormally wide region flagged as possible merge (diagnostic only)', wideDiag.possibleMergedRegion === true && wideDiag.widthFactor > DEFAULT_OPTIONS.mergeWidthFactor && /Diagnostic observation only/.test(wideDiag.reason));
  ok('8b. no merge is asserted as fact and no pass/fail emitted', !/"(pass|fail)"/.test(JSON.stringify(wide.mergeDiagnostics)));

  // 9 — region covering two declared centres
  const twoCenters = run({ regions: [bar({ id: 'span', cx: 73.5, cy: 13, w: 25, h: 16 })] }, [realCase('HATCH-A-WIDTHS-A6'), realCase('HATCH-A-WIDTHS-A7')]);
  const spanDiag = twoCenters.mergeDiagnostics[0];
  ok('9. region covering two centres reported', spanDiag.centersInside === 2 && spanDiag.coveredCaseIds.length === 2 && spanDiag.possibleMergedRegion === true);

  // 10 — duplicated id
  const dupIds = run({ regions: [bar({ id: 'dup', cx: 80, cy: 13, w: 6, h: 16 }), bar({ id: 'dup', cx: 7, cy: 13, w: 0.5, h: 16 })] }, [realCase('HATCH-A-WIDTHS-A7')]);
  const dupCase = dupIds.cases[0];
  ok('10. duplicated id → no arbitrary extraction', dupCase.status === 'ambiguous' && dupCase.actual.widthMm.availability === 'unavailable'
    && dupCase.match.candidates.every(c => c.rejectedBy.includes('UNSTABLE_IDENTITY')));
  ok('10b. duplicated ids are not only a global warning', dupIds.identitySummary.duplicatedRegionIds.includes('dup') && dupCase.match.reasons.some(r => /unstable identity/i.test(r)));
  ok('10c. internal candidate keys stay unique', new Set(dupCase.match.candidateRegionIds).size === dupCase.match.candidateRegionIds.length);

  // 11 — missing id
  const noId = run({ regions: [bar({ id: undefined, cx: 80, cy: 13, w: 6, h: 16 })] }, [realCase('HATCH-A-WIDTHS-A7')]);
  ok('11. missing id → identity not stable', noId.identitySummary.missing_id === 1 && noId.cases[0].status === 'ambiguous'
    && noId.cases[0].match.candidates[0].identityStatus === 'missing_id');

  // 12 — duplicated caseId
  const dupCases = run(mmResult(), [realCase('HATCH-A-WIDTHS-A7'), realCase('HATCH-A-WIDTHS-A7')]);
  ok('12. duplicated caseId → invalid_input', dupCases.conclusion === 'invalid_input' && errorCodes(dupCases).includes('DUPLICATED_SEED_CASE_ID') && dupCases.cases.length === 0);

  // 13 / 14 / 15 — region source
  const twoCollections = { regions: mmResult().regions, objects: mmResult().regions };
  const ambiguousSource = run(twoCollections);
  ok('13. two collections without regionSource → invalid_input', ambiguousSource.conclusion === 'invalid_input' && errorCodes(ambiguousSource).includes('AMBIGUOUS_REGION_SOURCE')
    && ambiguousSource.inputSummary.availableRegionSources.length === 2 && ambiguousSource.inputSummary.countsByRegionSource.objects === 5);
  const explicitSource = run(twoCollections, A_WIDTHS_CASES, { regionSource: 'objects' });
  ok('14. explicit regionSource used and recorded', explicitSource.inputSummary.selectedRegionSource === 'objects' && explicitSource.inputSummary.regionSourceField === 'result.objects' && explicitSource.matchCoverage.matched === 5);
  const missingSource = run(mmResult(), A_WIDTHS_CASES, { regionSource: 'optimizedSequence' });
  ok('15. non-existent regionSource → invalid_input', missingSource.conclusion === 'invalid_input' && errorCodes(missingSource).includes('REGION_SOURCE_UNAVAILABLE'));
  ok('15b. single collection is used and recorded', base.inputSummary.selectedRegionSource === 'regions' && /Only one non-empty region collection/.test(base.inputSummary.regionSourceReason));

  // 16 / 17 / 18 — plan integrity
  const planDup = run({
    regions: [bar({ id: 'bar_A7', cx: 80, cy: 13, w: 6, h: 16 })],
    plan: { sequence: [{ regionId: 'bar_A7', stitchType: 'satin', density: 0.4 }, { regionId: 'bar_A7', stitchType: 'fill', density: 0.25 }] },
  }, [realCase('HATCH-A-WIDTHS-A7')]);
  const planDupCase = planDup.cases[0];
  ok('16. duplicated plan regionId detected, last entry not taken', planDup.planIntegrity.duplicatedRegionIds.includes('bar_A7')
    && planDupCase.planStatus === 'duplicated' && planDupCase.actual.planDensityMm.availability === 'unavailable');
  ok('16b. region value survives, plan value is not leaked', planDupCase.actual.technique.normalizedValue === 'satin' && planDupCase.actual.densityMm.normalizedValue === 0.36);
  const orphanPlan = run({
    regions: [bar({ id: 'bar_A7', cx: 80, cy: 13, w: 6, h: 16 })],
    plan: { sequence: [{ regionId: 'ghost', stitchType: 'satin' }, { stitchType: 'satin' }] },
  }, [realCase('HATCH-A-WIDTHS-A7')]);
  ok('17. orphan plan entries and entries without regionId reported', orphanPlan.planIntegrity.orphanPlanEntries.includes('ghost') && orphanPlan.planIntegrity.missingRegionIds.length === 1);
  ok('18. region without plan entry reported', orphanPlan.planIntegrity.regionsWithoutPlan.length === 1 && orphanPlan.cases[0].planStatus === 'missing');

  // 19 / 20 — technique provenance
  const techAgree = run({
    regions: [bar({ id: 'r1', cx: 80, cy: 13, w: 6, h: 16 })],
    plan: { sequence: [{ regionId: 'r1', stitchType: 'satin' }] },
  }, [realCase('HATCH-A-WIDTHS-A7')]);
  ok('19. region and plan technique agree → consistent', techAgree.cases[0].actual.technique.sourceAgreement === 'consistent' && techAgree.cases[0].actual.technique.availability === 'available');
  const techConflict = run({
    regions: [bar({ id: 'r1', cx: 80, cy: 13, w: 6, h: 16 })],
    plan: { sequence: [{ regionId: 'r1', stitchType: 'fill' }] },
  }, [realCase('HATCH-A-WIDTHS-A7')]);
  const tcCase = techConflict.cases[0];
  ok('20. technique conflict → availability conflict, no silent first source', tcCase.actual.technique.availability === 'conflict' && tcCase.actual.technique.sourceAgreement === 'conflict'
    && tcCase.actual.technique.selectedValue === null && tcCase.actual.technique.conflictDetails.length === 2);
  ok('20b. conflicted value is not compared', cmp(tcCase, 'technique').comparisonStatus === 'source_conflict' && cmp(tcCase, 'technique').comparable === false);

  // 21 / 22 — density provenance
  const densAgree = run({ regions: [bar({ id: 'r1', cx: 80, cy: 13, w: 6, h: 16 })], plan: { sequence: [{ regionId: 'r1', density: 0.36 }] } }, [realCase('HATCH-A-WIDTHS-A7')]);
  ok('21. density agreement kept', densAgree.cases[0].actual.densityMm.sourceAgreement === 'consistent' && densAgree.cases[0].actual.densityMm.normalizedValue === 0.36);
  const densConflict = run({ regions: [bar({ id: 'r1', cx: 80, cy: 13, w: 6, h: 16 })], plan: { sequence: [{ regionId: 'r1', density: 0.5 }] } }, [realCase('HATCH-A-WIDTHS-A7')]);
  ok('22. density conflict reported', densConflict.cases[0].actual.densityMm.availability === 'conflict' && densConflict.conflictFields.includes('densityMm'));

  // 23 / 24 — angle provenance, 0 preserved
  const angleAgree = run({ regions: [bar({ id: 'r1', cx: 80, cy: 13, w: 6, h: 16, extra: { fill_angle: 0 } })], plan: { sequence: [{ regionId: 'r1', optimalAngle: 0 }] } }, [realCase('HATCH-A-WIDTHS-A7')]);
  ok('23. angle 0 agreed across three sources', angleAgree.cases[0].actual.stitchAngleDeg.normalizedValue === 0 && angleAgree.cases[0].actual.stitchAngleDeg.availability === 'available'
    && angleAgree.cases[0].actual.stitchAngleDeg.normalizedSourceValues.length === 3);
  const angleConflict = run({ regions: [bar({ id: 'r1', cx: 80, cy: 13, w: 6, h: 16 })], plan: { sequence: [{ regionId: 'r1', optimalAngle: 90 }] } }, [realCase('HATCH-A-WIDTHS-A7')]);
  ok('24. angle conflict reported', angleConflict.cases[0].actual.stitchAngleDeg.availability === 'conflict');

  // 25 / 26 — underlay provenance
  const underlayAgree = buildUnderlayFields({
    region: { recommended_underlay: { enabled: true, type: 'edge_walk_zigzag', density_mm: 2 } },
    planEntry: { underlay: { type: 'edge_run_plus_zigzag', density: 2 } }, planStatus: 'single', options: DEFAULT_OPTIONS,
  });
  ok('25. underlay agreement kept', underlayAgree.primaryUnderlay.normalizedValue === 'edge_run_plus_zigzag' && underlayAgree.primaryUnderlay.sourceAgreement === 'consistent');
  const underlayConflict = buildUnderlayFields({
    region: { recommended_underlay: { enabled: true, type: 'centre_walk' } },
    planEntry: { underlay: { type: 'edge_run' } }, planStatus: 'single', options: DEFAULT_OPTIONS,
  });
  ok('26. underlay conflict reported', underlayConflict.primaryUnderlay.availability === 'conflict' && underlayConflict.primaryUnderlay.conflictDetails.length === 2);

  // 27–29 — density / spacing policy
  const forbidden = run(mmResult(), A_WIDTHS_CASES, { treatDensityAsSpacing: true });
  ok('27. treatDensityAsSpacing rejected', forbidden.conclusion === 'invalid_input' && errorCodes(forbidden).includes('UNVERIFIED_DENSITY_SPACING_EQUIVALENCE'));
  ok('28. densityMm stays available with its unit', a7.actual.densityMm.normalizedValue === 0.36 && a7.actual.densityMm.unit === 'mm');
  ok('29. spacingMm and spacingMode stay unavailable and uncompared', a7.actual.spacing.spacingMm.availability === 'unavailable' && a7.actual.spacing.spacingMode.availability === 'unavailable'
    && cmp(a7, 'spacingMm').comparisonStatus === 'not_comparable' && /pending validation/.test(cmp(a7, 'spacingMm').reason));

  // 30 / 31 — underlay density naming
  ok('30. underlayDensityMm carries the engine underlay density', a7.actual.underlay.underlayDensityMm.normalizedValue === 2
    && a7.actual.underlay.underlayDensityMm.sourceField === 'region.recommended_underlay.density_mm' && a7.actual.underlay.underlayDensityMm.unit === 'mm');
  ok('31. secondarySpacingMm is not fed by recommended_underlay.density_mm', a7.actual.underlay.secondarySpacingMm.availability === 'unavailable'
    && a7.actual.underlay.secondarySpacingMm.rawValue === null && a7.actual.underlay.secondaryUnderlay.availability === 'unavailable' && a7.actual.underlay.secondaryLengthMm.availability === 'unavailable');

  // 32–35 — informative deltas
  const obsWidth = cmp(a7, 'observedWidthMm_vs_engineWidthMm');
  ok('32. informative width delta computed', obsWidth.comparisonStatus === 'informational' && Math.abs(obsWidth.delta - (6 - 6.09)) < 1e-9);
  ok('33. absolute delta computed', Math.abs(obsWidth.absoluteDelta - 0.09) < 1e-9);
  ok('34. relative delta computed', Math.abs(obsWidth.relativeDelta - (-0.09 / 6.09)) < 1e-9 && obsWidth.withinTolerance === false);
  ok('35. informative comparison without pass/fail', !/"(pass|fail|improved|regressed)"/.test(JSON.stringify(a7.comparisons)) && obsWidth.tolerance === DEFAULT_OPTIONS.valueToleranceMm);
  ok('35b. nominal height delta kept too', Math.abs(cmp(a7, 'nominalHeightMm_vs_engineHeightMm').delta) < 1e-9 && cmp(a7, 'observedHeightMm_vs_engineHeightMm').absoluteDelta === 0);

  // 36 / 37 / 38 — conclusions
  const noTechnique = run(mmResult(Object.keys(CASE_GEOMETRY), { stitch_type: undefined }));
  ok('36. all matched but technique missing → partial', noTechnique.matchCoverage.matched === 5 && noTechnique.dataConclusion === 'incomplete' && noTechnique.conclusion === 'partial');
  ok('37. all matched with required fields available → evaluated', base.conclusion === 'evaluated' && base.matchConclusion === 'all_assigned' && base.dataConclusion === 'complete');
  ok('38. conflict in a required field → ambiguous per documented policy', techConflict.dataConclusion === 'conflicted' && techConflict.conclusion === 'ambiguous'
    && DEFAULT_OPTIONS.conflictInRequiredFieldPolicy === 'ambiguous');
  ok('38b. conclusion never based on matchCoverage alone', noTechnique.matchConclusion === 'all_assigned' && noTechnique.conclusion !== 'evaluated');
  ok('38c. conclusion vocabulary respected', CONCLUSIONS.includes(base.conclusion) && !/"(pass|fail|improved|regressed)"/.test(JSON.stringify(base.cases.map(c => c.comparisons))));

  // 39 / 40 — coverage
  ok('39. fieldCoverage includes widthMm and heightMm', base.fieldCoverage.widthMm.available === 5 && base.fieldCoverage.heightMm.available === 5
    && base.fieldCoverage.autoSplit.unavailable === 5 && base.fieldCoverage.underlayDensityMm.available === 5);
  ok('39b. source conflicts counted', techConflict.fieldCoverage.sourceConflicts.total === 1 && techConflict.fieldCoverage.sourceConflicts.byField.technique === 1);
  ok('40. stable identity recorded', base.fieldCoverage.stableIdentity.stable === 5 && base.cases.every(c => c.match.identityStatus === 'stable' && c.actual.internalCandidateKey != null));
  ok('40b. required fields declared with a safe default', JSON.stringify(DEFAULT_OPTIONS.requiredActualFields) === JSON.stringify(['widthMm', 'heightMm', 'technique']));

  // 41 / 42 — purity and determinism
  const fixture = mmResult();
  const fixtureSnapshot = JSON.stringify(fixture);
  const seedSnapshot = JSON.stringify(A_WIDTHS_CASES);
  const run1 = run(fixture);
  const run2 = run(fixture);
  ok('41. neither result nor seedCases mutated', JSON.stringify(fixture) === fixtureSnapshot && JSON.stringify(A_WIDTHS_CASES) === seedSnapshot);
  ok('42. same input → same output', JSON.stringify(run1) === JSON.stringify(run2) && run1.generatedAt === null);

  // 43 / 44 / 45 — seed untouched
  ok('43. the five real cases are intact', A_WIDTHS_CASES.length === 5 && Object.keys(CASE_GEOMETRY).every(id => realCase(id) != null)
    && A_WIDTHS_CASES.every(c => c.seedVersion === '1.1.0'));
  ok('44. expectedResult still null', A_WIDTHS_CASES.every(c => c.expectedResult === null) && !/expectedResult/.test(JSON.stringify(base.cases.map(c => c.actual))));
  ok('45. no rule promoted to confirmed', A_WIDTHS_CASES.every(c => c.confidence !== 'confirmed' && c.candidateRules.every(r => r.status === 'candidata' && r.physicalValidation === false)));

  // 46 — isolation contract: plain frozen data only
  const frozen = Object.freeze({ regions: Object.freeze(mmResult().regions.map(r => Object.freeze({ ...r }))) });
  const frozenOut = evaluateAWidthsResult({ result: frozen, seedCases: Object.freeze([...A_WIDTHS_CASES]), design: Object.freeze({ ...DESIGN_MM }) });
  ok('46. evaluator works on plain frozen data (no productive objects needed)', frozenOut.conclusion === 'evaluated');
  ok('46b. standalone measurement with an injected converter', (() => {
    const m = measureRegion(bar({ id: 'q', cx: 10, cy: 10, w: 2, h: 4 }), createPointConverter({ status: 'resolved', space: 'mm' }));
    return Math.abs(m.boundingWidthMm - 2) < 1e-9 && m.pointCount === 4;
  })());

  // 47 — engine never executed
  ok('47. no stitches, commands or exports produced', !('commands' in base) && !('stitches' in base) && base.cases.every(c => !('commands' in c.actual) && !('stitches' in c.actual))
    && base.inputSummary.measurementMethod === 'bounding_box_width');

  // extra unit-level guards
  ok('48. selectRegionSource reports counts per collection', selectRegionSource({ result: { regions: [1], objects: [] }, options: DEFAULT_OPTIONS }).countsByRegionSource.objects === 0);
  ok('49. plan index keeps every entry per regionId', buildPlanIndex({ result: { plan: { sequence: [{ regionId: 'a' }, { regionId: 'a' }] } }, candidates: [] }).entriesByRegionId.get('a').length === 2);
  ok('50. technique value normalizer keeps fill as fill', normalizeTechniqueValue('fill').normalizedValue === 'fill' && normalizeTechniqueValue('sculpted').availability === 'unknown');
  ok('51. merge detection is computed for every candidate', detectPossibleMergedRegions({ seedCases: [realCase('HATCH-A-WIDTHS-A7')], measuredCandidates: cands, options: DEFAULT_OPTIONS }).length === cands.length);
  ok('52. reference keeps documented nulls', buildReference(realCase('HATCH-A-WIDTHS-A1')).spacingMm === null && buildReference(realCase('HATCH-A-WIDTHS-A7')).spacingMm === 0.36);
  ok('53. coordinate space still never inferred', run(mmResult(), A_WIDTHS_CASES, {}, { widthMm: 100, heightMm: 80 }).conclusion === 'inconclusive');

  // ── P0.3A.2: assignment completeness and empty region source ──────────────
  // SYNTHETIC instance with many accepted candidates per case.
  const manyRegions = Array.from({ length: 10 }, (_, i) => bar({ id: `many_${i}`, cx: 79.6 + i * 0.08, cy: 13, w: 6, h: 16 }));
  const manyOut = run({ regions: manyRegions }, [realCase('HATCH-A-WIDTHS-A7')]);
  const manyCounts = manyOut.candidateCountsByCase['HATCH-A-WIDTHS-A7'];
  ok('A2-1. more than eight accepted candidates for one case', manyCounts.acceptedCandidates > 8 && manyCounts.evaluatedCandidates === 10);
  ok('A2-2. no accepted candidate silently dropped', manyCounts.candidatesUsedByAssignment === manyCounts.acceptedCandidates
    && manyCounts.candidatesExcluded === 0 && manyCounts.exclusionReason === null && manyOut.assignmentSearch.candidateLimitApplied === false);

  // SYNTHETIC 6-case instance whose search space exceeds 20 000 combinations.
  const BIG_N = 8;
  const bigCases = Array.from({ length: BIG_N }, (_, i) => syntheticCase({ caseId: `SYN-BIG-${i}`, cx: 20 + i * 0.7, cy: 13, w: 4, h: 16 }));
  const bigRegions = Array.from({ length: BIG_N }, (_, i) => bar({ id: `big_${String(i).padStart(2, '0')}`, cx: 20 + i * 0.7, cy: 13, w: 4, h: 16 }));
  const bigOut = run({ regions: bigRegions }, bigCases);
  const bigSearch = bigOut.assignmentSearch;
  ok('A2-3. search space above 20000 combinations', bigSearch.estimatedSearchSpace > 20000);
  const cappedEnumeration = (() => {
    // previous behaviour: stop after 20000 explored leaves → cannot cover the space
    let leaves = 0; let bestCount = 0; let bestScore = 0;
    const perCase = bigCases.map(c => (bigOut.assignment.candidateCountsByCase[c.caseId] || {}).acceptedCandidates || 0);
    const space = perCase.reduce((p, n) => p * (n + 1), 1);
    leaves = Math.min(space, 20000);
    for (const c of bigOut.assignment.assignments) { bestCount += 1; bestScore += c.score; }
    return { leaves, space, coversSpace: leaves >= space, bestCount, bestScore };
  })();
  ok('A2-4. a 20000-leaf cap cannot cover this space nor prove optimality', cappedEnumeration.coversSpace === false && cappedEnumeration.space > cappedEnumeration.leaves);
  ok('A2-5. the exact search finds an optimal one-to-one solution', bigOut.assignment.assignments.length === BIG_N
    && new Set(bigOut.assignment.assignments.map(a => a.internalCandidateKey)).size === BIG_N
    && bigOut.assignment.assignments.every((a, i) => a.internalCandidateKey.endsWith(`big_${String(i).padStart(2, '0')}`))
    && bigOut.assignment.totalScore >= cappedEnumeration.bestScore);
  ok('A2-6. searchComplete true on a complete assignment', bigSearch.searchComplete === true && base.assignmentSearch.searchComplete === true);
  ok('A2-7. optimalityProven true on a complete assignment', bigSearch.optimalityProven === true && /lexicographic admissible bounds/.test(bigSearch.proofMethod));
  ok('A2-8. stoppedEarly false on a complete assignment', bigSearch.stoppedEarly === false && bigSearch.solutionLimitApplied === false && bigSearch.stopReason === null);
  ok('A2-9. assignmentMethod does not claim truncation', !/truncated/.test(bigOut.assignment.assignmentMethod) && bigOut.assignment.assignmentMethod === 'exact_branch_and_bound');
  ok('A2-9b. branches explored and pruned reported', bigSearch.branchesExplored > 0 && bigSearch.solutionsExplored > 0 && Number.isFinite(bigSearch.branchesPruned));

  // Deliberately incomplete searches
  const cappedCandidates = run({ regions: bigRegions }, bigCases, { candidatesPerCaseLimit: 2 });
  ok('A2-10. candidate safety limit marks the search incomplete', cappedCandidates.assignmentSearch.candidateLimitApplied === true
    && cappedCandidates.assignmentSearch.searchComplete === false && cappedCandidates.assignmentSearch.optimalityProven === false
    && /NOT proven/.test(cappedCandidates.assignmentSearch.stopReason));
  ok('A2-11. incomplete search → inconclusive with a visible diagnostic', cappedCandidates.conclusion === 'inconclusive'
    && errorCodes(cappedCandidates).includes('ASSIGNMENT_SEARCH_INCOMPLETE') && cappedCandidates.optimalityProven === false);
  const cappedBranches = run(mmResult(), A_WIDTHS_CASES, { maximumBranches: 3 });
  ok('A2-12. interrupted search never concludes evaluated', cappedBranches.assignmentSearch.stoppedEarly === true
    && cappedBranches.conclusion === 'inconclusive' && cappedBranches.conclusion !== 'evaluated'
    && errorCodes(cappedBranches).includes('ASSIGNMENT_SEARCH_INCOMPLETE'));
  // A2-12b was replaced in P0.3A.3 by the direct suppression checks (A3-15…A3-17).

  // Explicit empty collection
  const emptyExplicit = run({ regions: [] }, A_WIDTHS_CASES, { regionSource: 'regions' });
  ok('A2-13. explicit empty collection resolves its provenance', emptyExplicit.inputSummary.selectedRegionSource === 'regions'
    && emptyExplicit.inputSummary.regionSourceField === 'result.regions' && emptyExplicit.inputSummary.regionCount === 0
    && !errorCodes(emptyExplicit).includes('REGION_SOURCE_UNAVAILABLE'));
  ok('A2-14. explicit empty collection → no_matches', emptyExplicit.matchCoverage.matched === 0 && emptyExplicit.conclusion === 'no_matches');
  const emptyImplicit = run({ regions: [] });
  ok('A2-14b. single declared empty collection is a valid engine result', emptyImplicit.conclusion === 'no_matches' && emptyImplicit.inputSummary.selectedRegionSource === 'regions');
  const absentSource = run({ plan: { sequence: [] } }, A_WIDTHS_CASES, { regionSource: 'regions' });
  ok('A2-15. requested collection absent → invalid_input', absentSource.conclusion === 'invalid_input' && errorCodes(absentSource).includes('REGION_SOURCE_UNAVAILABLE')
    && /does not exist/.test(absentSource.errors[0].message));
  const wrongType = run({ regions: { notAnArray: true } }, A_WIDTHS_CASES, { regionSource: 'regions' });
  ok('A2-16. requested collection with wrong type → invalid_input', wrongType.conclusion === 'invalid_input'
    && errorCodes(wrongType).includes('REGION_SOURCE_UNAVAILABLE') && /not an array/.test(wrongType.errors[0].message));
  const twoEmpty = run({ regions: [], objects: [] });
  ok('A2-17. two empty collections without regionSource → AMBIGUOUS_REGION_SOURCE', twoEmpty.conclusion === 'invalid_input'
    && errorCodes(twoEmpty).includes('AMBIGUOUS_REGION_SOURCE') && twoEmpty.inputSummary.countsByRegionSource.objects === 0);
  const twoEmptyExplicit = run({ regions: [], objects: [] }, A_WIDTHS_CASES, { regionSource: 'objects' });
  ok('A2-18. two empty collections with explicit regionSource → no_matches', twoEmptyExplicit.conclusion === 'no_matches'
    && twoEmptyExplicit.inputSummary.selectedRegionSource === 'objects');

  // Preserved guarantees under the new search
  const bigShuffledCases = [bigCases[4], bigCases[0], bigCases[5], bigCases[2], bigCases[7], bigCases[1], bigCases[6], bigCases[3]];
  const bigByCaseOrder = run({ regions: bigRegions }, bigShuffledCases);
  const bigByRegionOrder = run({ regions: [...bigRegions].reverse() }, bigCases);
  ok('A2-19. independent of case order on the large instance', signature(bigByCaseOrder) === signature(bigOut));
  ok('A2-20. independent of region order on the large instance', signature(bigByRegionOrder) === signature(bigOut));
  ok('A2-21. one-to-one assignment preserved', bigOut.assignment.assignments.every(a => a.internalCandidateKey != null)
    && bigOut.assignment.unassignedRegions.length === bigRegions.length - BIG_N);
  ok('A2-22. global-vs-greedy advantage preserved', globalOut.matchCoverage.matched === 2 && greedyCount === 1 && globalOut.assignmentSearch.optimalityProven === true);
  ok('A2-23. deterministic and non-mutating on the large instance', JSON.stringify(run({ regions: bigRegions }, bigCases)) === JSON.stringify(bigOut));
  ok('A2-24. evaluated still requires a proven search', base.conclusion === 'evaluated' && base.optimalityProven === true
    && cappedBranches.conclusion === 'inconclusive');

  // ── P0.3A.3: lexicographic bound, independent oracle, real suppression ─────
  const MARGIN = DEFAULT_OPTIONS.ambiguityScoreMargin;
  const solve = caseOptions => solveAssignmentOptions({ caseOptions, ambiguityScoreMargin: MARGIN, maximumBranches: DEFAULT_OPTIONS.maximumBranches });
  const sameSolution = (got, oracle) => got.matchCount === oracle.matchCount
    && got.totalScore === oracle.totalScore
    && got.totalCenterDistance === oracle.totalCenterDistance
    && got.signature === oracle.signature
    && JSON.stringify(got.bestAssignments) === JSON.stringify(oracle.assignments)
    && JSON.stringify(got.ambiguousCaseIds) === JSON.stringify(oracle.ambiguousCaseIds);

  // SYNTHETIC adversarial instance: 4 matches / 4.00 found first, optimum is 5 / 3.75.
  const ADVERSARIAL = [
    { caseId: 'SYN-ADV-A', options: [{ internalCandidateKey: 'K1', score: 1.0, centerDistanceMm: 0.1 }, { internalCandidateKey: 'K5', score: 0.5, centerDistanceMm: 0.4 }] },
    { caseId: 'SYN-ADV-B', options: [{ internalCandidateKey: 'K2', score: 1.0, centerDistanceMm: 0.1 }, { internalCandidateKey: 'K5', score: 0.05, centerDistanceMm: 0.9 }] },
    { caseId: 'SYN-ADV-C', options: [{ internalCandidateKey: 'K3', score: 1.0, centerDistanceMm: 0.1 }, { internalCandidateKey: 'K5', score: 0.05, centerDistanceMm: 0.9 }] },
    { caseId: 'SYN-ADV-D', options: [{ internalCandidateKey: 'K4', score: 1.0, centerDistanceMm: 0.1 }, { internalCandidateKey: 'K5', score: 0.05, centerDistanceMm: 0.9 }] },
    { caseId: 'SYN-ADV-E', options: [{ internalCandidateKey: 'K1', score: 0.25, centerDistanceMm: 0.8 }, { internalCandidateKey: 'K2', score: 0.05, centerDistanceMm: 0.9 }] },
  ];
  const advSolved = solve(ADVERSARIAL);
  const advOracle = bruteForceAssignmentOracle(ADVERSARIAL, MARGIN);
  const advLegacy = legacyBuggySolve(ADVERSARIAL, MARGIN);
  ok('A3-1. matchCount has priority over totalScore', advSolved.matchCount === 5 && advSolved.totalScore === 3.75
    && advOracle.matchCount === 5 && advOracle.totalScore === 3.75);
  ok('A3-2. a 4-match/4.00 solution does not win over 5-match/3.75', advSolved.totalScore < 4.0 && advSolved.matchCount > 4
    && advSolved.bestAssignments.find(a => a.caseId === 'SYN-ADV-A').internalCandidateKey === 'K5');
  ok('A3-3. the five-match branch is not pruned by score (legacy rule would lose it)', advLegacy.matchCount === 4 && advLegacy.totalScore === 4
    && advSolved.matchCount === 5);
  ok('A3-4. score pruning still applies when maxPossibleMatches equals best.matchCount', (() => {
    const flat = [
      { caseId: 'SYN-SC-A', options: [{ internalCandidateKey: 'P', score: 1.0, centerDistanceMm: 0.1 }, { internalCandidateKey: 'Q', score: 0.8, centerDistanceMm: 0.2 }] },
      { caseId: 'SYN-SC-B', options: [{ internalCandidateKey: 'R', score: 1.0, centerDistanceMm: 0.1 }, { internalCandidateKey: 'S', score: 0.8, centerDistanceMm: 0.2 }] },
    ];
    const got = solve(flat);
    return got.pruning.byScore > 0 && got.matchCount === 2 && got.totalScore === 2 && sameSolution(got, bruteForceAssignmentOracle(flat, MARGIN));
  })());
  ok('A3-5. match-count pruning applies when the branch cannot reach the best count', advSolved.pruning.byMatchCount > 0);
  ok('A3-6. pruning counters are consistent and every pruned branch has a reason', (() => {
    const p = advSolved.pruning;
    return p.total === p.byMatchCount + p.byScore + p.byDistance + p.byOther
      && p.total === advSolved.stats.branchesPruned && p.byDistance === 0 && p.byOther === 0;
  })());
  ok('A3-7. objective priority declared in the correct order', JSON.stringify(advSolved.objectivePriority) === JSON.stringify(['matchCount_desc', 'totalScore_desc', 'totalCenterDistance_asc', 'signature_asc'])
    && JSON.stringify(bigOut.assignmentSearch.objectivePriority) === JSON.stringify(advSolved.objectivePriority));
  ok('A3-8. adversarial instance matches the independent oracle exactly', sameSolution(advSolved, advOracle)
    && advSolved.alternativeSolutionCount === advOracle.alternativeSolutionCount);

  // 100 deterministic SYNTHETIC instances against the oracle
  const instances = buildRandomInstances(100, 20260728);
  const corpus = instances.map(caseOptions => {
    const got = solve(caseOptions);
    const oracle = bruteForceAssignmentOracle(caseOptions, MARGIN);
    return { got, oracle, agrees: sameSolution(got, oracle) && got.alternativeSolutionCount === oracle.alternativeSolutionCount };
  });
  const divergences = corpus.filter(c => !c.agrees).length;
  ok('A3-9. 100 deterministic instances match the oracle in every objective field', corpus.length === 100 && divergences === 0);
  ok('A3-10. ambiguousCaseIds match the oracle, and ambiguity really occurs', corpus.every(c => JSON.stringify(c.got.ambiguousCaseIds) === JSON.stringify(c.oracle.ambiguousCaseIds))
    && corpus.some(c => c.oracle.ambiguousCaseIds.length > 0));
  ok('A3-11. distance tie-break matches the oracle', corpus.every(c => c.got.totalCenterDistance === c.oracle.totalCenterDistance)
    && corpus.some(c => c.oracle.totalCenterDistance > 0));
  ok('A3-12. signature tie-break matches the oracle', corpus.every(c => c.got.signature === c.oracle.signature)
    && corpus.some(c => c.got.signature.includes('∅')) && corpus.some(c => !c.got.signature.includes('∅')));
  ok('A3-12b. corpus covers cases without options, partial and complete solutions', instances.some(inst => inst.some(c => c.options.length === 0))
    && corpus.some(c => c.oracle.matchCount === 0) && corpus.some(c => c.oracle.matchCount === c.got.bestAssignments.length && c.oracle.matchCount > 1)
    && corpus.some(c => c.oracle.enumeratedSolutions > 100));
  ok('A3-13. a completed search proves optimality', corpus.every(c => c.got.stats.stoppedEarly === false)
    && bigOut.optimalityProven === true && base.optimalityProven === true);
  ok('A3-14. an interrupted search never claims optimality', cappedBranches.optimalityProven === false && cappedCandidates.optimalityProven === false);

  // Real suppression of comparisons
  const suppressed = (out, label, expectedCases) => {
    ok(`${label} comparisons suppressed and flagged`, out.comparisonSuppressed === true
      && out.comparisonSuppressionReason === 'ASSIGNMENT_SEARCH_INCOMPLETE'
      && out.dataConclusion === 'unavailable' && out.conclusion === 'inconclusive'
      && out.assignment === null && out.provisionalAssignment !== null && /PROVISIONAL/.test(out.provisionalAssignment.note));
    ok(`${label} no case keeps a confirmed region or actual value`, out.cases.length === expectedCases
      && out.cases.every(c => c.status === 'unavailable' && c.match.internalCandidateKey === null && c.match.selectedRegionId === null
        && c.actual.widthMm.availability !== 'available' && c.actual.heightMm.availability !== 'available' && c.actual.technique.availability !== 'available'));
    ok(`${label} no actualValue and no delta survives`, out.cases.every(c => c.comparisons.length > 0 && c.comparisons.every(x =>
      x.actualValue === null && x.delta === null && x.absoluteDelta === null && x.relativeDelta === null
      && x.comparable === false && x.comparisonStatus === 'assignment_search_incomplete')));
    ok(`${label} no equal / different / informational / source_conflict status`, out.cases.every(c => c.comparisons.every(x =>
      !['equal', 'different', 'informational', 'source_conflict'].includes(x.comparisonStatus))));
  };
  suppressed(cappedBranches, 'A3-15.', A_WIDTHS_CASES.length);
  suppressed(cappedCandidates, 'A3-16.', BIG_N);
  ok('A3-17. suppression status belongs to the declared vocabulary and is not reused', COMPARISON_STATUS.includes('assignment_search_incomplete')
    && base.cases.every(c => c.comparisons.every(x => x.comparisonStatus !== 'assignment_search_incomplete'))
    && caseOf(dupIds, 'HATCH-A-WIDTHS-A7').comparisons.every(x => x.comparisonStatus !== 'assignment_search_incomplete'));
  ok('A3-18. a proven search still produces informative comparisons', base.comparisonSuppressed === false && base.comparisonSuppressionReason === null
    && base.provisionalAssignment === null && cmp(a7, 'observedWidthMm_vs_engineWidthMm').comparisonStatus === 'informational'
    && cmp(a7, 'observedWidthMm_vs_engineWidthMm').actualValue !== null);
  ok('A3-19. explicit empty collection still yields no_matches', emptyExplicit.conclusion === 'no_matches' && emptyExplicit.comparisonSuppressed === false);
  ok('A3-20. solver independent of case order', (() => {
    const shuffled = [ADVERSARIAL[3], ADVERSARIAL[0], ADVERSARIAL[4], ADVERSARIAL[2], ADVERSARIAL[1]];
    return sameSolution(solve(shuffled), advOracle);
  })());
  ok('A3-21. solver independent of option order', (() => {
    const flipped = ADVERSARIAL.map(c => ({ caseId: c.caseId, options: [...c.options].reverse() }));
    return sameSolution(solve(flipped), advOracle);
  })());
  ok('A3-22. one-to-one assignment kept in every instance', corpus.every(c => {
    const usedKeys = c.got.bestAssignments.map(a => a.internalCandidateKey);
    return new Set(usedKeys).size === usedKeys.length;
  }));
  ok('A3-23. the five real cases remain untouched', A_WIDTHS_CASES.length === 5 && A_WIDTHS_CASES.every(c => c.phase === 'A_WIDTHS' && c.seedVersion === '1.1.0'));
  ok('A3-24. expectedResult still null everywhere', A_WIDTHS_CASES.every(c => c.expectedResult === null));
  ok('A3-25. still no confirmed rule', A_WIDTHS_CASES.every(c => c.candidateRules.every(r => r.status === 'candidata')));
  ok('A3-26. solver does not mutate its input', (() => {
    const snapshot = JSON.stringify(ADVERSARIAL);
    solve(ADVERSARIAL);
    return JSON.stringify(ADVERSARIAL) === snapshot;
  })());
  ok('A3-27. solver is deterministic', JSON.stringify(solve(ADVERSARIAL)) === JSON.stringify(advSolved)
    && JSON.stringify(run(mmResult())) === JSON.stringify(base));
  ok('A3-28. solver needs no engine, no pipeline and no geometry', typeof solveAssignmentOptions === 'function'
    && !/stitch|command|export/i.test(JSON.stringify(advSolved)));
  ok('A3-29. engine still never executed', !('commands' in cappedBranches) && !('stitches' in cappedBranches)
    && cappedBranches.cases.every(c => !('commands' in c.actual)) && base.inputSummary.measurementMethod === 'bounding_box_width');

  return { name: 'hatchLab/aWidthsEvaluator', pass: fails.length === 0, checks, fails };
}