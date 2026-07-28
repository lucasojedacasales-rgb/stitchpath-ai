/**
 * compareMetrics.js — Hatch Lab (P0)
 * Pure comparison of two metric sets. Never mutates its inputs.
 *
 * Improvement / regression are ONLY emitted when a seed expectedResult states
 * the direction. Fewer regions, fewer colors, fewer stitches or less time are
 * classified as informational differences, never as improvements.
 */

import {
  UNAVAILABLE, isAvailable, METRIC_KEYS, ESSENTIAL_METRICS,
  DIRECTIONLESS_METRICS, DEFAULT_TOLERANCES,
} from './metricAvailability.js';

const isNum = v => typeof v === 'number' && Number.isFinite(v);

function withinTolerance(key, a, b, tolerances) {
  const tol = tolerances?.[key];
  if (!tol) return a === b;
  const diff = Math.abs(a - b);
  if (isNum(tol.absolute) && diff <= tol.absolute) return true;
  if (isNum(tol.relative)) {
    const base = Math.abs(a) || 1;
    return diff / base <= tol.relative;
  }
  return a === b;
}

function valuesEqual(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}

/**
 * @param {object} baseline metrics
 * @param {object} candidate metrics
 * @param {object} [options] { tolerances, expectedResult }
 *   expectedResult: { <metricKey>: { direction: 'lower'|'higher'|'equal', value? } }
 */
export function compareMetrics(baseline, candidate, options = {}) {
  const tolerances = { ...DEFAULT_TOLERANCES, ...(options.tolerances || {}) };
  const expected = options.expectedResult && typeof options.expectedResult === 'object'
    ? options.expectedResult
    : null;

  const equal = [];
  const improvements = [];
  const regressions = [];
  const informationalDifferences = [];
  const notComparable = [];
  const unavailableMetrics = [];

  const base = baseline && typeof baseline === 'object' ? baseline : {};
  const cand = candidate && typeof candidate === 'object' ? candidate : {};

  for (const key of METRIC_KEYS) {
    const a = key in base ? base[key] : UNAVAILABLE;
    const b = key in cand ? cand[key] : UNAVAILABLE;

    if (!isAvailable(a) || !isAvailable(b)) {
      unavailableMetrics.push({ metric: key, baseline: isAvailable(a) ? a : UNAVAILABLE, candidate: isAvailable(b) ? b : UNAVAILABLE });
      continue;
    }

    if (isNum(a) && isNum(b)) {
      if (withinTolerance(key, a, b, tolerances)) {
        equal.push({ metric: key, value: a, tolerance: tolerances[key] || null });
        continue;
      }
      const delta = b - a;
      const rule = expected?.[key];
      if (rule && (rule.direction === 'lower' || rule.direction === 'higher' || rule.direction === 'equal')) {
        const satisfied = rule.direction === 'lower' ? delta < 0
          : rule.direction === 'higher' ? delta > 0
          : delta === 0;
        (satisfied ? improvements : regressions).push({ metric: key, baseline: a, candidate: b, delta, expected: rule });
      } else {
        informationalDifferences.push({
          metric: key, baseline: a, candidate: b, delta,
          note: DIRECTIONLESS_METRICS.includes(key)
            ? 'direction of "better" undefined without a seed expectedResult'
            : 'no expectedResult declared for this metric',
        });
      }
      continue;
    }

    if (valuesEqual(a, b)) {
      equal.push({ metric: key, value: Array.isArray(a) ? `${a.length} items` : a, tolerance: null });
    } else if (Array.isArray(a) && Array.isArray(b)) {
      informationalDifferences.push({ metric: key, baseline: `${a.length} items`, candidate: `${b.length} items`, delta: b.length - a.length, note: 'sequence/order difference' });
    } else {
      notComparable.push({ metric: key, baseline: a, candidate: b, reason: 'incompatible value types' });
    }
  }

  const missingEssential = ESSENTIAL_METRICS.filter(k => !isAvailable(base[k]) || !isAvailable(cand[k]));
  const conclusive = missingEssential.length === 0;

  return {
    equal,
    improvements,
    regressions,
    informationalDifferences,
    notComparable,
    unavailableMetrics,
    tolerancesUsed: tolerances,
    expectedResultProvided: !!expected,
    missingEssentialMetrics: missingEssential,
    conclusive,
  };
}