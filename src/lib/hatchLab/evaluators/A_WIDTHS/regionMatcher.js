/**
 * regionMatcher.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A)
 * Traceable spatial matching. Array position, creation order, colour and region
 * index are never used as criteria.
 */

import { CONTOUR_MARKERS } from './verifiedFieldMap.js';

export function isContourLike(region) {
  if (!region || typeof region !== 'object') return false;
  if (typeof region.type === 'string' && CONTOUR_MARKERS.typeValues.includes(region.type)) return true;
  if (typeof region.region_class === 'string' && CONTOUR_MARKERS.regionClassValues.includes(region.region_class)) return true;
  if (region[CONTOUR_MARKERS.parentField] != null) return true;
  return false;
}

function seedTargets(seedCase) {
  const measured = seedCase?.observation?.measured || {};
  const input = seedCase?.input || {};
  const tested = seedCase?.testedSizeMm || {};
  const width = Number.isFinite(measured.nominalWidthMm) ? measured.nominalWidthMm
    : Number.isFinite(tested.width) ? tested.width : null;
  const height = Number.isFinite(measured.nominalHeightMm) ? measured.nominalHeightMm
    : Number.isFinite(tested.height) ? tested.height : null;
  return {
    centerXMm: Number.isFinite(input.centerXMm) ? input.centerXMm : null,
    centerYMm: Number.isFinite(input.centerYMm) ? input.centerYMm : null,
    nominalWidthMm: width,
    nominalHeightMm: height,
    geometryClass: seedCase?.ruleScope?.geometryClass ?? input.geometry ?? null,
  };
}

function scoreCandidate(target, metrics, tol) {
  const centerDistanceMm = Math.hypot(metrics.centerXMm - target.centerXMm, metrics.centerYMm - target.centerYMm);
  const widthDifferenceMm = target.nominalWidthMm == null ? null : metrics.boundingWidthMm - target.nominalWidthMm;
  const heightDifferenceMm = target.nominalHeightMm == null ? null : metrics.boundingHeightMm - target.nominalHeightMm;

  const centerPenalty = Math.min(1, centerDistanceMm / tol.maximumCenterDistanceMm);
  const widthPenalty = widthDifferenceMm == null ? 0 : Math.min(1, Math.abs(widthDifferenceMm) / Math.max(tol.widthToleranceMm, 1e-9));
  const heightPenalty = heightDifferenceMm == null ? 0 : Math.min(1, Math.abs(heightDifferenceMm) / Math.max(tol.heightToleranceMm, 1e-9));

  const targetAspect = target.nominalWidthMm != null && target.nominalHeightMm > 0
    ? target.nominalWidthMm / target.nominalHeightMm : null;
  const aspectPenalty = targetAspect == null || metrics.aspectRatio == null
    ? 0
    : Math.min(1, Math.abs(metrics.aspectRatio - targetAspect) / Math.max(tol.aspectToleranceRatio, 1e-9));

  const score = 1 - (centerPenalty * 0.5 + widthPenalty * 0.2 + heightPenalty * 0.2 + aspectPenalty * 0.1);
  return { score, centerDistanceMm, widthDifferenceMm, heightDifferenceMm, aspectRatio: metrics.aspectRatio };
}

/**
 * @param {object} seedCase
 * @param {Array<{region:object, metrics:object, index:number}>} measured
 * @param {object} options — resolved tolerances
 * @returns match descriptor (never mutates its inputs)
 */
export function matchCaseToRegion(seedCase, measured, options) {
  const tol = {
    centerToleranceMm: options.centerToleranceMm,
    maximumCenterDistanceMm: options.maximumCenterDistanceMm,
    widthToleranceMm: options.widthToleranceMm,
    heightToleranceMm: options.heightToleranceMm,
    aspectToleranceRatio: options.aspectToleranceRatio,
    ambiguityScoreMargin: options.ambiguityScoreMargin,
  };
  const target = seedTargets(seedCase);
  const base = {
    status: 'unavailable', selectedRegionId: null, candidateRegionIds: [], score: null,
    centerDistanceMm: null, widthDifferenceMm: null, heightDifferenceMm: null,
    reasons: [], tolerancesUsed: tol, matchPolicy: options.matchPolicy, target,
  };

  if (target.centerXMm == null || target.centerYMm == null) {
    return { ...base, reasons: ['The case declares no input.centerXMm / input.centerYMm; spatial matching is impossible.'] };
  }
  if (!Array.isArray(measured) || measured.length === 0) {
    return { ...base, status: 'unmatched', reasons: ['No measurable regions available in the result.'] };
  }

  const scored = measured.map(m => ({
    regionId: m.region?.id ?? null,
    index: m.index,
    contourLike: isContourLike(m.region),
    metrics: m.metrics,
    ...scoreCandidate(target, m.metrics, tol),
  })).filter(c => c.centerDistanceMm <= tol.maximumCenterDistanceMm);

  if (scored.length === 0) {
    return { ...base, status: 'unmatched', reasons: [`No region lies within maximumCenterDistanceMm = ${tol.maximumCenterDistanceMm} mm of the case centre.`] };
  }

  const primary = scored.filter(c => !c.contourLike);
  const reasons = [];
  const pool = primary;
  if (primary.length === 0) {
    // §10 — never silently accept a contour as the main object.
    const sortedContours = [...scored].sort((a, b) => b.score - a.score || String(a.regionId).localeCompare(String(b.regionId)));
    return {
      ...base,
      status: 'ambiguous',
      candidateRegionIds: sortedContours.map(c => c.regionId),
      score: sortedContours[0].score,
      centerDistanceMm: sortedContours[0].centerDistanceMm,
      widthDifferenceMm: sortedContours[0].widthDifferenceMm,
      heightDifferenceMm: sortedContours[0].heightDifferenceMm,
      reasons: ['Only contour / auxiliary objects are nearby (type "contour", region_class outline or parentRegionId present); a contour never replaces the main object.'],
    };
  }
  if (primary.length < scored.length) {
    reasons.push(`${scored.length - primary.length} nearby contour/auxiliary object(s) were kept as context but excluded as the main object.`);
  }

  const sorted = [...pool].sort((a, b) => b.score - a.score || String(a.regionId).localeCompare(String(b.regionId)));
  const best = sorted[0];
  const second = sorted[1] || null;
  const candidateRegionIds = sorted.map(c => c.regionId);

  if (second && Math.abs(best.score - second.score) < tol.ambiguityScoreMargin) {
    return {
      ...base, status: 'ambiguous', candidateRegionIds, score: best.score,
      centerDistanceMm: best.centerDistanceMm, widthDifferenceMm: best.widthDifferenceMm,
      heightDifferenceMm: best.heightDifferenceMm,
      reasons: [...reasons, `Two candidates score within ambiguityScoreMargin = ${tol.ambiguityScoreMargin}; the first is not chosen arbitrarily.`],
    };
  }

  const withinTolerance = best.centerDistanceMm <= tol.centerToleranceMm;
  reasons.push(withinTolerance
    ? `Centre within centreToleranceMm = ${tol.centerToleranceMm} mm (distance ${best.centerDistanceMm.toFixed(4)} mm).`
    : `Centre outside centreToleranceMm but inside maximumCenterDistanceMm (distance ${best.centerDistanceMm.toFixed(4)} mm).`);

  return {
    ...base, status: 'matched', selectedRegionId: best.regionId, candidateRegionIds,
    score: best.score, centerDistanceMm: best.centerDistanceMm,
    widthDifferenceMm: best.widthDifferenceMm, heightDifferenceMm: best.heightDifferenceMm,
    reasons,
  };
}