/**
 * canonicalizeLabSatinCommands.js — deterministic canonical form + hash.
 *
 * Procedure (documented so it can be reproduced by hand):
 *  1. Drop the keys in HASH_EXCLUDED_KEYS (the hash itself and any variable
 *     timestamp / fixture bookkeeping) from the envelope.
 *  2. Serialize with keys sorted lexicographically at every depth; numbers are
 *     emitted with JSON's own representation (no rounding, no quantization).
 *  3. Hash the resulting UTF-8 string with FNV-1a 32-bit and format it as
 *     'fnv1a32:XXXXXXXX' (uppercase hex, 8 digits) — the same primitive already
 *     used by extractStraightColumnFixture for polygon hashes, so the lab needs
 *     no new dependency and works identically in the browser.
 */

import { HASH_EXCLUDED_KEYS, CANONICAL_COMMAND_FIELDS } from './commandModelSchema.js';

export function fnv1a32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).toUpperCase().padStart(8, '0');
}

/** Stable stringify: sorted keys, arrays kept in order. */
export function canonicalStringify(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return `"${String(value)}"`;
  return JSON.stringify(value === undefined ? null : value);
}

/** Returns a new command object with the canonical field order. */
export function canonicalizeCommand(command) {
  const out = {};
  for (const key of CANONICAL_COMMAND_FIELDS) {
    if (command[key] !== undefined) out[key] = Array.isArray(command[key]) ? [...command[key]] : command[key];
  }
  return out;
}

/** Envelope → canonical (hashable) plain object. Never mutates the input. */
export function canonicalizeLabSatinCommands(model) {
  const clone = {};
  for (const key of Object.keys(model)) {
    if (HASH_EXCLUDED_KEYS.includes(key)) continue;
    clone[key] = key === 'commands' ? model.commands.map(canonicalizeCommand) : model[key];
  }
  return clone;
}

export function computeCommandModelHash(model) {
  return `fnv1a32:${fnv1a32(canonicalStringify(canonicalizeLabSatinCommands(model)))}`;
}