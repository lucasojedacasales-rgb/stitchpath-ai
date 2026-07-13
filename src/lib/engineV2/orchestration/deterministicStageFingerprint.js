function normalize(value, seen) {
  if (typeof value === 'function') throw new TypeError('ENGINE_V2_FINGERPRINT_FUNCTION_UNSUPPORTED');
  if (typeof value === 'symbol') throw new TypeError('ENGINE_V2_FINGERPRINT_SYMBOL_UNSUPPORTED');
  if (typeof value === 'number') return Object.is(value, -0) ? 0 : value;
  if (typeof value === 'bigint') return { $type: 'BigInt', value: value.toString() };
  if (value === undefined) return { $type: 'Undefined' };
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) throw new TypeError('ENGINE_V2_FINGERPRINT_CIRCULAR_INPUT');
  if (value instanceof Uint8Array) return { $type: 'Uint8Array', values: [...value] };
  if (typeof Blob !== 'undefined' && value instanceof Blob) return { $type: 'Blob', size: value.size, mimeType: value.type };
  seen.add(value);
  let normalized;
  if (Array.isArray(value)) normalized = value.map(item => normalize(item, seen));
  else normalized = Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key], seen)]));
  seen.delete(value);
  return normalized;
}

export function stableSerializeEngineV2Value(value) {
  return JSON.stringify(normalize(value, new WeakSet()));
}

export function fingerprintEngineV2Value(value) {
  const text = stableSerializeEngineV2Value(value);
  let hash = 0x811C9DC5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
