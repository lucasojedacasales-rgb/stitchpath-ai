import { describe, expect, it } from 'vitest';
import { DEFAULT_DST_FORMAT_CONFIG, resolveDSTFormatConfig, validateDSTFormatConfig } from '../formatAdaptation/dstFormatConfig.js';

describe('Phase 12B DST format configuration', () => {
  const expected = {
    format: 'DST', requiredCoordinateResolutionMm: 0.1, maximumDeltaUnits: 121, zeroDeltaStitchPolicy: 'encode_penetration',
    zeroDeltaJumpPolicy: 'explicit_no_output', trimPolicy: 'legacy_three_zero_jumps', requireFinalEnd: true,
    requireImplicitInitialColor: true, preserveSourceOrder: true, preserveThreadBlockOrder: true, preserveThreadIds: true,
    preserveTrimIntent: true, allowPartialAdapterOutput: false, allowPartialBinaryOutput: false, invokeExistingDSTEncoder: true,
    invokeDSBEncoder: false, connectApplication: false, CE01ArtworkLogic: false, conservativeMode: true,
  };
  it.each(Object.entries(expected))('defaults %s', (key, value) => expect(resolveDSTFormatConfig()[key]).toBe(value));
  it('validates defaults', () => expect(validateDSTFormatConfig({}).valid).toBe(true));
  it('freezes resolved config', () => expect(Object.isFrozen(resolveDSTFormatConfig())).toBe(true));
  it('captures unknown fields in extras', () => expect(resolveDSTFormatConfig({ future: 7 }).extras.future).toBe(7));
  it('does not retain unknown root fields', () => expect(resolveDSTFormatConfig({ future: 7 }).future).toBeUndefined());
  it.each([
    ['format', 'DSB'], ['requiredCoordinateResolutionMm', 1], ['maximumDeltaUnits', 127], ['zeroDeltaStitchPolicy', 'drop'],
    ['zeroDeltaJumpPolicy', 'encode'], ['trimPolicy', 'ignore'], ['requireFinalEnd', false], ['requireImplicitInitialColor', false],
    ['preserveSourceOrder', false], ['preserveThreadBlockOrder', false], ['preserveThreadIds', false], ['preserveTrimIntent', false],
    ['allowPartialAdapterOutput', true], ['allowPartialBinaryOutput', true], ['invokeExistingDSTEncoder', false], ['invokeDSBEncoder', true],
    ['connectApplication', true], ['CE01ArtworkLogic', true], ['conservativeMode', false], ['label', ''],
  ])('rejects unsafe setting %s=%s', (key, value) => expect(validateDSTFormatConfig({ [key]: value }).valid).toBe(false));
  it.each(['encode_penetration', 'block'])('accepts zero stitch policy %s', policy => expect(validateDSTFormatConfig({ zeroDeltaStitchPolicy: policy }).valid).toBe(true));
  it.each(['explicit_no_output', 'block'])('accepts zero jump policy %s', policy => expect(validateDSTFormatConfig({ zeroDeltaJumpPolicy: policy }).valid).toBe(true));
  it.each(['legacy_three_zero_jumps', 'block'])('accepts trim policy %s', policy => expect(validateDSTFormatConfig({ trimPolicy: policy }).valid).toBe(true));
  it('keeps default object unchanged', () => expect(DEFAULT_DST_FORMAT_CONFIG.maximumDeltaUnits).toBe(121));
});

