/**
 * compareMetrics.js — Hatch Lab (P0.1)
 * Pure criterion evaluator + informational diff. Never mutates inputs.
 *
 * pass/fail can ONLY come from explicit expectedResult criteria evaluated
 * against real target values. relative_to_baseline is the ONLY operator that
 * compares exclusively against the baseline.
 */

import {
  UNAVAILABLE, METRIC_DEFS, METRIC_KEYS, COMMAND_DERIVED_METRICS,
  NUMERIC_OPERATORS, SEQUENCE_OPERATORS,
} from './metricAvailability.js';

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const tolAbs = t => (isNum(t?.absolute) && t.absolute >= 0 ? t.absolute : 0);
const tolRel = t => (isNum(t?.relative) && t.relative >= 0 ? t.relative : 0);

function readMetric(extraction, metric) {
  return {
    value: extraction?.metrics?.[metric],
    avail: extraction?.availability?.[metric] || null,
  };
}

function commandGuard(extraction, metric) {
  if (!COMMAND_DERIVED_METRICS.includes(metric)) return null;
  const u = extraction?.metrics?.unknownCommandCount;
  if (isNum(u) && u > 0) return `unknown command types (${u}) affect command-derived metric "${metric}"`;
  return null;
}

/**
 * Evaluates one criterion of an expectedResult against real extractions.
 * @returns {{ metric, operator, expected, actual, baseline, required,
 *             available, complete, evaluated, satisfied, notComparable, reason }}
 */
export function evaluateCriterion(criterion, baselineExtraction, candidateExtraction) {
  const { metric, operator } = criterion || {};
  const required = criterion?.required === true;
  const base = {
    metric: metric ?? null, operator: operator ?? null, required,
    expected: null, actual: null, baseline: null,
    available: false, complete: false, evaluated: false, satisfied: null,
    notComparable: false, reason: null,
  };

  const def = METRIC_DEFS[metric];
  if (!def) return { ...base, reason: `unknown metric "${metric}"`, invalid: true };
  if (!NUMERIC_OPERATORS.includes(operator) && !SEQUENCE_OPERATORS.includes(operator)) {
    return { ...base, reason: `unknown operator "${operator}"`, invalid: true };
  }

  const cand = readMetric(candidateExtraction, metric);
  base.actual = cand.value === UNAVAILABLE ? null : cand.value;

  const needsBaseline = operator === 'relative_to_baseline';
  const bl = needsBaseline ? readMetric(baselineExtraction, metric) : null;
  if (needsBaseline) base.baseline = bl.value === UNAVAILABLE ? null : bl.value;

  if (!cand.avail?.available) return { ...base, reason: `metric unavailable in candidate: ${cand.avail?.reason || 'no availability info'}` };
  if (needsBaseline && !bl.avail?.available) return { ...base, available: true, reason: `metric unavailable in baseline: ${bl.avail?.reason || 'no availability info'}` };
  base.available = true;

  const guardC = commandGuard(candidateExtraction, metric);
  const guardB = needsBaseline ? commandGuard(baselineExtraction, metric) : null;
  if (!cand.avail.complete || (needsBaseline && !bl.avail.complete) || guardC || guardB) {
    return {
      ...base,
      reason: guardC || guardB || `metric incomplete: ${(!cand.avail.complete ? cand.avail.reason : bl?.avail?.reason) || 'partial data'}`,
    };
  }
  base.complete = true;

  // ── operator evaluation against real target values ─────────────────────
  const a = tolAbs(criterion.tolerance);
  const rl = tolRel(criterion.tolerance);

  if (SEQUENCE_OPERATORS.includes(operator)) {
    if (!Array.isArray(cand.value) || !Array.isArray(criterion.value)) {
      return { ...base, notComparable: true, reason: 'sequence operator requires array actual and array expected' };
    }
    base.expected = criterion.value;
    base.evaluated = true;
    if (operator === 'sequence_equals') {
      base.satisfied = JSON.stringify(cand.value) === JSON.stringify(criterion.value);
      base.reason = base.satisfied ? 'sequence matches exactly' : 'sequence differs (order or content)';
    } else {
      const s1 = new Set(cand.value.map(v => JSON.stringify(v)));
      const s2 = new Set(criterion.value.map(v => JSON.stringify(v)));
      base.satisfied = s1.size === s2.size && [...s1].every(v => s2.has(v));
      base.reason = base.satisfied ? 'sets match' : 'set membership differs';
    }
    return base;
  }

  // numeric operators
  if (!isNum(cand.value)) {
    return { ...base, notComparable: true, reason: `numeric operator on non-numeric actual value (${typeof cand.value})` };
  }

  if (operator === 'equals') {
    base.expected = criterion.value;
    const diff = Math.abs(cand.value - criterion.value);
    base.evaluated = true;
    base.satisfied = diff <= a || (rl > 0 && diff <= rl * Math.abs(criterion.value));
    base.reason = base.satisfied ? `|Δ|=${diff} within tolerance` : `expected ${criterion.value}, got ${cand.value} (|Δ|=${diff})`;
    return base;
  }
  if (operator === 'minimum') {
    base.expected = `≥ ${criterion.value}`;
    base.evaluated = true;
    base.satisfied = cand.value >= criterion.value - a;
    base.reason = base.satisfied ? 'meets minimum' : `below minimum ${criterion.value}`;
    return base;
  }
  if (operator === 'maximum') {
    base.expected = `≤ ${criterion.value}`;
    base.evaluated = true;
    base.satisfied = cand.value <= criterion.value + a;
    base.reason = base.satisfied ? 'within maximum' : `above maximum ${criterion.value}`;
    return base;
  }
  if (operator === 'between') {
    base.expected = `[${criterion.min}, ${criterion.max}]`;
    base.evaluated = true;
    base.satisfied = cand.value >= criterion.min - a && cand.value <= criterion.max + a;
    base.reason = base.satisfied ? 'within range' : `outside [${criterion.min}, ${criterion.max}]`;
    return base;
  }
  // relative_to_baseline — the only baseline-relative operator
  if (!isNum(bl.value)) {
    return { ...base, notComparable: true, reason: 'relative_to_baseline requires a numeric baseline value' };
  }
  const delta = cand.value - bl.value;
  base.expected = `direction ${criterion.direction} vs baseline ${bl.value}`;
  base.evaluated = true;
  let ok = criterion.direction === 'lower' ? delta < 0
    : criterion.direction === 'higher' ? delta > 0
    : Math.abs(delta) <= a;
  if (ok && isNum(criterion.minimumDelta) && Math.abs(delta) < criterion.minimumDelta) {
    ok = false; base.reason = `delta ${delta} below minimumDelta ${criterion.minimumDelta}`;
  }
  if (ok && isNum(criterion.maximumDelta) && Math.abs(delta) > criterion.maximumDelta) {
    ok = false; base.reason = `delta ${delta} above maximumDelta ${criterion.maximumDelta}`;
  }
  base.satisfied = ok;
  if (!base.reason) base.reason = ok ? `delta ${delta} satisfies direction ${criterion.direction}` : `delta ${delta} violates direction ${criterion.direction}`;
  return base;
}

/** Evaluates every criterion of an expectedResult. Pure. */
export function evaluateExpectedResult(expectedResult, baselineExtraction, candidateExtraction) {
  const criteria = Array.isArray(expectedResult?.criteria) ? expectedResult.criteria : [];
  const results = criteria.map(c => evaluateCriterion(c, baselineExtraction, candidateExtraction));
  return {
    criteria: results,
    unknownExpectedMetrics: results.filter(r => r.invalid && /unknown metric/.test(r.reason || '')).map(r => r.metric),
    invalidCriteria: results.filter(r => r.invalid === true),
    requiredCriteria: results.filter(r => r.required),
  };
}

/**
 * Informational diff for metrics NOT covered by criteria.
 * Differences here are NEVER improvements or regressions.
 */
export function diffInformational(baselineExtraction, candidateExtraction, excludeMetrics = new Set()) {
  const equal = [];
  const informationalDifferences = [];
  const notComparable = [];
  const unavailableMetrics = [];

  for (const key of METRIC_KEYS) {
    if (excludeMetrics.has(key) || METRIC_DEFS[key].type === 'object') continue;
    const b = readMetric(baselineExtraction, key);
    const c = readMetric(candidateExtraction, key);
    if (!b.avail?.available || !c.avail?.available) {
      unavailableMetrics.push({
        metric: key,
        baseline: b.avail?.available ? b.value : UNAVAILABLE,
        candidate: c.avail?.available ? c.value : UNAVAILABLE,
        reason: (!b.avail?.available ? `baseline: ${b.avail?.reason || 'missing'}` : `candidate: ${c.avail?.reason || 'missing'}`),
      });
      continue;
    }
    if (isNum(b.value) && isNum(c.value)) {
      if (b.value === c.value) equal.push({ metric: key, value: b.value });
      else informationalDifferences.push({
        metric: key, baseline: b.value, candidate: c.value, delta: c.value - b.value,
        note: 'informational only — direction of "better" undefined without a seed criterion',
      });
    } else if (Array.isArray(b.value) && Array.isArray(c.value)) {
      if (JSON.stringify(b.value) === JSON.stringify(c.value)) equal.push({ metric: key, value: `${b.value.length} items` });
      else informationalDifferences.push({ metric: key, baseline: `${b.value.length} items`, candidate: `${c.value.length} items`, delta: c.value.length - b.value.length, note: 'sequence difference (informational)' });
    } else {
      notComparable.push({ metric: key, baseline: b.value, candidate: c.value, reason: 'incompatible value types' });
    }
  }
  return { equal, informationalDifferences, notComparable, unavailableMetrics };
}

/** Combined comparison. Pure. */
export function compareMetrics(baselineExtraction, candidateExtraction, options = {}) {
  const evaluation = evaluateExpectedResult(options.expectedResult || null, baselineExtraction, candidateExtraction);
  const covered = new Set(evaluation.criteria.map(r => r.metric).filter(Boolean));
  const info = diffInformational(baselineExtraction, candidateExtraction, covered);
  return { ...info, ...evaluation, expectedResultProvided: !!options.expectedResult };
}