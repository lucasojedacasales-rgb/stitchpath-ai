import { describe, expect, it } from 'vitest';
import { fingerprintEngineV2Value, stableSerializeEngineV2Value } from '../orchestration/deterministicStageFingerprint.js';

describe('Phase 13A deterministic stage fingerprints', () => {
  const equivalentPairs = [
    [{ b: 2, a: 1 }, { a: 1, b: 2 }],
    [{ nested: { z: 1, a: 2 } }, { nested: { a: 2, z: 1 } }],
    [{ value: -0 }, { value: 0 }],
    [new Uint8Array([0, 1, 255]), new Uint8Array([0, 1, 255])],
    [{ value: 12n }, { value: BigInt('12') }],
    [{ value: undefined }, { value: undefined }],
  ];
  it.each(equivalentPairs)('serializes equivalent value %# deterministically', (left, right) => expect(stableSerializeEngineV2Value(left)).toBe(stableSerializeEngineV2Value(right)));
  it.each(equivalentPairs)('fingerprints equivalent value %# deterministically', (left, right) => expect(fingerprintEngineV2Value(left)).toBe(fingerprintEngineV2Value(right)));

  const distinctPairs = [
    [[1, 2], [2, 1]],
    [{ a: 1 }, { a: 2 }],
    [new Uint8Array([1]), new Uint8Array([2])],
    [{ a: null }, { a: undefined }],
    [{ a: false }, { a: 0 }],
    [{ a: '1' }, { a: 1 }],
  ];
  it.each(distinctPairs)('preserves meaningful distinction %#', (left, right) => expect(fingerprintEngineV2Value(left)).not.toBe(fingerprintEngineV2Value(right)));
  it.each([null, true, false, 0, -0, 1.25, 'phase13a', [], {}, new Uint8Array()])('returns hexadecimal fingerprint for value %#', value => expect(fingerprintEngineV2Value(value)).toMatch(/^[0-9a-f]{8}$/));
  it('rejects functions', () => expect(() => stableSerializeEngineV2Value(() => {})).toThrow('ENGINE_V2_FINGERPRINT_FUNCTION_UNSUPPORTED'));
  it('rejects symbols', () => expect(() => stableSerializeEngineV2Value(Symbol('x'))).toThrow('ENGINE_V2_FINGERPRINT_SYMBOL_UNSUPPORTED'));
  it('rejects direct circular input', () => { const value = {}; value.self = value; expect(() => stableSerializeEngineV2Value(value)).toThrow('ENGINE_V2_FINGERPRINT_CIRCULAR_INPUT'); });
  it('rejects nested circular input', () => { const value = { child: {} }; value.child.parent = value; expect(() => stableSerializeEngineV2Value(value)).toThrow('ENGINE_V2_FINGERPRINT_CIRCULAR_INPUT'); });
  it('preserves array order in serialization', () => expect(stableSerializeEngineV2Value([3, 2, 1])).toBe('[3,2,1]'));
  it('sorts recursive object keys', () => expect(stableSerializeEngineV2Value({ z: { y: 2, a: 1 }, a: 0 })).toBe('{"a":0,"z":{"a":1,"y":2}}'));
  it('labels byte arrays explicitly', () => expect(stableSerializeEngineV2Value(new Uint8Array([4, 5]))).toContain('Uint8Array'));
  it('does not label the fingerprint as SHA-256', () => expect(fingerprintEngineV2Value({ a: 1 })).toHaveLength(8));
});
