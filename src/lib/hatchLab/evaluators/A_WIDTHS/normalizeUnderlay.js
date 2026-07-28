/**
 * normalizeUnderlay.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A)
 * Underlay is read from declared fields only, never reconstructed from commands.
 * A bare boolean stays a boolean: true is never promoted to a type.
 */

import { makeField, unavailableField } from './evaluatorSchema.js';
import { UNDERLAY_RAW_MAP, UNDERLAY_RAW_WITHOUT_EQUIVALENT } from './verifiedFieldMap.js';

function normalizeType(rawValue, sourceField) {
  if (rawValue === undefined || rawValue === null) return null;
  if (typeof rawValue !== 'string') {
    return makeField({ rawValue, normalizedValue: 'unknown', sourceField, availability: 'unknown', reason: 'Non-string underlay type; not interpreted.' });
  }
  const key = rawValue.trim().toLowerCase();
  const mapped = UNDERLAY_RAW_MAP[key];
  if (mapped) return makeField({ rawValue, normalizedValue: mapped, sourceField, availability: 'available', reason: `Verified engine value mapped to "${mapped}".` });
  if (UNDERLAY_RAW_WITHOUT_EQUIVALENT[key]) {
    return makeField({ rawValue, normalizedValue: 'unknown', sourceField, availability: 'unknown', reason: UNDERLAY_RAW_WITHOUT_EQUIVALENT[key] });
  }
  return makeField({ rawValue, normalizedValue: 'unknown', sourceField, availability: 'unknown', reason: `Underlay value "${rawValue}" is not in the verified engine vocabulary.` });
}

export function normalizeUnderlay({ region = null, planEntry = null } = {}) {
  const rec = region?.recommended_underlay;
  const planUnderlay = planEntry?.underlay;

  // enabled — booleans are values, absence is not false.
  let underlayEnabled;
  if (typeof rec?.enabled === 'boolean') {
    underlayEnabled = makeField({ rawValue: rec.enabled, normalizedValue: rec.enabled, sourceField: 'region.recommended_underlay.enabled', availability: 'available', reason: 'Boolean declared by the engine.' });
  } else if (typeof region?.underlay === 'boolean') {
    underlayEnabled = makeField({ rawValue: region.underlay, normalizedValue: region.underlay, sourceField: 'region.underlay', availability: 'available', reason: 'Boolean declared by the engine.' });
  } else if (planUnderlay === null && planEntry) {
    underlayEnabled = makeField({ rawValue: null, normalizedValue: false, sourceField: 'plan.sequence[].underlay', availability: 'available', reason: 'The planner declares underlay: null, i.e. no underlay.' });
  } else {
    underlayEnabled = unavailableField('No underlay boolean present in the result.');
  }

  const primaryUnderlay =
    normalizeType(rec?.type, 'region.recommended_underlay.type')
    ?? normalizeType(planUnderlay?.type, 'plan.sequence[].underlay.type')
    ?? (underlayEnabled.normalizedValue === false
      ? makeField({ rawValue: null, normalizedValue: 'none', sourceField: underlayEnabled.sourceField, availability: 'available', reason: 'Underlay disabled by the engine.' })
      : unavailableField('The engine declares only a boolean; the underlay TYPE is not available and true is never promoted to a type.', underlayEnabled.sourceField));

  return {
    underlayEnabled,
    primaryUnderlay,
    secondaryUnderlay: unavailableField('The base engine emits a single combined underlay type (e.g. edge_walk_zigzag), never a separate secondary entry.'),
    primaryLengthMm: unavailableField('eieUnderlay returns type/density_mm/angle_deg only — no underlay lengths exist.'),
    secondaryLengthMm: unavailableField('No secondary underlay length exists in the base engine.'),
    secondarySpacingMm: Number.isFinite(rec?.density_mm)
      ? makeField({ rawValue: rec.density_mm, normalizedValue: rec.density_mm, sourceField: 'region.recommended_underlay.density_mm', availability: 'available', reason: 'Underlay density in mm; NOT verified to be the Hatch "underlay 2 spacing".' })
      : unavailableField('No underlay spacing present in the result.'),
    underlayAngleDeg: Number.isFinite(rec?.angle_deg)
      ? makeField({ rawValue: rec.angle_deg, normalizedValue: rec.angle_deg, sourceField: 'region.recommended_underlay.angle_deg', availability: 'available', reason: 'Underlay angle in degrees.' })
      : unavailableField('No underlay angle present in the result.'),
  };
}