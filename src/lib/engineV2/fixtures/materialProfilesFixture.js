import { BUILT_IN_MATERIAL_PROFILES, createMaterialProfileV2 } from '../technical/materialProfileModel.js';

export function createMaterialProfilesFixture() {
  return {
    builtIns: BUILT_IN_MATERIAL_PROFILES,
    custom: createMaterialProfileV2({ id: 'custom-stable-flat', name: 'Synthetic Custom Stable Flat', category: 'custom', stability: 'high', stretch: 'none', thickness: 'medium', surface: 'flat', defaultTatamiSpacingMm: 0.44, defaultSatinSpacingMm: 0.39, defaultRunningLengthMm: 2.1, pullCompensationScale: 0.95, underlayScale: 0.9, source: { fixture: 'synthetic_phase_7' }, metadata: { certified: false } }),
  };
}
