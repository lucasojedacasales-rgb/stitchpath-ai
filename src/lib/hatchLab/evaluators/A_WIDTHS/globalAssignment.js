/**
 * globalAssignment.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A.2)
 * Exact, deterministic global one-to-one assignment between cases and regions,
 * proven optimal by exhaustive branch-and-bound with admissible upper bounds.
 * No accepted candidate is dropped silently and a truncated search can never be
 * presented as optimal.
 */

import { evaluateCandidatesForCase, tolerancesUsed } from './regionMatcher.js';

const ROUND = v => Math.round(v * 1e9) / 1e9;

function buildSignature(chosen) {
  return [...chosen]
    .sort((a, b) => String(a.caseId).localeCompare(String(b.caseId)))
    .map(a => `${a.caseId}→${a.internalCandidateKey ?? '∅'}`).join('|');
}

/**
 * Exhaustive branch-and-bound. The bounds are admissible upper bounds
 * (remaining assignable cases and the sum of the best remaining scores), so
 * pruning can never discard the optimum nor an equally good alternative.
 */
function search({ order, suffixPossible, suffixBestScore, ambiguityScoreMargin, maximumBranches }) {
  const stats = { branchesExplored: 0, branchesPruned: 0, solutionsExplored: 0, stoppedEarly: false };
  let best = null;
  let nearBest = [];

  const isBetter = (a, b) => !b
    || a.matchCount > b.matchCount
    || (a.matchCount === b.matchCount && a.totalScore > b.totalScore)
    || (a.matchCount === b.matchCount && a.totalScore === b.totalScore && a.totalCenterDistance < b.totalCenterDistance)
    || (a.matchCount === b.matchCount && a.totalScore === b.totalScore && a.totalCenterDistance === b.totalCenterDistance && a.signature.localeCompare(b.signature) < 0);

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
    if (isBetter(solution, best)) {
      best = solution;
      nearBest = nearBest.filter(s => s.matchCount === best.matchCount && s.totalScore >= best.totalScore - ambiguityScoreMargin);
    }
    if (solution.matchCount === best.matchCount && solution.totalScore >= best.totalScore - ambiguityScoreMargin) nearBest.push(solution);
  }

  function dfs(index, used, chosen, currentScore) {
    if (stats.stoppedEarly) return;
    stats.branchesExplored += 1;
    if (stats.branchesExplored > maximumBranches) { stats.stoppedEarly = true; return; }
    if (index === order.length) { record(chosen); return; }

    if (best) {
      const assignedSoFar = chosen.filter(a => a.internalCandidateKey != null).length;
      if (assignedSoFar + suffixPossible[index] < best.matchCount) { stats.branchesPruned += 1; return; }
      if (currentScore + suffixBestScore[index] < best.totalScore - ambiguityScoreMargin) { stats.branchesPruned += 1; return; }
    }

    const { caseId, options } = order[index];
    for (const option of options) {
      if (used.has(option.internalCandidateKey)) continue;
      used.add(option.internalCandidateKey);
      chosen.push({ caseId, internalCandidateKey: option.internalCandidateKey, score: option.score, centerDistanceMm: option.centerDistanceMm });
      dfs(index + 1, used, chosen, currentScore + option.score);
      chosen.pop();
      used.delete(option.internalCandidateKey);
      if (stats.stoppedEarly) return;
    }
    // leaving a case unmatched is always a legal branch
    chosen.push({ caseId, internalCandidateKey: null, score: 0, centerDistanceMm: 0 });
    dfs(index + 1, used, chosen, currentScore);
    chosen.pop();
  }

  dfs(0, new Set(), [], 0);
  return { stats, best, nearBest };
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
    return { caseId: seedCase.caseId, options: used };
  });

  // Deterministic exploration order: fewest options first, then caseId.
  const order = [...caseOptions].sort((a, b) => a.options.length - b.options.length || String(a.caseId).localeCompare(String(b.caseId)));
  const suffixPossible = new Array(order.length + 1).fill(0);
  const suffixBestScore = new Array(order.length + 1).fill(0);
  for (let i = order.length - 1; i >= 0; i--) {
    suffixPossible[i] = suffixPossible[i + 1] + (order[i].options.length > 0 ? 1 : 0);
    suffixBestScore[i] = suffixBestScore[i + 1] + (order[i].options.length > 0 ? Math.max(...order[i].options.map(o => o.score)) : 0);
  }
  const estimatedSearchSpace = order.reduce((p, c) => p * (c.options.length + 1), 1);

  const { stats, best, nearBest } = search({
    order, suffixPossible, suffixBestScore,
    ambiguityScoreMargin: margin,
    maximumBranches: options.maximumBranches,
  });

  const searchComplete = stats.stoppedEarly === false && candidateLimitApplied === false;
  const assignmentSearch = {
    searchComplete,
    optimalityProven: searchComplete,
    solutionsExplored: stats.solutionsExplored,
    branchesExplored: stats.branchesExplored,
    branchesPruned: stats.branchesPruned,
    estimatedSearchSpace,
    candidateLimitApplied,
    solutionLimitApplied: false,
    stoppedEarly: stats.stoppedEarly,
    stopReason: stats.stoppedEarly
      ? `Resource guard maximumBranches = ${options.maximumBranches} reached; the search was interrupted and optimality is NOT proven.`
      : candidateLimitApplied
        ? `candidatesPerCaseLimit = ${limit} was applied to at least one case (${totalExcluded} accepted candidate(s) excluded); optimality is NOT proven.`
        : null,
    candidatesExcludedTotal: totalExcluded,
    proofMethod: 'exhaustive depth-first search with admissible upper bounds (remaining assignable cases and sum of best remaining scores); pruning only removes branches that cannot reach the best match count nor come within ambiguityScoreMargin of the best score',
  };

  const resolvedBest = best || { assignments: [], matchCount: 0, totalScore: 0, totalCenterDistance: 0, signature: '' };
  const equallyGood = nearBest.filter(s => s.matchCount === resolvedBest.matchCount && Math.abs(s.totalScore - resolvedBest.totalScore) < margin);

  const perCaseKeys = new Map();
  for (const solution of equallyGood) {
    for (const caseId of sortedCases.map(c => c.caseId)) {
      const found = solution.assignments.find(a => a.caseId === caseId);
      const set = perCaseKeys.get(caseId) || new Set();
      set.add(found ? found.internalCandidateKey : '∅');
      perCaseKeys.set(caseId, set);
    }
  }
  const ambiguousCaseIds = [...perCaseKeys.entries()].filter(([, set]) => set.size > 1).map(([caseId]) => caseId).sort();

  const assignments = resolvedBest.assignments
    .filter(a => !ambiguousCaseIds.includes(a.caseId))
    .map(a => ({ ...a }))
    .sort((x, y) => String(x.caseId).localeCompare(String(y.caseId)));
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
    evaluationsByCase,
    candidateCountsByCase,
    assignmentSearch,
    ambiguousCaseIds,
    alternativeSolutionCount: equallyGood.length,
    tolerancesUsed: tolerancesUsed(options),
  };
}