/**
 * normalizeTechnique.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A)
 * Technique is READ from the engine result, never inferred from geometry or
 * from the seed. 'fill' is never silently promoted to 'tatami'.
 */

import { makeField } from './evaluatorSchema.js';
import { TECHNIQUE_RAW_MAP } from './verifiedFieldMap.js';

export function normalizeTechnique({ region = null, planEntry = null, options = {} } = {}) {
  const alternatives = Array.isArray(options.alternativeFields?.technique)
    ? options.alternativeFields.technique : [];

  const sources = [
    ['region.stitch_type', region?.stitch_type],
    ['plan.sequence[].stitchType', planEntry?.stitchType],
    ...alternatives.map(k => [`region.${k}`, region?.[k]]),
  ];

  for (const [sourceField, rawValue] of sources) {
    if (rawValue === undefined || rawValue === null) continue;
    if (typeof rawValue !== 'string') {
      return makeField({ rawValue, sourceField, normalizedValue: 'unknown', availability: 'unknown', reason: 'Non-string technique value; not interpreted.' });
    }
    const key = rawValue.trim().toLowerCase();
    const mapped = TECHNIQUE_RAW_MAP[key];
    if (mapped) {
      return makeField({
        rawValue, normalizedValue: mapped, sourceField, availability: 'available',
        reason: mapped === 'fill'
          ? "Engine value 'fill' kept as fill: the base engine never emits 'tatami', so no promotion is made."
          : `Verified engine value mapped to "${mapped}".`,
      });
    }
    return makeField({ rawValue, normalizedValue: 'unknown', sourceField, availability: 'unknown', reason: `Technique value "${rawValue}" is not in the verified engine vocabulary.` });
  }

  return makeField({ normalizedValue: 'unavailable', availability: 'unavailable', reason: 'No technique field present in the result.' });
}