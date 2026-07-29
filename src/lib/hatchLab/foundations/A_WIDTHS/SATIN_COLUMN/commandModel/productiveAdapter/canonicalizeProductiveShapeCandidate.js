/**
 * Deterministic canonical form and hash for a P1.F2 shape candidate.
 *
 * Numbers retain JavaScript/JSON full precision. No rounding or quantization is
 * applied. Arrays retain order; object keys are sorted during serialization.
 */

import { canonicalStringify, fnv1a32 } from '../canonicalizeLabSatinCommands.js';
import { PRODUCTIVE_ADAPTER_HASH_EXCLUDED_KEYS } from './adapterSchema.js';

function cloneCanonicalValue(value) {
  if (Array.isArray(value)) return value.map(cloneCanonicalValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = cloneCanonicalValue(value[key]);
    }
    return out;
  }
  return value;
}

export function canonicalizeProductiveShapeCandidate(candidate) {
  const out = {};
  for (const key of Object.keys(candidate || {}).sort()) {
    if (PRODUCTIVE_ADAPTER_HASH_EXCLUDED_KEYS.includes(key)) continue;
    if (candidate[key] !== undefined) out[key] = cloneCanonicalValue(candidate[key]);
  }
  return out;
}

export function computeProductiveAdapterHash(candidate) {
  const canonical = canonicalStringify(canonicalizeProductiveShapeCandidate(candidate));
  return `fnv1a32:${fnv1a32(canonical)}`;
}

export const PRODUCTIVE_ADAPTER_CANONICALISATION_PROCEDURE =
  'exclude productiveAdapterHash/fixtureSha256/generatedAt; sort object keys recursively; preserve array order and full-precision JSON numbers; FNV-1a 32-bit uppercase';
