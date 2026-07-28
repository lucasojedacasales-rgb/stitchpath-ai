/**
 * regionMatcher.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A.1)
 * Candidate scoring and ACCEPTANCE criteria, separated from the search radius.
 * Array position, creation order, colour and region index are never criteria.
 */

export { isContourLike } from './regionRole.js';

export function seedTargets(seedCase) {
  const measured = seedCase?.observation?.measured || {};
  const input = seedCase?.input || {};
  const tested = seedCase?.testedSizeMm || {};
  const width = Number.isFinite(measured.nominalWidthMm) ? measured.nominalWidthMm
    : Number.isFinite(tested.width) ? tested.width : null;
  const height = Number.isFinite(measured.nominalHeightMm) ? measured.nominalHeightMm
    : Number.isFinite(tested.height) ? tested.height : null;
  return {
    caseId: seedCase?.caseId ?? null,
    centerXMm: Number.isFinite(input.centerXMm) ? input.centerXMm : null,
    centerYMm: Number.isFinite(input.centerYMm) ? input.centerYMm : null,
    nominalWidthMm: width,
    nominalHeightMm: height,
    geometryClass: seedCase?.ruleScope?.geometryClass ?? input.geometry ?? null,
  };
}

export function tolerancesUsed(options) {
  return {
    searchRadius: { maximumCenterDistanceMm: options.maximumCenterDistanceMm },
    acceptance: {
      acceptedCenterDistanceMm: options.acceptedCenterDistanceMm,
      minimumAcceptedScore: options.minimumAcceptedScore,
      maximumAcceptedHeightDifferenceMm: options.maximumAcceptedHeightDifferenceMm,
      maximumAcceptedAspectDifference: options.maximumAcceptedAspectDifference,
      requireStableIdentity: options.requireStableIdentity,
      requireCompatibleRegionRole: options.requireCompatibleRegionRole,
    },
    scoring: {
      widthToleranceMm: options.widthToleranceMm,
      heightToleranceMm: options.heightToleranceMm,
      aspectToleranceRatio: options.aspectToleranceRatio,
      weights: { center: 0.5, width: 0.2, height: 0.2, aspect: 0.1 },
    },
    ambiguityScoreMargin: options.ambiguityScoreMargin,
  };
}

/**
 * Evaluates one (case, candidate) pair. Width participates in the score but is
 * never an acceptance filter: the engine width is exactly what we want to measure.
 */
export function evaluateCandidateForCase({ target, candidate, options }) {
  const m = candidate.metrics;
  const centerDistanceMm = Math.hypot(m.centerXMm - target.centerXMm, m.centerYMm - target.centerYMm);
  const widthDifferenceMm = target.nominalWidthMm == null ? null : m.boundingWidthMm - target.nominalWidthMm;
  const heightDifferenceMm = target.nominalHeightMm == null ? null : m.boundingHeightMm - target.nominalHeightMm;
  const targetAspect = target.nominalWidthMm != null && target.nominalHeightMm > 0 ? target.nominalWidthMm / target.nominalHeightMm : null;
  const aspectDifference = targetAspect == null || m.aspectRatio == null ? null : Math.abs(m.aspectRatio - targetAspect);

  const scoreComponents = {
    centerPenalty: Math.min(1, centerDistanceMm / options.maximumCenterDistanceMm) * 0.5,
    widthPenalty: (widthDifferenceMm == null ? 0 : Math.min(1, Math.abs(widthDifferenceMm) / Math.max(options.widthToleranceMm, 1e-9))) * 0.2,
    heightPenalty: (heightDifferenceMm == null ? 0 : Math.min(1, Math.abs(heightDifferenceMm) / Math.max(options.heightToleranceMm, 1e-9))) * 0.2,
    aspectPenalty: (aspectDifference == null ? 0 : Math.min(1, aspectDifference / Math.max(options.aspectToleranceRatio, 1e-9))) * 0.1,
  };
  const score = 1 - (scoreComponents.centerPenalty + scoreComponents.widthPenalty + scoreComponents.heightPenalty + scoreComponents.aspectPenalty);

  const acceptedBy = [];
  const rejectedBy = [];
  const rejectionReasons = [];

  const withinSearchRadius = centerDistanceMm <= options.maximumCenterDistanceMm;
  if (!withinSearchRadius) {
    rejectedBy.push('OUTSIDE_SEARCH_RADIUS');
    rejectionReasons.push(`Centre distance ${centerDistanceMm.toFixed(4)} mm exceeds the search radius maximumCenterDistanceMm = ${options.maximumCenterDistanceMm} mm.`);
  }
  if (centerDistanceMm <= options.acceptedCenterDistanceMm) acceptedBy.push('acceptedCenterDistanceMm');
  else {
    rejectedBy.push('OUTSIDE_ACCEPTED_CENTER_DISTANCE');
    rejectionReasons.push(`Centre distance ${centerDistanceMm.toFixed(4)} mm exceeds acceptedCenterDistanceMm = ${options.acceptedCenterDistanceMm} mm; being inside the search radius is not enough.`);
  }
  if (score >= options.minimumAcceptedScore) acceptedBy.push('minimumAcceptedScore');
  else {
    rejectedBy.push('SCORE_BELOW_MINIMUM');
    rejectionReasons.push(`Score ${score.toFixed(4)} is below minimumAcceptedScore = ${options.minimumAcceptedScore}.`);
  }
  if (heightDifferenceMm == null || Math.abs(heightDifferenceMm) <= options.maximumAcceptedHeightDifferenceMm) acceptedBy.push('maximumAcceptedHeightDifferenceMm');
  else {
    rejectedBy.push('HEIGHT_DIFFERENCE_EXCEEDED');
    rejectionReasons.push(`Height difference ${Math.abs(heightDifferenceMm).toFixed(4)} mm exceeds maximumAcceptedHeightDifferenceMm = ${options.maximumAcceptedHeightDifferenceMm} mm.`);
  }
  if (options.maximumAcceptedAspectDifference != null) {
    if (aspectDifference != null && aspectDifference > options.maximumAcceptedAspectDifference) {
      rejectedBy.push('ASPECT_DIFFERENCE_EXCEEDED');
      rejectionReasons.push(`Aspect difference ${aspectDifference.toFixed(4)} exceeds maximumAcceptedAspectDifference = ${options.maximumAcceptedAspectDifference}.`);
    } else acceptedBy.push('maximumAcceptedAspectDifference');
  }
  if (options.requireCompatibleRegionRole) {
    if (candidate.contourLike) {
      rejectedBy.push('REGION_ROLE_INCOMPATIBLE');
      rejectionReasons.push('Contour / auxiliary object (type "contour", outline region_class or parentRegionId present); a contour never represents the main object.');
    } else acceptedBy.push('requireCompatibleRegionRole');
  }
  if (options.requireStableIdentity) {
    if (candidate.identityStatus !== 'stable') {
      rejectedBy.push('UNSTABLE_IDENTITY');
      rejectionReasons.push(`Identity is not stable (${candidate.identityStatus}); values are not attributed as if the identity were stable.`);
    } else acceptedBy.push('requireStableIdentity');
  }

  return {
    caseId: target.caseId,
    internalCandidateKey: candidate.internalCandidateKey,
    sourceIndex: candidate.sourceIndex,
    declaredRegionId: candidate.declaredRegionId,
    identityStatus: candidate.identityStatus,
    contourLike: candidate.contourLike,
    withinSearchRadius,
    centerDistanceMm,
    widthDifferenceMm,
    heightDifferenceMm,
    aspectDifference,
    score,
    scoreComponents,
    eligibility: rejectedBy.length === 0 ? 'accepted' : 'rejected',
    acceptedBy,
    rejectedBy,
    rejectionReasons,
  };
}

/** All candidate evaluations for one case, deterministically ordered. */
export function evaluateCandidatesForCase({ seedCase, candidates, options }) {
  const target = seedTargets(seedCase);
  if (target.centerXMm == null || target.centerYMm == null) {
    return { target, evaluations: [], reason: 'The case declares no input.centerXMm / input.centerYMm; spatial matching is impossible.' };
  }
  const evaluations = candidates
    .map(candidate => evaluateCandidateForCase({ target, candidate, options }))
    .filter(e => e.withinSearchRadius)
    .sort((a, b) => b.score - a.score || a.internalCandidateKey.localeCompare(b.internalCandidateKey));
  return { target, evaluations, reason: '' };
}