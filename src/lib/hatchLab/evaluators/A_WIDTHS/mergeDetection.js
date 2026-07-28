/**
 * mergeDetection.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A.1)
 * Diagnostic observation only: a possible merged region is never a pass/fail
 * and is never declared as a fact.
 */

import { seedTargets } from './regionMatcher.js';

/**
 * @returns {Array<{internalCandidateKey, declaredRegionId, possibleMergedRegion,
 *   coveredCaseIds, centersInside, boundingWidthMm, widthFactor, reason}>}
 */
export function detectPossibleMergedRegions({ seedCases = [], measuredCandidates = [], options }) {
  const targets = seedCases.map(seedTargets).filter(t => t.centerXMm != null && t.centerYMm != null);

  return [...measuredCandidates]
    .sort((a, b) => a.internalCandidateKey.localeCompare(b.internalCandidateKey))
    .map(candidate => {
      const m = candidate.metrics;
      const inside = targets.filter(t => t.centerXMm >= m.minimumX && t.centerXMm <= m.maximumX && t.centerYMm >= m.minimumY && t.centerYMm <= m.maximumY);
      const coveredCaseIds = inside.map(t => t.caseId).sort();
      const nominalWidths = inside.map(t => t.nominalWidthMm).filter(w => Number.isFinite(w));
      const referenceWidth = nominalWidths.length ? Math.max(...nominalWidths) : null;
      const widthFactor = referenceWidth ? m.boundingWidthMm / referenceWidth : null;
      const abnormallyWide = widthFactor != null && widthFactor > options.mergeWidthFactor;
      const possibleMergedRegion = coveredCaseIds.length >= 2 || abnormallyWide;

      const reasons = [];
      if (coveredCaseIds.length >= 2) reasons.push(`The bounding box contains the declared centres of ${coveredCaseIds.length} cases (${coveredCaseIds.join(', ')}).`);
      if (abnormallyWide) reasons.push(`Bounding width ${m.boundingWidthMm.toFixed(4)} mm is ${widthFactor.toFixed(2)}× the nominal width of the covered case(s), above mergeWidthFactor = ${options.mergeWidthFactor}.`);
      if (!possibleMergedRegion) reasons.push('No merge indicator found.');

      return {
        internalCandidateKey: candidate.internalCandidateKey,
        declaredRegionId: candidate.declaredRegionId,
        possibleMergedRegion,
        coveredCaseIds,
        centersInside: coveredCaseIds.length,
        boundingWidthMm: m.boundingWidthMm,
        widthFactor,
        reason: `${reasons.join(' ')} Diagnostic observation only; no merge is asserted and no pass/fail is emitted.`,
      };
    });
}