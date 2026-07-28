/**
 * evaluateAWidthsResult.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A.1)
 *
 * Pure, deterministic evaluator over an ALREADY GENERATED engine result.
 * It never runs the engine, never applies rules and never writes expectedResult.
 */

import {
  EVALUATOR_VERSION, DEFAULT_OPTIONS, MEASUREMENT_METHOD, FORBIDDEN_OPTIONS,
} from './evaluatorSchema.js';
import { resolveCoordinateSystem, createPointConverter } from './coordinateNormalizer.js';
import { selectRegionSource } from './regionSourceSelector.js';
import { buildMeasuredCandidates } from './regionIdentity.js';
import { buildPlanIndex, resolvePlanEntry } from './planIndex.js';
import { matchCasesToRegions } from './globalAssignment.js';
import { detectPossibleMergedRegions } from './mergeDetection.js';
import { extractAWidthsActual, emptyActual } from './extractAWidthsActual.js';
import { buildReference, compareAWidthsReference } from './compareAWidthsReference.js';
import { tolerancesUsed } from './regionMatcher.js';

const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
const WEAK_CODES = ['OUTSIDE_ACCEPTED_CENTER_DISTANCE', 'SCORE_BELOW_MINIMUM', 'HEIGHT_DIFFERENCE_EXCEEDED', 'ASPECT_DIFFERENCE_EXCEEDED'];

const COVERAGE_KEYS = [
  'widthMm', 'heightMm', 'technique', 'densityMm', 'pullCompensationMm', 'stitchAngleDeg',
  'underlayEnabled', 'underlayType', 'underlayDensityMm', 'spacingMode', 'spacingMm', 'autoSplit',
];

function fieldByName(actual, name) {
  switch (name) {
    case 'widthMm': return actual.widthMm;
    case 'heightMm': return actual.heightMm;
    case 'technique': return actual.technique;
    case 'densityMm': return actual.densityMm;
    case 'planDensityMm': return actual.planDensityMm;
    case 'pullCompensationMm': return actual.pullCompensationMm;
    case 'stitchAngleDeg': return actual.stitchAngleDeg;
    case 'underlayEnabled': return actual.underlay.underlayEnabled;
    case 'underlayType': return actual.underlay.primaryUnderlay;
    case 'underlayDensityMm': return actual.underlay.underlayDensityMm;
    case 'spacingMode': return actual.spacing.spacingMode;
    case 'spacingMm': return actual.spacing.spacingMm;
    case 'autoSplit': return actual.autoSplit;
    default: return null;
  }
}

function baseReport(opts, errors, warnings, extra = {}) {
  return {
    evaluatorVersion: EVALUATOR_VERSION,
    generatedAt: opts.generatedAt ?? null,
    status: 'invalid_input',
    errors,
    inputSummary: {
      selectedRegionSource: null, regionSourceField: null, availableRegionSources: [],
      countsByRegionSource: {}, regionCount: 0, planEntryCount: 0, seedCaseCount: 0,
      measurableRegionCount: 0, measurementMethod: MEASUREMENT_METHOD, optionsUsed: opts,
    },
    coordinateSystem: null,
    identitySummary: null,
    planIntegrity: null,
    assignment: null,
    assignmentSearch: null,
    candidateCountsByCase: {},
    mergeDiagnostics: [],
    fieldCoverage: {},
    matchCoverage: { matched: 0, ambiguous: 0, unmatched: 0, unavailable: 0 },
    cases: [],
    unknownFields: [],
    unavailableFields: [],
    conflictFields: [],
    warnings,
    matchConclusion: 'unavailable',
    dataConclusion: 'unavailable',
    conclusion: 'invalid_input',
    ...extra,
  };
}

export function evaluateAWidthsResult({ result = null, seedCases = null, design = null, options = null } = {}) {
  const provided = isObject(options) ? options : {};
  const opts = { ...DEFAULT_OPTIONS, ...provided };
  const errors = [];
  const warnings = [];

  // Forbidden options
  for (const [key, code] of Object.entries(FORBIDDEN_OPTIONS)) {
    if (key in provided) {
      if (provided[key]) errors.push({ code, message: `Option "${key}" was removed in ${EVALUATOR_VERSION}: the equivalence between region.density and the Hatch spacing column is not verified.` });
      else warnings.push(`Option "${key}" no longer exists and is ignored.`);
    }
  }

  if (!isObject(result)) errors.push({ code: 'INVALID_RESULT_STRUCTURE', message: '`result` must be an object with an already generated engine result.' });
  if (!Array.isArray(seedCases) || seedCases.length === 0) {
    errors.push({ code: 'INVALID_SEED_CASES', message: '`seedCases` must be a non-empty array of A_WIDTHS seed cases.' });
  } else {
    const invalid = seedCases.filter(c => !isObject(c) || typeof c.caseId !== 'string' || c.caseId.length === 0);
    if (invalid.length) errors.push({ code: 'INVALID_SEED_CASES', message: `${invalid.length} seed case(s) without a valid caseId; evaluation does not continue.` });
    const counts = new Map();
    for (const c of seedCases) if (isObject(c) && typeof c.caseId === 'string') counts.set(c.caseId, (counts.get(c.caseId) || 0) + 1);
    const duplicated = [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id).sort();
    if (duplicated.length) errors.push({ code: 'DUPLICATED_SEED_CASE_ID', message: `Duplicated caseId(s): ${duplicated.join(', ')}. No case is ignored and the evaluation stops.` });
  }
  if (errors.length) return baseReport(opts, errors, warnings);

  // Region source — explicit selection
  const sourceSelection = selectRegionSource({ result, options: opts });
  const inputSummaryBase = {
    selectedRegionSource: sourceSelection.selectedRegionSource,
    regionSourceField: sourceSelection.sourceField,
    availableRegionSources: sourceSelection.availableRegionSources,
    countsByRegionSource: sourceSelection.countsByRegionSource,
    regionSourceReason: sourceSelection.reason,
    measurementMethod: MEASUREMENT_METHOD,
    optionsUsed: opts,
  };
  if (sourceSelection.status === 'ambiguous' || (sourceSelection.status === 'unavailable' && sourceSelection.error)) {
    const report = baseReport(opts, [{ code: sourceSelection.error, message: sourceSelection.reason }], warnings);
    return { ...report, inputSummary: { ...report.inputSummary, ...inputSummaryBase, seedCaseCount: seedCases.length } };
  }

  const coordinateSystem = resolveCoordinateSystem({ design, result, options: opts });
  const convertPoint = createPointConverter(coordinateSystem);
  if (!convertPoint) warnings.push(`Coordinate space unavailable: ${coordinateSystem.reason} No geometric measurement is performed.`);

  const { candidates, identitySummary, skipped } = buildMeasuredCandidates({
    regions: sourceSelection.regions, sourceKey: sourceSelection.selectedRegionSource || 'regions', convertPoint,
  });
  skipped.filter(s => s.reason === 'not an object').forEach(s => warnings.push(`Element ${s.sourceIndex} of ${sourceSelection.sourceField} is not an object; ignored.`));
  if (identitySummary.duplicatedRegionIds.length) warnings.push(`Duplicated region ids in the selected collection: ${identitySummary.duplicatedRegionIds.join(', ')}. Affected candidates are not treated as a stable identity.`);
  if (identitySummary.missing_id) warnings.push(`${identitySummary.missing_id} region(s) without a declared id; each keeps its own internal candidate key and is not a stable identity.`);

  const { entriesByRegionId, planIntegrity, planEntryCount } = buildPlanIndex({ result, candidates });
  const assignment = convertPoint
    ? matchCasesToRegions({ seedCases, measuredCandidates: candidates, options: opts })
    : null;
  const mergeDiagnostics = convertPoint ? detectPossibleMergedRegions({ seedCases, measuredCandidates: candidates, options: opts }) : [];

  const byKey = new Map(candidates.map(c => [c.internalCandidateKey, c]));
  const assignedByCase = new Map((assignment?.assignments || []).map(a => [a.caseId, a]));

  const unknownFields = new Set();
  const unavailableFields = new Set();
  const conflictFields = new Set();
  const coverage = {};
  for (const key of COVERAGE_KEYS) coverage[key] = { available: 0, unavailable: 0, unknown: 0, conflict: 0 };
  coverage.sourceConflicts = { total: 0, byField: {} };
  coverage.stableIdentity = { stable: 0, duplicated_id: 0, missing_id: 0, unavailable: 0 };

  const orderedCases = [...seedCases].sort((a, b) => a.caseId.localeCompare(b.caseId));

  const cases = orderedCases.map(seedCase => {
    const evaluationInfo = assignment?.evaluationsByCase.get(seedCase.caseId) || { evaluations: [], target: null, reason: '' };
    const assigned = assignedByCase.get(seedCase.caseId) || null;
    const reasons = [];
    let status;

    if (!convertPoint) { status = 'unavailable'; reasons.push('Coordinate space unavailable.'); }
    else if (assigned) { status = 'matched'; reasons.push(`Accepted candidate ${assigned.internalCandidateKey} with score ${assigned.score.toFixed(4)} and centre distance ${assigned.centerDistanceMm.toFixed(4)} mm.`); }
    else if (assignment.ambiguousCaseIds.includes(seedCase.caseId)) {
      status = 'ambiguous';
      reasons.push(`Several equally good global assignments exist for this case (${assignment.alternativeSolutionCount} solutions within ambiguityScoreMargin = ${opts.ambiguityScoreMargin}); no candidate is chosen arbitrarily.`);
    } else {
      const rejected = evaluationInfo.evaluations.filter(e => e.eligibility === 'rejected');
      const identityOnly = rejected.filter(e => e.rejectedBy.length === 1 && e.rejectedBy[0] === 'UNSTABLE_IDENTITY');
      const roleOnly = rejected.filter(e => e.rejectedBy.length === 1 && e.rejectedBy[0] === 'REGION_ROLE_INCOMPATIBLE');
      const weak = rejected.filter(e => e.rejectedBy.length > 0 && e.rejectedBy.every(code => WEAK_CODES.includes(code)));
      if (identityOnly.length > 0) {
        status = 'ambiguous';
        reasons.push(`Candidate(s) with unstable identity (${identityOnly.map(e => `${e.internalCandidateKey} [${e.identityStatus}]`).join(', ')}); values are not attributed as if the identity were stable.`);
      } else if (roleOnly.length > 0 && weak.length === 0) {
        status = 'ambiguous';
        reasons.push(`Only contour / auxiliary objects are nearby (${roleOnly.map(e => e.internalCandidateKey).join(', ')}); a contour never replaces the main object and nothing is filtered silently.`);
      } else if (weak.length >= 2) {
        status = 'ambiguous';
        reasons.push(`${weak.length} weak candidates inside the search radius but outside the acceptance criteria; no candidate is chosen arbitrarily.`);
      } else {
        status = 'unmatched';
        reasons.push(evaluationInfo.evaluations.length === 0
          ? (evaluationInfo.reason || `No candidate lies within the search radius maximumCenterDistanceMm = ${opts.maximumCenterDistanceMm} mm.`)
          : 'No candidate satisfies the acceptance criteria.');
      }
    }

    const candidate = assigned ? byKey.get(assigned.internalCandidateKey) : null;
    const { planEntry, planStatus } = candidate ? resolvePlanEntry({ entriesByRegionId, candidate }) : { planEntry: null, planStatus: 'missing' };
    const actual = candidate
      ? extractAWidthsActual({ candidate, planEntry, planStatus, options: opts })
      : emptyActual(status === 'ambiguous' ? 'Ambiguous assignment: no values are attributed.' : 'No region assigned to this case.');

    const reference = buildReference(seedCase);
    const comparisons = compareAWidthsReference({ reference, actual, matchStatus: status, options: opts });

    actual.unknownFields.forEach(f => unknownFields.add(f));
    actual.unavailableFields.forEach(f => unavailableFields.add(f));
    actual.conflictFields.forEach(f => conflictFields.add(f));
    for (const key of COVERAGE_KEYS) {
      const field = fieldByName(actual, key);
      const availability = field ? field.availability : 'unavailable';
      coverage[key][availability] += 1;
      if (availability === 'conflict') {
        coverage.sourceConflicts.total += 1;
        coverage.sourceConflicts.byField[key] = (coverage.sourceConflicts.byField[key] || 0) + 1;
      }
    }
    coverage.stableIdentity[actual.identityStatus || 'unavailable'] += 1;

    const caseWarnings = [];
    if (reference.geometryClass !== 'barra_recta') caseWarnings.push('geometryClass is not barra_recta: bounding_box_width must not be used as the main width measurement.');
    if (planStatus === 'duplicated') caseWarnings.push('Several plan entries share this regionId; plan-sourced values are reported as unavailable.');
    if (planStatus === 'missing' && candidate) caseWarnings.push('The assigned region has no plan entry.');
    const requiredMissing = opts.requiredActualFields.filter(name => fieldByName(actual, name)?.availability !== 'available');
    if (candidate && requiredMissing.length) caseWarnings.push(`Required data points not available: ${requiredMissing.join(', ')}.`);

    return {
      caseId: seedCase.caseId,
      status,
      match: {
        status,
        internalCandidateKey: assigned?.internalCandidateKey ?? null,
        selectedRegionId: candidate?.declaredRegionId ?? null,
        sourceIndex: candidate?.sourceIndex ?? null,
        identityStatus: candidate?.identityStatus ?? null,
        score: assigned?.score ?? null,
        centerDistanceMm: assigned?.centerDistanceMm ?? null,
        widthDifferenceMm: assigned ? evaluationInfo.evaluations.find(e => e.internalCandidateKey === assigned.internalCandidateKey)?.widthDifferenceMm ?? null : null,
        heightDifferenceMm: assigned ? evaluationInfo.evaluations.find(e => e.internalCandidateKey === assigned.internalCandidateKey)?.heightDifferenceMm ?? null : null,
        candidates: evaluationInfo.evaluations,
        candidateRegionIds: evaluationInfo.evaluations.map(e => e.internalCandidateKey),
        target: evaluationInfo.target,
        reasons,
        tolerancesUsed: tolerancesUsed(opts),
        matchPolicy: opts.matchPolicy,
      },
      planStatus,
      reference,
      actual,
      comparisons,
      requiredMissing: candidate ? requiredMissing : opts.requiredActualFields.slice(),
      warnings: caseWarnings,
    };
  });

  const matchCoverage = { matched: 0, ambiguous: 0, unmatched: 0, unavailable: 0 };
  for (const c of cases) matchCoverage[c.status] += 1;

  const assignedCases = cases.filter(c => c.status === 'matched');
  const requiredConflicts = assignedCases.filter(c => opts.requiredActualFields.some(name => fieldByName(c.actual, name)?.availability === 'conflict'));
  const requiredComplete = assignedCases.length > 0 && assignedCases.every(c => c.requiredMissing.length === 0);
  const identitiesStable = assignedCases.every(c => c.actual.identityStatus === 'stable');

  const matchConclusion = coordinateSystem.status !== 'resolved' ? 'unavailable'
    : matchCoverage.matched === cases.length ? 'all_assigned'
      : matchCoverage.matched > 0 ? 'partial_assignment'
        : matchCoverage.ambiguous > 0 ? 'ambiguous_assignment'
          : 'no_assignment';

  const dataConclusion = coordinateSystem.status !== 'resolved' || assignedCases.length === 0 ? 'unavailable'
    : requiredConflicts.length > 0 ? 'conflicted'
      : requiredComplete ? 'complete' : 'incomplete';

  const assignmentSearch = assignment?.assignmentSearch ?? null;
  const searchProven = !!assignmentSearch
    && assignmentSearch.searchComplete === true
    && assignmentSearch.optimalityProven === true
    && assignmentSearch.stoppedEarly === false
    && assignmentSearch.candidateLimitApplied === false
    && assignmentSearch.solutionLimitApplied === false;

  if (assignmentSearch && !searchProven) {
    const excludedTotal = assignmentSearch.candidatesExcludedTotal ?? 0;
    errors.push({
      code: 'ASSIGNMENT_SEARCH_INCOMPLETE',
      message: `${assignmentSearch.stopReason || 'The assignment search could not be completed.'} Estimated search space ${assignmentSearch.estimatedSearchSpace}; branches explored ${assignmentSearch.branchesExplored}; solutions explored ${assignmentSearch.solutionsExplored}; accepted candidates excluded ${excludedTotal}. Optimality is not proven, the found assignment is not used to compare against Hatch, and the run must be repeated with higher candidatesPerCaseLimit / maximumBranches.`,
      candidateCountsByCase: assignment.candidateCountsByCase,
    });
  }

  let conclusion;
  if (coordinateSystem.status !== 'resolved') conclusion = 'inconclusive';
  else if (assignmentSearch && !searchProven) conclusion = 'inconclusive';
  else if (dataConclusion === 'conflicted' && opts.conflictInRequiredFieldPolicy === 'ambiguous') conclusion = 'ambiguous';
  else if (matchCoverage.matched === 0) conclusion = matchCoverage.ambiguous > 0 ? 'ambiguous' : 'no_matches';
  else if (matchConclusion === 'all_assigned' && identitiesStable && dataConclusion === 'complete') conclusion = 'evaluated';
  else conclusion = 'partial';

  return {
    evaluatorVersion: EVALUATOR_VERSION,
    generatedAt: opts.generatedAt ?? null,
    status: conclusion,
    errors,
    inputSummary: {
      ...inputSummaryBase,
      regionCount: sourceSelection.regions.length,
      planEntryCount,
      seedCaseCount: cases.length,
      measurableRegionCount: candidates.length,
    },
    coordinateSystem,
    identitySummary,
    planIntegrity,
    assignment: assignment
      ? {
        assignments: assignment.assignments,
        unassignedCases: assignment.unassignedCases,
        unassignedRegions: assignment.unassignedRegions,
        collisionsPrevented: assignment.collisionsPrevented,
        totalScore: assignment.totalScore,
        assignmentMethod: assignment.assignmentMethod,
        deterministicTieBreak: assignment.deterministicTieBreak,
        assignmentSearch: assignment.assignmentSearch,
        candidateCountsByCase: assignment.candidateCountsByCase,
        ambiguousCaseIds: assignment.ambiguousCaseIds,
        alternativeSolutionCount: assignment.alternativeSolutionCount,
        tolerancesUsed: assignment.tolerancesUsed,
      }
      : null,
    assignmentSearch,
    candidateCountsByCase: assignment?.candidateCountsByCase ?? {},
    optimalityProven: assignmentSearch ? assignmentSearch.optimalityProven : null,
    mergeDiagnostics,
    fieldCoverage: coverage,
    matchCoverage,
    cases,
    unknownFields: [...unknownFields].sort(),
    unavailableFields: [...unavailableFields].sort(),
    conflictFields: [...conflictFields].sort(),
    warnings,
    matchConclusion,
    dataConclusion,
    conclusion,
  };
}