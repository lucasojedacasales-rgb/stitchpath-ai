/**
 * sanitizePipelineResult.js — Hatch Lab / baselines / A_WIDTHS (P0.3B)
 *
 * Pure conversion of a real pipeline context into plain, serializable data.
 * No engine imports, no rounding, no reordering, no field renaming.
 *
 * Non-serializable material (functions, DOM nodes, blobs, typed arrays, pixel
 * buffers, circular references) is dropped and reported in `omittedFields`.
 * Region fields listed in PRESERVED_REGION_FIELDS are never removed.
 */

import { CAPTURED_CONTEXT_KEYS, PRESERVED_REGION_FIELDS } from './baselineSchema.js';

const isPlainObject = v => !!v && typeof v === 'object' && !Array.isArray(v);

const DROP_REASONS = {
  function: 'function (not serializable)',
  dom: 'DOM node (not serializable)',
  blob: 'Blob / File (binary, not serializable)',
  typedArray: 'typed array / pixel buffer (excluded by policy)',
  circular: 'circular reference',
  symbol: 'symbol (not serializable)',
  bigint: 'bigint (not serializable)',
};

function classify(value) {
  if (typeof value === 'function') return 'function';
  if (typeof value === 'symbol') return 'symbol';
  if (typeof value === 'bigint') return 'bigint';
  if (!value || typeof value !== 'object') return null;
  if (typeof Node !== 'undefined' && value instanceof Node) return 'dom';
  if (typeof Blob !== 'undefined' && value instanceof Blob) return 'blob';
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return 'typedArray';
  return null;
}

/**
 * Deep, order-preserving clone of serializable data.
 * @returns {{ value: *, omitted: Array<{path:string, reason:string}> }}
 */
export function sanitizeValue(input, rootPath = '') {
  const omitted = [];
  const seen = new WeakSet();

  const walk = (value, path) => {
    const dropReason = classify(value);
    if (dropReason) {
      omitted.push({ path, reason: DROP_REASONS[dropReason] });
      return undefined;
    }
    if (value === null || typeof value !== 'object') {
      return typeof value === 'number' && !Number.isFinite(value) ? null : value;
    }
    if (seen.has(value)) {
      omitted.push({ path, reason: DROP_REASONS.circular });
      return undefined;
    }
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((item, index) => {
        const out = walk(item, `${path}[${index}]`);
        return out === undefined ? null : out;
      });
    }
    const out = {};
    for (const key of Object.keys(value)) {
      const child = walk(value[key], path ? `${path}.${key}` : key);
      if (child !== undefined) out[key] = child;
    }
    return out;
  };

  return { value: walk(input, rootPath), omitted };
}

/**
 * Builds the plain snapshot of a real pipeline context.
 * @param {Object} ctx  the object returned by runPipeline
 * @returns {{ snapshot: Object, omittedFields: Array, missingContextKeys: string[], preservedRegionFieldReport: Object }}
 */
export function sanitizePipelineResult(ctx) {
  if (!isPlainObject(ctx)) {
    return {
      snapshot: {},
      omittedFields: [{ path: '(root)', reason: 'pipeline context is not an object' }],
      missingContextKeys: [...CAPTURED_CONTEXT_KEYS],
      preservedRegionFieldReport: {},
    };
  }

  const snapshot = {};
  const omittedFields = [];
  const missingContextKeys = [];

  for (const key of CAPTURED_CONTEXT_KEYS) {
    if (!(key in ctx) || ctx[key] === undefined) { missingContextKeys.push(key); continue; }
    const { value, omitted } = sanitizeValue(ctx[key], key);
    snapshot[key] = value;
    omittedFields.push(...omitted);
  }

  // imageUrl is captured explicitly: it is the real engine input, never a secret.
  if (typeof ctx.imageUrl === 'string') snapshot.imageUrl = ctx.imageUrl;

  // Report which preserved region fields actually exist in the captured regions.
  const regions = Array.isArray(snapshot.regions) ? snapshot.regions : [];
  const preservedRegionFieldReport = {};
  for (const field of PRESERVED_REGION_FIELDS) {
    preservedRegionFieldReport[field] = regions.filter(r => isPlainObject(r) && r[field] !== undefined).length;
  }

  return { snapshot, omittedFields, missingContextKeys, preservedRegionFieldReport };
}