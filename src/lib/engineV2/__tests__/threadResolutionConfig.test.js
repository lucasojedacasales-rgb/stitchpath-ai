import { describe, expect, it } from 'vitest';
import { DEFAULT_THREAD_RESOLUTION_CONFIG, resolveThreadResolutionConfig, validateThreadResolutionConfig } from '../index.js';

describe('Phase 6 thread resolution config', () => {
  it('uses artwork_exact by default', () => expect(resolveThreadResolutionConfig().policy).toBe('artwork_exact'));
  it('matches every documented default', () => expect(resolveThreadResolutionConfig()).toMatchObject(DEFAULT_THREAD_RESOLUTION_CONFIG));
  it('clones supplied catalogs', () => { const input = { catalog: [{ id: 'x' }] }; const config = resolveThreadResolutionConfig(input); input.catalog[0].id = 'changed'; expect(config.catalog[0].id).toBe('x'); });
  it('preserves unknown fields in extras', () => expect(resolveThreadResolutionConfig({ futureOption: 7 }).extras.futureOption).toBe(7));
  it('accepts artwork exact without a catalog', () => expect(validateThreadResolutionConfig({ policy: 'artwork_exact' }).valid).toBe(true));
  it.each(['catalog_exact', 'catalog_nearest'])('requires a catalog for %s', policy => expect(validateThreadResolutionConfig({ policy }).errors.some(item => item.code === 'THREAD_CATALOG_REQUIRED')).toBe(true));
  it('rejects an invalid policy', () => expect(validateThreadResolutionConfig({ policy: 'automatic' }).errors.some(item => item.code === 'INVALID_THREAD_RESOLUTION_POLICY')).toBe(true));
  it.each([-1, NaN, Infinity, '6'])('rejects invalid Delta E threshold %j', maximumAcceptedDeltaE => expect(validateThreadResolutionConfig({ maximumAcceptedDeltaE }).errors.some(item => item.code === 'INVALID_MAXIMUM_DELTA_E')).toBe(true));
  it('accepts zero Delta E threshold', () => expect(validateThreadResolutionConfig({ maximumAcceptedDeltaE: 0 }).valid).toBe(true));
  it('rejects an unknown formula', () => expect(validateThreadResolutionConfig({ colorDifferenceFormula: 'rgb' }).errors.some(item => item.code === 'INVALID_COLOR_DIFFERENCE_FORMULA')).toBe(true));
  it('accepts both supported formulas', () => { expect(validateThreadResolutionConfig({ colorDifferenceFormula: 'cie76' }).valid).toBe(true); expect(validateThreadResolutionConfig({ colorDifferenceFormula: 'ciede2000' }).valid).toBe(true); });
  it('rejects nondeterministic tie policy', () => expect(validateThreadResolutionConfig({ deterministicTieBreak: 'random' }).valid).toBe(false));
});
