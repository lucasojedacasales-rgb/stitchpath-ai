import { describe, expect, it } from 'vitest';
import { canonicalCommandId } from '../commandCompilation/canonicalCommandId.js';

describe('Phase 10 canonical command identifiers', () => {
  it('formats the first command', () => expect(canonicalCommandId(0, 'jump')).toBe('canonical-command:00000000:jump'));
  it('formats stitch ids', () => expect(canonicalCommandId(12, 'stitch')).toBe('canonical-command:00000012:stitch'));
  it('formats trim ids', () => expect(canonicalCommandId(3, 'trim')).toBe('canonical-command:00000003:trim'));
  it('formats color-change ids', () => expect(canonicalCommandId(4, 'colorChange')).toBe('canonical-command:00000004:colorChange'));
  it('formats end ids', () => expect(canonicalCommandId(999, 'end')).toBe('canonical-command:00000999:end'));
  it('uses stable lexical padding', () => expect(canonicalCommandId(2, 'stitch') < canonicalCommandId(10, 'stitch')).toBe(true));
  it('is deterministic', () => expect(canonicalCommandId(123, 'jump')).toBe(canonicalCommandId(123, 'jump')));
  it('contains no timestamp', () => expect(canonicalCommandId(1, 'stitch')).not.toMatch(/202|time/i));
  it('contains no random component', () => expect(canonicalCommandId(1, 'stitch')).toBe('canonical-command:00000001:stitch'));
  it('supports large command indexes', () => expect(canonicalCommandId(12345678, 'stitch')).toContain('12345678'));
  it('rejects negative indexes', () => expect(() => canonicalCommandId(-1, 'stitch')).toThrow());
  it('rejects fractional indexes', () => expect(() => canonicalCommandId(1.5, 'stitch')).toThrow());
  it('rejects NaN indexes', () => expect(() => canonicalCommandId(NaN, 'stitch')).toThrow());
  it('rejects missing types', () => expect(() => canonicalCommandId(1)).toThrow());
  it('rejects empty types', () => expect(() => canonicalCommandId(1, '')).toThrow());
  it.each(['stitch', 'jump', 'trim', 'colorChange', 'end'])('retains command type %s', type => expect(canonicalCommandId(7, type).endsWith(`:${type}`)).toBe(true));
  it('keeps indexes distinct', () => expect(new Set([canonicalCommandId(0, 'stitch'), canonicalCommandId(1, 'stitch')]).size).toBe(2));
  it('keeps types distinct at one index', () => expect(new Set([canonicalCommandId(0, 'stitch'), canonicalCommandId(0, 'jump')]).size).toBe(2));
});
