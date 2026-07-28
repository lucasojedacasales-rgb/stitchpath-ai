/**
 * regionIdentity.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A.1)
 * Builds unambiguous internal identities for measured regions.
 * A duplicated id is not a stable identity; a missing id never becomes a shared null.
 */

import { measureRegion } from './geometryMeasurement.js';
import { isContourLike } from './regionRole.js';

const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * @returns {{candidates:Array, identitySummary:object, skipped:Array}}
 * Each candidate: { sourceIndex, declaredRegionId, internalCandidateKey,
 *   identityStatus, contourLike, region, metrics }
 */
export function buildMeasuredCandidates({ regions = [], sourceKey = 'regions', convertPoint = null } = {}) {
  const counts = new Map();
  regions.forEach(r => {
    const id = isObject(r) && r.id !== undefined && r.id !== null ? String(r.id) : null;
    if (id != null) counts.set(id, (counts.get(id) || 0) + 1);
  });

  const candidates = [];
  const skipped = [];
  const identitySummary = { stable: 0, duplicated_id: 0, missing_id: 0, duplicatedRegionIds: [], notMeasurable: 0, notAnObject: 0 };

  regions.forEach((region, sourceIndex) => {
    if (!isObject(region)) {
      identitySummary.notAnObject += 1;
      skipped.push({ sourceIndex, reason: 'not an object' });
      return;
    }
    const declaredRegionId = region.id !== undefined && region.id !== null ? String(region.id) : null;
    const identityStatus = declaredRegionId == null ? 'missing_id'
      : counts.get(declaredRegionId) > 1 ? 'duplicated_id' : 'stable';
    identitySummary[identityStatus] += 1;
    if (identityStatus === 'duplicated_id' && !identitySummary.duplicatedRegionIds.includes(declaredRegionId)) {
      identitySummary.duplicatedRegionIds.push(declaredRegionId);
    }

    const metrics = convertPoint ? measureRegion(region, convertPoint) : null;
    if (!metrics) {
      identitySummary.notMeasurable += 1;
      skipped.push({ sourceIndex, declaredRegionId, reason: 'no measurable geometry' });
      return;
    }

    candidates.push({
      sourceIndex,
      declaredRegionId,
      /** Always unique: sourceIndex is unique inside the selected collection. */
      internalCandidateKey: `${sourceKey}#${sourceIndex}:${declaredRegionId ?? 'no_id'}`,
      identityStatus,
      contourLike: isContourLike(region),
      region,
      metrics,
    });
  });

  identitySummary.duplicatedRegionIds.sort();
  return { candidates, identitySummary, skipped };
}