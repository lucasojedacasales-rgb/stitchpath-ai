/**
 * normalizeTechnique.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A.1)
 * Value-level normalizer used by the provenance reconciliation.
 * 'fill' is never promoted to 'tatami'; nothing is inferred from geometry.
 */

import { TECHNIQUE_RAW_MAP } from './verifiedFieldMap.js';

export function normalizeTechniqueValue(rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return { normalizedValue: null, availability: 'unavailable', reason: 'No technique value present.' };
  }
  if (typeof rawValue !== 'string') {
    return { normalizedValue: 'unknown', availability: 'unknown', reason: 'Non-string technique value; not interpreted.' };
  }
  const key = rawValue.trim().toLowerCase();
  const mapped = TECHNIQUE_RAW_MAP[key];
  if (mapped) {
    return {
      normalizedValue: mapped, availability: 'available',
      reason: mapped === 'fill'
        ? "Engine value 'fill' kept as fill: the base engine never emits 'tatami', so no promotion is made."
        : `Verified engine value mapped to "${mapped}".`,
    };
  }
  return { normalizedValue: 'unknown', availability: 'unknown', reason: `Technique value "${rawValue}" is not in the verified engine vocabulary.` };
}