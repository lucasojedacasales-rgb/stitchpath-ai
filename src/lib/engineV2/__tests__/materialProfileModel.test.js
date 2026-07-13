import { describe, expect, it } from 'vitest';
import { BUILT_IN_MATERIAL_PROFILES, createMaterialProfileV2, resolveMaterialProfileV2, validateMaterialProfileV2 } from '../index.js';
import { createMaterialProfilesFixture } from '../fixtures/materialProfilesFixture.js';

describe('Phase 7 material profiles', () => {
  it.each(['generic_medium_woven', 'lightweight_woven', 'knit_stretch', 'heavy_woven', 'high_loft'])('provides valid built-in %s', id => { expect(BUILT_IN_MATERIAL_PROFILES[id].id).toBe(id); expect(validateMaterialProfileV2(BUILT_IN_MATERIAL_PROFILES[id]).valid).toBe(true); });
  it('marks built-ins as internal assumptions', () => expect(BUILT_IN_MATERIAL_PROFILES.generic_medium_woven.metadata.internalPlanningAssumption).toBe(true));
  it('does not claim certification', () => expect(BUILT_IN_MATERIAL_PROFILES.generic_medium_woven.source.certified).toBe(false));
  it('resolves a built-in by ID', () => expect(resolveMaterialProfileV2('knit_stretch')).toBe(BUILT_IN_MATERIAL_PROFILES.knit_stretch));
  it('returns null for unknown IDs', () => expect(resolveMaterialProfileV2('unknown')).toBeNull());
  it('validates an explicit custom profile', () => expect(validateMaterialProfileV2(createMaterialProfilesFixture().custom).valid).toBe(true));
  it('deeply freezes and clones custom profiles', () => { const input = { ...createMaterialProfilesFixture().custom, metadata: { test: true } }; const value = createMaterialProfileV2(input); input.metadata.test = false; expect(value.metadata.test).toBe(true); expect(Object.isFrozen(value)).toBe(true); });
  it.each([['category', 'invalid'], ['stability', 'invalid'], ['stretch', 'invalid'], ['thickness', 'invalid'], ['surface', 'invalid']])('rejects invalid %s', (field, value) => { const profile = { ...createMaterialProfilesFixture().custom, [field]: value }; expect(validateMaterialProfileV2(profile).valid).toBe(false); });
  it.each(['defaultTatamiSpacingMm', 'defaultSatinSpacingMm', 'defaultRunningLengthMm', 'pullCompensationScale', 'underlayScale'])('rejects invalid %s', field => { const profile = { ...createMaterialProfilesFixture().custom, [field]: -1 }; expect(validateMaterialProfileV2(profile).errors.some(item => item.code === 'INVALID_MATERIAL_NUMERIC_VALUE')).toBe(true); });
  it.each(['machineProfile', 'hoopLimits', 'encoder', 'ce01'])('rejects forbidden material field %s', field => expect(validateMaterialProfileV2({ ...createMaterialProfilesFixture().custom, [field]: {} }).errors.some(item => item.code === 'FORBIDDEN_MATERIAL_FIELD')).toBe(true));
});
