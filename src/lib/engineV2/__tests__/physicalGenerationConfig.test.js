import { describe, expect, it } from 'vitest';
import { DEFAULT_PHYSICAL_GENERATION_CONFIG, PHYSICAL_GENERATION_PROFILES, resolvePhysicalGenerationConfig, validatePhysicalGenerationConfig } from '../stitchGeneration/physicalGenerationConfig.js';

describe('Phase 9 physical generation config', () => {
  it('defaults to balanced', () => expect(DEFAULT_PHYSICAL_GENERATION_CONFIG.profile).toBe('balanced'));
  it('defines all three profiles', () => expect(PHYSICAL_GENERATION_PROFILES).toEqual(['fast', 'balanced', 'detailed']));
  it('includes physical underlay by default', () => expect(DEFAULT_PHYSICAL_GENERATION_CONFIG.includePhysicalUnderlay).toBe(true));
  it('includes top stitches by default', () => expect(DEFAULT_PHYSICAL_GENERATION_CONFIG.includeTopStitches).toBe(true));
  it('preserves sequence by default', () => expect(DEFAULT_PHYSICAL_GENERATION_CONFIG.preserveGlobalSequence).toBe(true));
  it('preserves thread blocks by default', () => expect(DEFAULT_PHYSICAL_GENERATION_CONFIG.preserveThreadBlocks).toBe(true));
  it('has no hidden 12000 point cap', () => expect(DEFAULT_PHYSICAL_GENERATION_CONFIG.maximumPointsPerObject).toBe(500000));
  it('uses a two-million total point limit', () => expect(DEFAULT_PHYSICAL_GENERATION_CONFIG.maximumTotalPoints).toBe(2000000));
  it('keeps canonical commands disabled', () => expect(DEFAULT_PHYSICAL_GENERATION_CONFIG.generateCanonicalCommands).toBe(false));
  it.each(['generateJumpCommands', 'generateTrimCommands', 'generateColorChangeCommands', 'machineAdaptation', 'encoding'])('keeps %s disabled', field => expect(DEFAULT_PHYSICAL_GENERATION_CONFIG[field]).toBe(false));
  it('retains unknown fields in extras', () => expect(resolvePhysicalGenerationConfig({ future: 4 }).extras.future).toBe(4));
  it('applies fast precision', () => expect(resolvePhysicalGenerationConfig({ profile: 'fast' }).coordinatePrecisionDecimals).toBe(5));
  it('applies detailed precision', () => expect(resolvePhysicalGenerationConfig({ profile: 'detailed' }).coordinatePrecisionDecimals).toBe(7));
  it.each(['maximumPointsPerObject', 'maximumTotalPoints', 'maximumScanlinesPerObject', 'coordinatePrecisionDecimals'])('rejects non-positive integer %s', field => expect(validatePhysicalGenerationConfig(resolvePhysicalGenerationConfig({ [field]: 0 })).valid).toBe(false));
  it('rejects command generation', () => expect(validatePhysicalGenerationConfig(resolvePhysicalGenerationConfig({ generateJumpCommands: true })).valid).toBe(false));
  it('accepts the default config', () => expect(validatePhysicalGenerationConfig(resolvePhysicalGenerationConfig()).valid).toBe(true));
});
