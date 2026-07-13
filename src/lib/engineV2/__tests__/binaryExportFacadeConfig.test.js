import { describe, expect, it } from 'vitest';
import { DEFAULT_BINARY_EXPORT_FACADE_CONFIG, resolveBinaryExportFacadeConfig, validateBinaryExportFacadeConfig } from '../formatAdaptation/binaryExportFacadeConfig.js';

describe('Phase 12D binary export facade configuration', () => {
  const truthy = ['requireExplicitFormat', 'requireAcceptedBinary', 'allowBlockedResult', 'cloneBinaryBytes', 'preserveFormatResult', 'preserveFormatWarnings', 'preserveFormatLimitations', 'conservativeMode'];
  const falsy = ['allowFormatFallback', 'allowCrossFormatInvocation', 'connectApplication', 'connectExportModal', 'invokeBase44', 'createBrowserDownload'];
  it.each(truthy)('defaults %s to true', key => expect(DEFAULT_BINARY_EXPORT_FACADE_CONFIG[key]).toBe(true));
  it.each(falsy)('defaults %s to false', key => expect(DEFAULT_BINARY_EXPORT_FACADE_CONFIG[key]).toBe(false));
  it('freezes default configuration', () => expect(Object.isFrozen(DEFAULT_BINARY_EXPORT_FACADE_CONFIG)).toBe(true));
  it('resolves empty configuration as valid', () => expect(validateBinaryExportFacadeConfig({}).valid).toBe(true));
  it('keeps unknown fields in extras', () => expect(resolveBinaryExportFacadeConfig({ custom: { enabled: true } }).extras.custom).toEqual({ enabled: true }));
  it('merges explicit extras', () => expect(resolveBinaryExportFacadeConfig({ extras: { custom: 1 }, second: 2 }).extras).toEqual({ custom: 1, second: 2 }));
  it('does not retain unknown fields at root', () => expect(resolveBinaryExportFacadeConfig({ custom: true })).not.toHaveProperty('custom'));
  it('freezes resolved configuration', () => expect(Object.isFrozen(resolveBinaryExportFacadeConfig())).toBe(true));
  it('freezes resolved extras', () => expect(Object.isFrozen(resolveBinaryExportFacadeConfig().extras)).toBe(true));
  it.each(truthy)('rejects disabled conservative invariant %s', key => { const validation = validateBinaryExportFacadeConfig({ [key]: false }); expect(validation.valid).toBe(false); expect(validation.errors[0].code).toBe('BINARY_FACADE_CONSERVATIVE_INVARIANT_REQUIRED'); });
  it.each(falsy)('rejects enabled forbidden option %s', key => { const validation = validateBinaryExportFacadeConfig({ [key]: true }); expect(validation.valid).toBe(false); expect(validation.errors[0].code).toBe('BINARY_FACADE_FORBIDDEN_OPTION_ENABLED'); });
  it.each(['trimPolicy', 'trimNoOutputAcknowledgement', 'zeroDeltaStitchPolicy', 'zeroDeltaJumpPolicy', 'machineProfile', 'encoderConfig', 'maximumDeltaUnits'])('rejects format policy %s at facade root', key => { const validation = validateBinaryExportFacadeConfig({ [key]: 'forbidden' }); expect(validation.valid).toBe(false); expect(validation.errors[0].code).toBe('BINARY_FACADE_FORMAT_POLICY_AT_ROOT'); });
  it('returns no warnings for valid configuration', () => expect(validateBinaryExportFacadeConfig({}).warnings).toEqual([]));
  it('preserves format policy inside unrelated nested extras without interpreting it', () => expect(validateBinaryExportFacadeConfig({ custom: { trimPolicy: 'opaque' } }).valid).toBe(true));
});
