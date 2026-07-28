/**
 * compareAWidthsReference.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A.1)
 * Informative comparison only. candidateRules are never expected truth,
 * expectedResult is never written and no pass/fail is emitted.
 * Informative comparisons keep their numeric deltas.
 */

import { UNDERLAY_RAW_MAP } from './verifiedFieldMap.js';

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const HATCH_TECHNIQUE = Object.freeze({ 'satín': 'satin', satin: 'satin', tatami: 'tatami', corrido: 'running' });
const HATCH_UNDERLAY = Object.freeze({
  'corrido central': 'center_run',
  'corrido de borde': 'edge_run',
  zigzag: 'zigzag',
  'corrido de borde + zigzag': 'edge_run_plus_zigzag',
  ninguno: 'none',
});

export function buildReference(seedCase) {
  const measured = seedCase?.observation?.measured || {};
  const documented = seedCase?.configuration?.documented || {};
  const input = seedCase?.input || {};
  const topStitchRaw = typeof measured.topStitch === 'string' ? measured.topStitch : null;
  const underlayRaw = typeof measured.underlayType === 'string' ? measured.underlayType : null;

  return {
    source: 'observation.measured + configuration.documented + input (never candidateRules)',
    nominalWidthMm: num(measured.nominalWidthMm),
    observedWidthMm: num(measured.observedWidthMm),
    nominalHeightMm: num(measured.nominalHeightMm),
    observedHeightMm: num(measured.observedHeightMm),
    centerXMm: num(input.centerXMm),
    centerYMm: num(input.centerYMm),
    technique: topStitchRaw
      ? { rawValue: topStitchRaw, normalizedValue: HATCH_TECHNIQUE[topStitchRaw.trim().toLowerCase()] ?? 'unknown' }
      : { rawValue: null, normalizedValue: null },
    underlayType: underlayRaw
      ? { rawValue: underlayRaw, normalizedValue: HATCH_UNDERLAY[underlayRaw.trim().toLowerCase()] ?? UNDERLAY_RAW_MAP[underlayRaw.trim().toLowerCase()] ?? 'unknown' }
      : { rawValue: null, normalizedValue: null },
    spacingMode: typeof measured.spacingMode === 'string' ? measured.spacingMode.toLowerCase() : null,
    spacingMm: num(measured.spacingMm),
    pullCompensationMm: num(measured.pullCompensationMm ?? documented.pullCompensationMm),
    autoSplit: typeof measured.autoSplit === 'boolean' ? measured.autoSplit
      : typeof documented.autoSplit === 'boolean' ? documented.autoSplit : null,
    stitchAngleDeg: num(documented.stitchAngleDeg),
    geometryClass: seedCase?.ruleScope?.geometryClass ?? input.geometry ?? null,
  };
}

function numericDetail(referenceValue, actualValue, tolerance) {
  if (typeof referenceValue !== 'number' || typeof actualValue !== 'number') {
    return { delta: null, absoluteDelta: null, relativeDelta: null, withinTolerance: null };
  }
  const delta = actualValue - referenceValue;
  return {
    delta,
    absoluteDelta: Math.abs(delta),
    relativeDelta: referenceValue !== 0 ? delta / referenceValue : null,
    withinTolerance: Math.abs(delta) <= tolerance,
  };
}

function comparison(name, referenceValue, actualField, { matchStatus, tolerance = 0, comparable = true, notComparableReason = null, informational = false }) {
  const base = {
    name, referenceValue, actualValue: null, delta: null, absoluteDelta: null, relativeDelta: null,
    tolerance, withinTolerance: null, comparable, comparisonStatus: 'not_comparable', reason: '',
  };
  if (matchStatus === 'ambiguous') return { ...base, comparisonStatus: 'ambiguous_match', reason: 'The case ↔ region assignment is ambiguous; no comparison is made.' };
  if (actualField && actualField.availability === 'conflict') {
    return { ...base, comparisonStatus: 'source_conflict', reason: actualField.reason, comparable: false };
  }
  if (!comparable) return { ...base, comparisonStatus: 'not_comparable', reason: notComparableReason || 'Quantities are not verified to be equivalent.' };
  if (referenceValue === null || referenceValue === undefined) {
    return { ...base, comparisonStatus: 'unavailable_reference', reason: 'The seed does not document this value (null does not mean zero).' };
  }
  if (!actualField || actualField.availability !== 'available') {
    return { ...base, comparisonStatus: 'unavailable_actual', reason: actualField?.reason || 'The engine result does not expose this value.' };
  }
  const actualValue = actualField.normalizedValue;
  const detail = numericDetail(referenceValue, actualValue, tolerance);

  if (informational) {
    return {
      ...base, actualValue, ...detail, comparisonStatus: 'informational',
      reason: 'Numeric difference recorded for information only; no criterion, no pass/fail in this phase.',
    };
  }
  if (typeof referenceValue === 'number' && typeof actualValue === 'number') {
    return { ...base, actualValue, ...detail, comparisonStatus: detail.withinTolerance ? 'equal' : 'different', reason: `|delta| ${detail.withinTolerance ? '≤' : '>'} tolerance ${tolerance}.` };
  }
  const equal = referenceValue === actualValue;
  return { ...base, actualValue, comparisonStatus: equal ? 'equal' : 'different', reason: equal ? 'Identical normalized values.' : 'Normalized values differ.' };
}

export function compareAWidthsReference({ reference, actual, matchStatus, options }) {
  const tol = options.valueToleranceMm;
  return [
    comparison('nominalWidthMm_vs_engineWidthMm', reference.nominalWidthMm, actual.widthMm, { matchStatus, tolerance: tol, informational: true }),
    comparison('observedWidthMm_vs_engineWidthMm', reference.observedWidthMm, actual.widthMm, { matchStatus, tolerance: tol, informational: true }),
    comparison('nominalHeightMm_vs_engineHeightMm', reference.nominalHeightMm, actual.heightMm, { matchStatus, tolerance: tol, informational: true }),
    comparison('observedHeightMm_vs_engineHeightMm', reference.observedHeightMm, actual.heightMm, { matchStatus, tolerance: tol, informational: true }),
    comparison('technique', reference.technique.normalizedValue, actual.technique, { matchStatus }),
    comparison('underlayType', reference.underlayType.normalizedValue, actual.underlay.primaryUnderlay, { matchStatus }),
    comparison('spacingMode', reference.spacingMode, actual.spacing.spacingMode, { matchStatus }),
    comparison('spacingMm', reference.spacingMm, actual.spacing.spacingMm, {
      matchStatus, tolerance: tol, comparable: false,
      notComparableReason: 'The engine exposes no spacing field. region.density (densityMm) is NOT verified to be the same quantity as the Hatch spacing column, so no comparison is performed; the equivalence remains pending validation.',
    }),
    comparison('pullCompensationMm', reference.pullCompensationMm, actual.pullCompensationMm, { matchStatus, tolerance: tol }),
    comparison('autoSplit', reference.autoSplit, actual.autoSplit, { matchStatus }),
    comparison('stitchAngleDeg', reference.stitchAngleDeg, actual.stitchAngleDeg, { matchStatus, tolerance: options.angleToleranceDeg ?? 0 }),
  ];
}