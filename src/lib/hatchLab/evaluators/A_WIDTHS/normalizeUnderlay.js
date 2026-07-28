/**
 * normalizeUnderlay.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A.1)
 * Underlay is read from declared fields only. A bare boolean stays a boolean.
 * recommended_underlay.density_mm is exposed as underlayDensityMm — never as
 * the Hatch "underlay 2 spacing".
 */

import { makeField, unavailableField } from './evaluatorSchema.js';
import { resolveFieldSources, numericNormalizer, booleanNormalizer } from './resolveFieldSources.js';
import { UNDERLAY_RAW_MAP, UNDERLAY_RAW_WITHOUT_EQUIVALENT } from './verifiedFieldMap.js';

export function normalizeUnderlayTypeValue(rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return { normalizedValue: null, availability: 'unavailable', reason: 'No underlay type value present.' };
  }
  if (typeof rawValue !== 'string') {
    return { normalizedValue: 'unknown', availability: 'unknown', reason: 'Non-string underlay type; not interpreted.' };
  }
  const key = rawValue.trim().toLowerCase();
  const mapped = UNDERLAY_RAW_MAP[key];
  if (mapped) return { normalizedValue: mapped, availability: 'available', reason: `Verified engine value mapped to "${mapped}".` };
  if (UNDERLAY_RAW_WITHOUT_EQUIVALENT[key]) return { normalizedValue: 'unknown', availability: 'unknown', reason: UNDERLAY_RAW_WITHOUT_EQUIVALENT[key] };
  return { normalizedValue: 'unknown', availability: 'unknown', reason: `Underlay value "${rawValue}" is not in the verified engine vocabulary.` };
}

const planNote = (planStatus) => (planStatus === 'duplicated'
  ? { forcedAvailability: 'unavailable', reason: 'Several plan entries share this regionId; plan-sourced values are marked unavailable instead of taking one arbitrarily.' }
  : {});

export function buildUnderlayFields({ region = null, planEntry = null, planStatus = 'missing', options = {} } = {}) {
  const rec = region?.recommended_underlay;
  const planUnderlay = planEntry?.underlay;
  const note = planNote(planStatus);

  const underlayEnabled = resolveFieldSources({
    fieldName: 'underlayEnabled',
    sources: [
      { sourceField: 'region.recommended_underlay.enabled', present: rec !== undefined && rec !== null, rawValue: rec?.enabled },
      { sourceField: 'region.underlay', present: region?.underlay !== undefined, rawValue: region?.underlay },
      { sourceField: 'plan.sequence[].underlay', present: planStatus !== 'missing' && planEntry !== null && planEntry.underlay !== undefined, rawValue: planEntry?.underlay == null ? false : true, ...note },
    ],
    normalizer: booleanNormalizer('Boolean declared by the engine.'),
    tolerance: null,
    unavailableReason: 'No underlay boolean present in the result.',
  });

  const primaryUnderlay = resolveFieldSources({
    fieldName: 'underlayType',
    sources: [
      { sourceField: 'region.recommended_underlay.type', present: rec?.type !== undefined, rawValue: rec?.type },
      { sourceField: 'plan.sequence[].underlay.type', present: planUnderlay?.type !== undefined, rawValue: planUnderlay?.type, ...note },
    ],
    normalizer: normalizeUnderlayTypeValue,
    tolerance: null,
    unavailableReason: underlayEnabled.normalizedValue === true
      ? 'The engine declares only a boolean; the underlay TYPE is not available and true is never promoted to a type.'
      : 'No underlay type present in the result.',
  });

  const resolvedPrimary = (primaryUnderlay.availability === 'unavailable' && underlayEnabled.normalizedValue === false)
    ? { ...primaryUnderlay, normalizedValue: 'none', availability: 'available', sourceField: underlayEnabled.sourceField, reason: 'Underlay disabled by the engine.' }
    : primaryUnderlay;

  const underlayDensityMm = resolveFieldSources({
    fieldName: 'underlayDensityMm',
    sources: [
      { sourceField: 'region.recommended_underlay.density_mm', present: rec?.density_mm !== undefined, rawValue: rec?.density_mm },
      { sourceField: 'plan.sequence[].underlay.density', present: planUnderlay?.density !== undefined, rawValue: planUnderlay?.density, ...note },
    ],
    normalizer: numericNormalizer('Underlay density in mm as declared by the engine; NOT interpreted as the Hatch "underlay 2 spacing".'),
    tolerance: options.densityToleranceMm ?? 0.001,
    unit: 'mm',
    unavailableReason: 'No underlay density present in the result.',
  });

  return {
    underlayEnabled,
    primaryUnderlay: resolvedPrimary,
    underlayDensityMm,
    underlayAngleDeg: resolveFieldSources({
      fieldName: 'underlayAngleDeg',
      sources: [{ sourceField: 'region.recommended_underlay.angle_deg', present: rec?.angle_deg !== undefined, rawValue: rec?.angle_deg }],
      normalizer: numericNormalizer('Underlay angle in degrees.'),
      tolerance: 0,
      unit: 'degrees',
      unavailableReason: 'No underlay angle present in the result.',
    }),
    secondaryUnderlay: unavailableField('The base engine emits a single combined underlay type (e.g. edge_walk_zigzag), never a separate secondary entry.'),
    primaryLengthMm: unavailableField('eieUnderlay returns type/density_mm/angle_deg only — no underlay lengths exist.', null, 'mm'),
    secondaryLengthMm: unavailableField('No secondary underlay length exists in the base engine.', null, 'mm'),
    /** Deliberately NOT fed by recommended_underlay.density_mm (see underlayDensityMm). */
    secondarySpacingMm: makeField({
      availability: 'unavailable', unit: 'mm', sourceField: null,
      reason: 'The Hatch "underlay 2 spacing" has no verified engine equivalent; region.recommended_underlay.density_mm is reported as underlayDensityMm instead.',
    }),
  };
}