import { describe, expect, it } from 'vitest';
import { DEFAULT_END_TO_END_PIPELINE_CONFIG, resolveEndToEndPipelineConfig, validateEndToEndPipelineConfig } from '../orchestration/endToEndPipelineConfig.js';

describe('Phase 13A end-to-end pipeline configuration', () => {
  it.each(Object.entries(DEFAULT_END_TO_END_PIPELINE_CONFIG).filter(([key]) => key !== 'extras'))('defaults %s to its conservative value', (key, value) => expect(resolveEndToEndPipelineConfig()[key]).toBe(value));
  it('is valid by default', () => expect(validateEndToEndPipelineConfig().valid).toBe(true));
  it('freezes resolved configuration', () => expect(Object.isFrozen(resolveEndToEndPipelineConfig())).toBe(true));
  it('freezes extras', () => expect(Object.isFrozen(resolveEndToEndPipelineConfig().extras)).toBe(true));
  it('places unknown fields in extras', () => expect(resolveEndToEndPipelineConfig({ auditLabel: 'x' }).extras.auditLabel).toBe('x'));
  it('clones unknown nested fields', () => { const nested = { a: 1 }; const result = resolveEndToEndPipelineConfig({ nested }); nested.a = 2; expect(result.extras.nested.a).toBe(1); });
  it.each(['stopOnInvalidStage', 'stopOnPolicyBlockedBinary', 'requireStageValidation', 'requireCompleteStageCoverage', 'requireInputImmutability', 'preserveStageResults', 'preserveStageDiagnostics', 'preserveBinaryLimitations', 'allowSyntheticReferenceCapture', 'allowRealReferenceCapture', 'requireVerifiedRealProvenance', 'conservativeMode'])('rejects disabled invariant %s', key => expect(validateEndToEndPipelineConfig({ [key]: false }).errors.some(error => error.path === key)).toBe(true));
  it.each(['connectApplication', 'invokeBase44', 'createBrowserDownload', 'persistReferenceFixture'])('rejects enabled forbidden option %s', key => expect(validateEndToEndPipelineConfig({ [key]: true }).errors.some(error => error.path === key)).toBe(true));
  it.each(['image', 'imagePixels', 'canvas', 'base64Image', 'segmentation', 'vectorization', 'encoderConfig', 'trimPolicy', 'machineProfile'])('rejects forbidden root field %s', key => expect(validateEndToEndPipelineConfig({ [key]: true }).errors.some(error => error.path === `extras.${key}`)).toBe(true));
  it('treats null input as defaults', () => expect(resolveEndToEndPipelineConfig(null)).toEqual(DEFAULT_END_TO_END_PIPELINE_CONFIG));
  it('treats array input as defaults', () => expect(resolveEndToEndPipelineConfig([])).toEqual(DEFAULT_END_TO_END_PIPELINE_CONFIG));
});
