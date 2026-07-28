/**
 * resolveFieldSources.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A.1)
 * Provenance reconciliation: no source is silently preferred over another.
 */

import { makeField } from './evaluatorSchema.js';

/**
 * @param {object} args
 * @param {string} args.fieldName
 * @param {Array<{sourceField:string, present:boolean, rawValue?:any, forcedAvailability?:string, reason?:string}>} args.sources
 * @param {(raw:any)=>({normalizedValue:any, availability:string, reason:string})} args.normalizer
 * @param {number|null} args.tolerance — numeric tolerance; null for exact string equality
 * @param {string} args.unit
 */
export function resolveFieldSources({ fieldName, sources = [], normalizer, tolerance = null, unit = null, unavailableReason = '' }) {
  const considered = sources.filter(s => s && s.present === true);
  const sourceValues = considered.map(s => ({ sourceField: s.sourceField, rawValue: s.rawValue ?? null, forcedAvailability: s.forcedAvailability ?? null, note: s.reason ?? '' }));

  const normalizedSourceValues = considered.map(s => {
    if (s.forcedAvailability) {
      return { sourceField: s.sourceField, rawValue: s.rawValue ?? null, normalizedValue: null, availability: s.forcedAvailability, reason: s.reason || '' };
    }
    const n = normalizer(s.rawValue);
    return { sourceField: s.sourceField, rawValue: s.rawValue ?? null, ...n };
  });

  const valid = normalizedSourceValues.filter(n => n.availability === 'available');
  const notAvailable = normalizedSourceValues.filter(n => n.availability !== 'available');
  const selectionPolicy = tolerance === null
    ? 'exact equality across normalized sources; no source has priority'
    : `numeric agreement within tolerance ${tolerance}; no source has priority`;

  const base = {
    fieldName, unit, sourceValues, normalizedSourceValues, selectionPolicy,
    selectedValue: null, selectedSource: null, conflictDetails: null,
  };

  if (valid.length === 0) {
    const firstUnknown = notAvailable.find(n => n.availability === 'unknown');
    const picked = firstUnknown || notAvailable[0] || null;
    return {
      ...makeField({
        rawValue: picked?.rawValue ?? null,
        normalizedValue: picked?.normalizedValue ?? null,
        sourceField: picked?.sourceField ?? null,
        availability: picked?.availability ?? 'unavailable',
        reason: picked?.reason || unavailableReason || `No verified source provides ${fieldName}.`,
        unit,
      }),
      ...base,
      sourceAgreement: 'unavailable',
    };
  }

  if (valid.length === 1) {
    const only = valid[0];
    return {
      ...makeField({ rawValue: only.rawValue, normalizedValue: only.normalizedValue, sourceField: only.sourceField, availability: 'available', reason: only.reason, unit }),
      ...base,
      selectedValue: only.normalizedValue, selectedSource: only.sourceField,
      sourceAgreement: 'single_source',
    };
  }

  const first = valid[0];
  const agree = valid.every(v => (
    tolerance === null
      ? v.normalizedValue === first.normalizedValue
      : typeof v.normalizedValue === 'number' && typeof first.normalizedValue === 'number' && Math.abs(v.normalizedValue - first.normalizedValue) <= tolerance
  ));

  if (agree) {
    return {
      ...makeField({ rawValue: first.rawValue, normalizedValue: first.normalizedValue, sourceField: valid.map(v => v.sourceField).join(' + '), availability: 'available', reason: `${valid.length} sources agree (${selectionPolicy}).`, unit }),
      ...base,
      selectedValue: first.normalizedValue, selectedSource: valid.map(v => v.sourceField).join(' + '),
      sourceAgreement: 'consistent',
    };
  }

  return {
    ...makeField({
      rawValue: null, normalizedValue: null,
      sourceField: valid.map(v => v.sourceField).join(' vs '),
      availability: 'conflict',
      reason: `Sources disagree on ${fieldName}; no value is selected and the value must not be compared.`,
      unit,
    }),
    ...base,
    sourceAgreement: 'conflict',
    conflictDetails: valid.map(v => ({ sourceField: v.sourceField, rawValue: v.rawValue, normalizedValue: v.normalizedValue })),
  };
}

/** Numeric normalizer factory. */
export function numericNormalizer(reason) {
  return (raw) => (typeof raw === 'number' && Number.isFinite(raw)
    ? { normalizedValue: raw, availability: 'available', reason }
    : { normalizedValue: null, availability: 'unavailable', reason: 'Absent or non-numeric value; absence is not 0.' });
}

/** Boolean normalizer factory. */
export function booleanNormalizer(reason) {
  return (raw) => (typeof raw === 'boolean'
    ? { normalizedValue: raw, availability: 'available', reason }
    : { normalizedValue: null, availability: 'unavailable', reason: 'Absent or non-boolean value; absence is not false.' });
}