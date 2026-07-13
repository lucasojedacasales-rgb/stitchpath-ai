import { describe, expect, it } from 'vitest';
import { DEFAULT_DSB_FORMAT_CONFIG, resolveDSBFormatConfig, validateDSBFormatConfig } from '../formatAdaptation/dsbFormatConfig.js';

describe('Phase 12C DSB format configuration', () => {
  it.each(Object.entries({
    format: 'DSB', requiredCoordinateResolutionMm: 0.1, maximumDeltaUnits: 127, zeroDeltaStitchPolicy: 'encode_penetration',
    zeroDeltaJumpPolicy: 'explicit_no_output', trimPolicy: 'block', trimNoOutputAcknowledgement: null, requireFinalEnd: true,
    requireImplicitInitialColor: true, preserveSourceOrder: true, preserveThreadBlockOrder: true, preserveThreadIds: true,
    preserveTrimLineage: true, allowPartialAdapterOutput: false, allowPartialBinaryOutput: false, invokeExistingDSBLowLevelEncoder: true,
    invokeDSTEncoder: false, invokeBase44: false, connectApplication: false, CE01ArtworkLogic: false, conservativeMode: true,
  }))('defaults %s to the required value', (key, value) => expect(DEFAULT_DSB_FORMAT_CONFIG[key]).toBe(value));
  it.each([
    ['format', 'DST', 'DSB_FORMAT_REQUIRED'], ['requiredCoordinateResolutionMm', 1, 'DSB_RESOLUTION_MUST_BE_POINT_ONE'],
    ['maximumDeltaUnits', 126, 'DSB_MAXIMUM_DELTA_MUST_BE_127'], ['zeroDeltaStitchPolicy', 'drop', 'INVALID_DSB_ZERO_STITCH_POLICY'],
    ['zeroDeltaJumpPolicy', 'encode', 'INVALID_DSB_ZERO_JUMP_POLICY'], ['trimPolicy', 'encode', 'INVALID_DSB_TRIM_POLICY'],
    ['requireFinalEnd', false, 'DSB_CONSERVATIVE_INVARIANT_REQUIRED'], ['requireImplicitInitialColor', false, 'DSB_CONSERVATIVE_INVARIANT_REQUIRED'],
    ['preserveSourceOrder', false, 'DSB_CONSERVATIVE_INVARIANT_REQUIRED'], ['preserveThreadBlockOrder', false, 'DSB_CONSERVATIVE_INVARIANT_REQUIRED'],
    ['preserveThreadIds', false, 'DSB_CONSERVATIVE_INVARIANT_REQUIRED'], ['preserveTrimLineage', false, 'DSB_CONSERVATIVE_INVARIANT_REQUIRED'],
    ['allowPartialAdapterOutput', true, 'DSB_FORBIDDEN_OPTION_ENABLED'], ['allowPartialBinaryOutput', true, 'DSB_FORBIDDEN_OPTION_ENABLED'],
    ['invokeDSTEncoder', true, 'DSB_FORBIDDEN_OPTION_ENABLED'], ['invokeBase44', true, 'DSB_FORBIDDEN_OPTION_ENABLED'],
    ['connectApplication', true, 'DSB_FORBIDDEN_OPTION_ENABLED'], ['CE01ArtworkLogic', true, 'DSB_FORBIDDEN_OPTION_ENABLED'],
  ])('rejects unsafe %s configuration', (key, value, code) => expect(validateDSBFormatConfig({ [key]: value }).errors.some(error => error.code === code)).toBe(true));
  it('requires acknowledgement for trim no-output', () => expect(validateDSBFormatConfig({ trimPolicy: 'explicit_no_output' }).errors.some(error => error.code === 'DSB_TRIM_ACKNOWLEDGEMENT_REQUIRED')).toBe(true));
  it.each(['acknowledged', 'physical trim is not encoded', 'operator accepts zero output'])('accepts non-empty acknowledgement %s', acknowledgement => expect(validateDSBFormatConfig({ trimPolicy: 'explicit_no_output', trimNoOutputAcknowledgement: acknowledgement }).valid).toBe(true));
  it('retains acknowledgement verbatim', () => { const text = '  exact acknowledgement  '; expect(resolveDSBFormatConfig({ trimPolicy: 'explicit_no_output', trimNoOutputAcknowledgement: text }).trimNoOutputAcknowledgement).toBe(text); });
  it('moves unknown fields into extras', () => expect(resolveDSBFormatConfig({ experimental: { enabled: true } }).extras.experimental.enabled).toBe(true));
  it('freezes resolved config', () => expect(Object.isFrozen(resolveDSBFormatConfig())).toBe(true));
});
