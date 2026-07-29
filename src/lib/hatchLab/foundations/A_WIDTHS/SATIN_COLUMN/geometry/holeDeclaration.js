/**
 * holeDeclaration.js — P1.F0.1 explicit interpretation of how a region declares
 * interior holes. Never invents a count from a boolean flag.
 *
 * Present: non-empty array · finite number > 0 · non-empty object ·
 *          holes === true · holeCount > 0 · hole_count > 0 · explicitHoleCount > 0
 * Absent:  null/undefined · 0 · false · [] · {}
 */

const FIELDS = ['holes', 'holeCount', 'hole_count', 'explicitHoleCount'];

function interpret(value) {
  if (value === null || value === undefined) return { present: false, count: 0 };
  if (Array.isArray(value)) return { present: value.length > 0, count: value.length };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { present: false, count: null, invalid: true };
    return { present: value > 0, count: value > 0 ? value : 0 };
  }
  if (typeof value === 'boolean') return { present: value, count: null };
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    return { present: keys.length > 0, count: keys.length > 0 ? keys.length : 0 };
  }
  return { present: false, count: 0 };
}

/**
 * Returns { holeStatus: 'present'|'absent', holeSourceField, declaredHoleCount, evidence }.
 * declaredHoleCount is null when only a boolean flag is available.
 */
export function describeHoleDeclaration(region = {}) {
  const evidence = [];
  let hit = null;
  for (const field of FIELDS) {
    if (!(region && Object.prototype.hasOwnProperty.call(region, field))) continue;
    const value = region[field];
    const r = interpret(value);
    evidence.push({ field, valueType: Array.isArray(value) ? 'array' : typeof value, present: r.present, count: r.count });
    if (r.present && !hit) hit = { field, count: r.count };
  }
  return {
    holeStatus: hit ? 'present' : 'absent',
    holeSourceField: hit ? hit.field : null,
    declaredHoleCount: hit ? hit.count : 0,
    evidence,
  };
}