/**
 * planIndex.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A.1)
 * Plan index that never overwrites entries silently and reports its integrity.
 */

const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * @returns {{ entriesByRegionId:Map<string,Array>, planIntegrity:object, planEntryCount:number }}
 */
export function buildPlanIndex({ result = null, candidates = [] } = {}) {
  const sequence = Array.isArray(result?.plan?.sequence) ? result.plan.sequence : [];
  const entriesByRegionId = new Map();
  const missingRegionIds = [];

  sequence.forEach((entry, index) => {
    if (!isObject(entry)) { missingRegionIds.push({ index, reason: 'plan entry is not an object' }); return; }
    if (entry.regionId === undefined || entry.regionId === null) { missingRegionIds.push({ index, reason: 'plan entry without regionId' }); return; }
    const key = String(entry.regionId);
    const list = entriesByRegionId.get(key) || [];
    list.push({ index, entry });
    entriesByRegionId.set(key, list);
  });

  const duplicatedRegionIds = [...entriesByRegionId.entries()].filter(([, l]) => l.length > 1).map(([k]) => k).sort();
  const candidateIds = new Set(candidates.map(c => c.declaredRegionId).filter(id => id != null));
  const orphanPlanEntries = [...entriesByRegionId.keys()].filter(id => !candidateIds.has(id)).sort();
  const regionsWithoutPlan = candidates
    .filter(c => c.declaredRegionId == null || !entriesByRegionId.has(c.declaredRegionId))
    .map(c => c.internalCandidateKey).sort();

  const warnings = [];
  if (duplicatedRegionIds.length) warnings.push(`Several plan entries share the same regionId: ${duplicatedRegionIds.join(', ')}. Plan-sourced values are marked unavailable for those regions instead of taking the last entry.`);
  if (missingRegionIds.length) warnings.push(`${missingRegionIds.length} plan entry/entries without a usable regionId.`);
  if (orphanPlanEntries.length) warnings.push(`Plan entries without a matching region: ${orphanPlanEntries.join(', ')}.`);
  if (regionsWithoutPlan.length) warnings.push(`Regions without a plan entry: ${regionsWithoutPlan.join(', ')}.`);

  return {
    entriesByRegionId,
    planEntryCount: sequence.length,
    planIntegrity: {
      status: warnings.length === 0 ? 'ok' : 'issues',
      duplicatedRegionIds,
      missingRegionIds,
      orphanPlanEntries,
      regionsWithoutPlan,
      warnings,
    },
  };
}

/**
 * @returns {{ planEntry:object|null, planStatus:'single'|'duplicated'|'missing' }}
 */
export function resolvePlanEntry({ entriesByRegionId, candidate }) {
  if (!candidate || candidate.declaredRegionId == null) return { planEntry: null, planStatus: 'missing' };
  const list = entriesByRegionId.get(candidate.declaredRegionId);
  if (!list || list.length === 0) return { planEntry: null, planStatus: 'missing' };
  if (list.length > 1) return { planEntry: null, planStatus: 'duplicated' };
  return { planEntry: list[0].entry, planStatus: 'single' };
}