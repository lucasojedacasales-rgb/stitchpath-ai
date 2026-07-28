/**
 * globalAssignment.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A.1)
 * Deterministic global one-to-one assignment between cases and regions.
 * Each case receives at most one region and each region at most one case.
 */

import { evaluateCandidatesForCase, tolerancesUsed } from './regionMatcher.js';

const ROUND = v => Math.round(v * 1e9) / 1e9;

function enumerateSolutions(caseOptions, index, used, current, acc, limit) {
  if (acc.solutions.length >= limit) return;
  if (index === caseOptions.length) {
    const matchCount = current.filter(a => a.internalCandidateKey != null).length;
    const totalScore = ROUND(current.reduce((s, a) => s + (a.score ?? 0), 0));
    const totalCenterDistance = ROUND(current.reduce((s, a) => s + (a.centerDistanceMm ?? 0), 0));
    acc.solutions.push({
      assignments: current.map(a => ({ ...a })),
      matchCount, totalScore, totalCenterDistance,
      signature: current.map(a => `${a.caseId}→${a.internalCandidateKey ?? '∅'}`).join('|'),
    });
    return;
  }
  const { caseId, options } = caseOptions[index];
  for (const option of options) {
    if (used.has(option.internalCandidateKey)) continue;
    used.add(option.internalCandidateKey);
    current.push({ caseId, internalCandidateKey: option.internalCandidateKey, score: option.score, centerDistanceMm: option.centerDistanceMm });
    enumerateSolutions(caseOptions, index + 1, used, current, acc, limit);
    current.pop();
    used.delete(option.internalCandidateKey);
  }
  // skipping a case is always allowed (it may be genuinely unmatched)
  current.push({ caseId, internalCandidateKey: null, score: 0, centerDistanceMm: 0 });
  enumerateSolutions(caseOptions, index + 1, used, current, acc, limit);
  current.pop();
}

/**
 * @returns {{assignments, unassignedCases, unassignedRegions, collisionsPrevented,
 *   totalScore, assignmentMethod, deterministicTieBreak, evaluationsByCase,
 *   ambiguousCaseIds, tolerancesUsed, alternativeSolutionCount}}
 */
export function matchCasesToRegions({ seedCases = [], measuredCandidates = [], options }) {
  const sortedCases = [...seedCases].sort((a, b) => String(a.caseId).localeCompare(String(b.caseId)));
  const sortedCandidates = [...measuredCandidates].sort((a, b) => a.internalCandidateKey.localeCompare(b.internalCandidateKey));

  const evaluationsByCase = new Map();
  const caseOptions = sortedCases.map(seedCase => {
    const { target, evaluations, reason } = evaluateCandidatesForCase({ seedCase, candidates: sortedCandidates, options });
    evaluationsByCase.set(seedCase.caseId, { target, evaluations, reason });
    const accepted = evaluations.filter(e => e.eligibility === 'accepted').slice(0, options.candidatesPerCaseLimit);
    return { caseId: seedCase.caseId, options: accepted };
  });

  // collisions: candidates accepted by more than one case
  const acceptedByCase = new Map();
  for (const { caseId, options: opts } of caseOptions) acceptedByCase.set(caseId, new Set(opts.map(o => o.internalCandidateKey)));
  const collisionsPrevented = [];
  for (const candidate of sortedCandidates) {
    const claimants = [...acceptedByCase.entries()].filter(([, set]) => set.has(candidate.internalCandidateKey)).map(([caseId]) => caseId);
    if (claimants.length > 1) collisionsPrevented.push({ internalCandidateKey: candidate.internalCandidateKey, declaredRegionId: candidate.declaredRegionId, competingCaseIds: claimants, reason: 'Several cases accept the same region; the one-to-one assignment gives it to at most one case.' });
  }

  const acc = { solutions: [] };
  enumerateSolutions(caseOptions, 0, new Set(), [], acc, 20000);

  const ranked = acc.solutions.sort((a, b) =>
    b.matchCount - a.matchCount
    || b.totalScore - a.totalScore
    || a.totalCenterDistance - b.totalCenterDistance
    || a.signature.localeCompare(b.signature));
  const best = ranked[0] || { assignments: [], matchCount: 0, totalScore: 0, totalCenterDistance: 0, signature: '' };

  // Ambiguity: equally good alternative global solutions that differ per case.
  const equallyGood = ranked.filter(s => s.matchCount === best.matchCount && Math.abs(s.totalScore - best.totalScore) < options.ambiguityScoreMargin);
  const perCaseKeys = new Map();
  for (const solution of equallyGood) {
    for (const a of solution.assignments) {
      const set = perCaseKeys.get(a.caseId) || new Set();
      set.add(a.internalCandidateKey ?? '∅');
      perCaseKeys.set(a.caseId, set);
    }
  }
  const ambiguousCaseIds = [...perCaseKeys.entries()].filter(([, set]) => set.size > 1).map(([caseId]) => caseId).sort();

  const assignments = best.assignments
    .filter(a => a.internalCandidateKey != null && !ambiguousCaseIds.includes(a.caseId))
    .map(a => ({ ...a }))
    .sort((x, y) => String(x.caseId).localeCompare(String(y.caseId)));
  const assignedKeys = new Set(assignments.map(a => a.internalCandidateKey));

  return {
    assignments,
    unassignedCases: sortedCases.map(c => c.caseId).filter(id => !assignments.some(a => a.caseId === id)),
    unassignedRegions: sortedCandidates.filter(c => !assignedKeys.has(c.internalCandidateKey)).map(c => c.internalCandidateKey),
    collisionsPrevented,
    totalScore: ROUND(assignments.reduce((s, a) => s + a.score, 0)),
    assignmentMethod: acc.solutions.length >= 20000 ? 'exhaustive_bipartite_truncated' : options.assignmentMethod,
    deterministicTieBreak: 'matchCount desc → totalScore desc → totalCenterDistance asc → signature (caseId + internalCandidateKey) asc',
    evaluationsByCase,
    ambiguousCaseIds,
    alternativeSolutionCount: equallyGood.length,
    tolerancesUsed: tolerancesUsed(options),
  };
}