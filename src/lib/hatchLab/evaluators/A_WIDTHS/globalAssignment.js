/**
 * globalAssignment.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A.3)
 *
 * Exact, deterministic global one-to-one assignment between cases and regions.
 *
 * 0.2.1 corrects the pruning: the bounds now respect the LEXICOGRAPHIC objective
 * (matchCount → totalScore → totalCenterDistance → signature). A branch that can
 * still reach MORE matched cases is never pruned by score, however low its score
 * bound is.
 *
 * Two responsibilities are separated:
 *   A. geometric evaluation of candidates (regionMatcher) → matchCasesToRegions;
 *   B. solving the assignment problem over already evaluated options
 *      → solveAssignmentOptions (pure, geometry-free, independently testable).
 */

import { evaluateCandidatesForCase, tolerancesUsed } from './regionMatcher.js';

const ROUND = v => Math.round(v * 1e9) / 1e9;

/**
 * Floating-point slack for the score bound. Without it, accumulated summation
 * error (e.g. 3.5999999999999996 vs 3.6) can prune a branch that is exactly at
 * the ambiguity margin, which would hide an equally good alternative solution.
 */
const BOUND_EPSILON = 1e-9;

/** Declared objective, in strict priority order. */
export const OBJECTIVE_PRIORITY = Object.freeze([
  'matchCount_desc', 'totalScore_desc', 'totalCenterDistance_asc', 'signature_asc',
]);

export const PROOF_METHOD = 'exact depth-first branch-and-bound with lexicographic admissible bounds: a branch is pruned only when it cannot reach the best match count, or when it can reach exactly the best match count and its best possible score stays below the best score minus ambiguityScoreMargin; a branch that can reach MORE matches is never pruned by score';

export function buildSignature(chosen) {
  return [...chosen]
    .sort((a, b) => String(a.caseId).localeCompare(String(b.caseId)))
    .map(a => `${a.caseId}→${a.internalCandidateKey ?? '∅'}`).join('|');
}

/** Lexicographic objective comparison: is `a` strictly better than `b`? */
export function isBetterSolution(a, b) {
  if (!b) return true;
  if (a.matchCount !== b.matchCount) return a.matchCount > b.matchCount;
  if (a.totalScore !== b.totalScore) return a.totalScore > b.totalScore;
  if (a.totalCenterDistance !== b.totalCenterDistance) return a.totalCenterDistance < b.totalCenterDistance;
  return a.signature.localeCompare(b.signature) < 0;
}

function search({ order, suffixPossible, suffixBestScore, ambiguityScoreMargin, maximumBranches }) {
  const stats = { branchesExplored: 0, branchesPruned: 0, solutionsExplored: 0, stoppedEarly: false };
  const pruning = { byMatchCount: 0, byScore: 0, byDistance: 0, byOther: 0, total: 0 };
  const prune = reason => { pruning[reason] += 1; pruning.total += 1; stats.branchesPruned += 1; };
  let best = null;
  let nearBest = [];

  function record(chosen) {
    stats.solutionsExplored += 1;
    const assigned = chosen.filter(a => a.internalCandidateKey != null);
    const solution = {
      assignments: assigned.map(a => ({ ...a })),
      matchCount: assigned.length,
      totalScore: ROUND(assigned.reduce((s, a) => s + a.score, 0)),
      totalCenterDistance: ROUND(assigned.reduce((s, a) => s + a.centerDistanceMm, 0)),
      signature: buildSignature(chosen),
    };
    if (isBetterSolution(solution, best)) {
      best = solution;
      nearBest = nearBest.filter(s => s.matchCount === best.matchCount && s.totalScore >= best.totalScore - ambiguityScoreMargin);
    }
    if (solution.matchCount === best.matchCount && solution.totalScore >= best.totalScore - ambiguityScoreMargin) nearBest.push(solution);
  }

  function dfs(index, used, chosen, currentScore, assignedSoFar) {
    if (stats.stoppedEarly) return;
    stats.branchesExplored += 1;
    if (stats.branchesExplored > maximumBranches) { stats.stoppedEarly = true; return; }
    if (index === order.length) { record(chosen); return; }

    if (best) {
      // 1. match count — the highest priority objective.
      const maxPossibleMatches = assignedSoFar + suffixPossible[index];
      if (maxPossibleMatches < best.matchCount) { prune('byMatchCount'); return; }

      // 2. score — ONLY when this branch cannot beat the best match count.
      //    A branch that can still reach MORE matches is never pruned by score.
      if (maxPossibleMatches === best.matchCount) {
        const maxPossibleScore = currentScore + suffixBestScore[index];
        if (maxPossibleScore < best.totalScore - ambiguityScoreMargin - BOUND_EPSILON) { prune('byScore'); return; }
      }
      // 3./4. distance and signature are never used as pruning bounds: no
      //       admissible bound exists for them, so byDistance/byOther stay 0.
    }

    const { caseId, options } = order[index];
    for (const option of options) {
      if (used.has(option.internalCandidateKey)) continue;
      used.add(option.internalCandidateKey);
      chosen.push({ caseId, internalCandidateKey: option.internalCandidateKey, score: option.score, centerDistanceMm: option.centerDistanceMm });
      dfs(index + 1, used, chosen, currentScore + option.score, assignedSoFar + 1);
      chosen.pop();
      used.delete(option.internalCandidateKey);
      if (stats.stoppedEarly) return;
    }
    // leaving a case unmatched is always a legal branch
    chosen.push({ caseId, internalCandidateKey: null, score: 0, centerDistanceMm: 0 });
    dfs(index + 1, used, chosen, currentScore, assignedSoFar);
    chosen.pop();
  }

  dfs(0, new Set(), [], 0, 0);
  return { stats, pruning, best, nearBest };
}

/**
 * Pure assignment solver over ALREADY EVALUATED options.
 * @param {{caseOptions: Array<{caseId: string, options: Array<{internalCandidateKey: string, score: number, centerDistanceMm: number}>}>, ambiguityScoreMargin: number, maximumBranches: number}} params
 */
export function solveAssignmentOptions({ caseOptions = [], ambiguityScoreMargin = 0, maximumBranches = Number.POSITIVE_INFINITY }) {
  const normalized = caseOptions.map(c => ({ caseId: String(c.caseId), options: [...(c.options || [])] }));
  const caseIds = normalized.map(c => c.caseId).sort((a, b) => a.localeCompare(b));

  // Deterministic exploration order: fewest options first, then caseId.
  const order = [...normalized].sort((a, b) => a.options.length - b.options.length || a.caseId.localeCompare(b.caseId));
  const suffixPossible = new Array(order.length + 1).fill(0);
  const suffixBestScore = new Array(order.length + 1).fill(0);
  for (let i = order.length - 1; i >= 0; i--) {
    suffixPossible[i] = suffixPossible[i + 1] + (order[i].options.length > 0 ? 1 : 0);
    suffixBestScore[i] = suffixBestScore[i + 1] + (order[i].options.length > 0 ? Math.max(...order[i].options.map(o => o.score)) : 0);
  }
  const estimatedSearchSpace = order.reduce((p, c) => p * (c.options.length + 1), 1);

  const { stats, pruning, best, nearBest } = search({ order, suffixPossible, suffixBestScore, ambiguityScoreMargin, maximumBranches });

  const resolvedBest = best || { assignments: [], matchCount: 0, totalScore: 0, totalCenterDistance: 0, signature: '' };
  const equallyGood = nearBest.filter(s => s.matchCount === resolvedBest.matchCount && Math.abs(s.totalScore - resolvedBest.totalScore) < ambiguityScoreMargin);

  const perCaseKeys = new Map();
  for (const solution of equallyGood) {
    for (const caseId of caseIds) {
      const found = solution.assignments.find(a => a.caseId === caseId);
      const set = perCaseKeys.get(caseId) || new Set();
      set.add(found ? found.internalCandidateKey : '∅');
      perCaseKeys.set(caseId, set);
    }
  }
  const ambiguousCaseIds = [...perCaseKeys.entries()].filter(([, set]) => set.size > 1).map(([caseId]) => caseId).sort();

  return {
    matchCount: resolvedBest.matchCount,
    totalScore: resolvedBest.totalScore,
    totalCenterDistance: resolvedBest.totalCenterDistance,
    signature: resolvedBest.signature,
    bestAssignments: resolvedBest.assignments.map(a => ({ ...a })).sort((x, y) => x.caseId.localeCompare(y.caseId)),
    ambiguousCaseIds,
    alternativeSolutionCount: equallyGood.length,
    estimatedSearchSpace,
    stats,
    pruning,
    objectivePriority: OBJECTIVE_PRIORITY,
    proofMethod: PROOF_METHOD,
  };
}

/**
 * @returns assignment descriptor including assignmentSearch (completeness proof)
 * and candidateCountsByCase (no silent candidate loss).
 */
export function matchCasesToRegions({ seedCases = [], measuredCandidates = [], options }) {
  const sortedCases = [...seedCases].sort((a, b) => String(a.caseId).localeCompare(String(b.caseId)));
  const sortedCandidates = [...measuredCandidates].sort((a, b) => a.internalCandidateKey.localeCompare(b.internalCandidateKey));
  const limit = options.candidatesPerCaseLimit;
  const margin = options.ambiguityScoreMargin;

  const evaluationsByCase = new Map();
  const candidateCountsByCase = {};
  let candidateLimitApplied = false;
  let totalExcluded = 0;

  const caseOptions = sortedCases.map(seedCase => {
    const { target, evaluations, reason } = evaluateCandidatesForCase({ seedCase, candidates: sortedCandidates, options });
    evaluationsByCase.set(seedCase.caseId, { target, evaluations, reason });
    const accepted = evaluations.filter(e => e.eligibility === 'accepted');
    const withinLimit = Number.isFinite(limit) && accepted.length > limit;
    const used = withinLimit ? accepted.slice(0, limit) : accepted;
    if (withinLimit) { candidateLimitApplied = true; totalExcluded += accepted.length - used.length; }
    candidateCountsByCase[seedCase.caseId] = {
      evaluatedCandidates: evaluations.length,
      acceptedCandidates: accepted.length,
      rejectedCandidates: evaluations.length - accepted.length,
      candidatesUsedByAssignment: used.length,
      candidatesExcluded: accepted.length - used.length,
      exclusionReason: withinLimit
        ? `Safety limit candidatesPerCaseLimit = ${limit} exceeded (${accepted.length} accepted candidates); the search is NOT complete and no evaluated conclusion is possible.`
        : null,
    };
    return {
      caseId: seedCase.caseId,
      options: used.map(o => ({ internalCandidateKey: o.internalCandidateKey, score: o.score, centerDistanceMm: o.centerDistanceMm })),
    };
  });

  const solved = solveAssignmentOptions({ caseOptions, ambiguityScoreMargin: margin, maximumBranches: options.maximumBranches });
  const { stats, pruning } = solved;

  const searchComplete = stats.stoppedEarly === false && candidateLimitApplied === false;
  const assignmentSearch = {
    searchComplete,
    optimalityProven: searchComplete,
    solutionsExplored: stats.solutionsExplored,
    branchesExplored: stats.branchesExplored,
    branchesPruned: stats.branchesPruned,
    pruning,
    objectivePriority: solved.objectivePriority,
    estimatedSearchSpace: solved.estimatedSearchSpace,
    candidateLimitApplied,
    solutionLimitApplied: false,
    stoppedEarly: stats.stoppedEarly,
    stopReason: stats.stoppedEarly
      ? `Resource guard maximumBranches = ${options.maximumBranches} reached; the search was interrupted and optimality is NOT proven.`
      : candidateLimitApplied
        ? `candidatesPerCaseLimit = ${limit} was applied to at least one case (${totalExcluded} accepted candidate(s) excluded); optimality is NOT proven.`
        : null,
    candidatesExcludedTotal: totalExcluded,
    proofMethod: solved.proofMethod,
  };

  const ambiguousCaseIds = solved.ambiguousCaseIds;
  const assignments = solved.bestAssignments.filter(a => !ambiguousCaseIds.includes(a.caseId)).map(a => ({ ...a }));
  const assignedKeys = new Set(assignments.map(a => a.internalCandidateKey));

  const collisionsPrevented = [];
  for (const candidate of sortedCandidates) {
    const claimants = caseOptions.filter(c => c.options.some(o => o.internalCandidateKey === candidate.internalCandidateKey)).map(c => c.caseId);
    if (claimants.length > 1) collisionsPrevented.push({ internalCandidateKey: candidate.internalCandidateKey, declaredRegionId: candidate.declaredRegionId, competingCaseIds: claimants, reason: 'Several cases accept the same region; the one-to-one assignment gives it to at most one case.' });
  }

  return {
    assignments,
    unassignedCases: sortedCases.map(c => c.caseId).filter(id => !assignments.some(a => a.caseId === id)),
    unassignedRegions: sortedCandidates.filter(c => !assignedKeys.has(c.internalCandidateKey)).map(c => c.internalCandidateKey),
    collisionsPrevented,
    totalScore: ROUND(assignments.reduce((s, a) => s + a.score, 0)),
    assignmentMethod: searchComplete ? 'exact_branch_and_bound' : 'exact_branch_and_bound_interrupted',
    deterministicTieBreak: 'matchCount desc → totalScore desc → totalCenterDistance asc → signature (caseId + internalCandidateKey) asc',
    objectivePriority: solved.objectivePriority,
    evaluationsByCase,
    candidateCountsByCase,
    assignmentSearch,
    ambiguousCaseIds,
    alternativeSolutionCount: solved.alternativeSolutionCount,
    tolerancesUsed: tolerancesUsed(options),
  };
}