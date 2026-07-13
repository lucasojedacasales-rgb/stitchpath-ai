import { describe, expect, it } from 'vitest';
import { DEFAULT_REFERENCE_CAPTURE_CONFIG, resolveReferenceCaptureConfig, validateReferenceCaptureConfig } from '../referenceCapture/referenceCaptureConfig.js';

describe('Phase 13A reference-capture configuration', () => {
  it.each(Object.entries(DEFAULT_REFERENCE_CAPTURE_CONFIG).filter(([key]) => key !== 'extras'))('defaults %s conservatively', (key, value) => expect(resolveReferenceCaptureConfig()[key]).toBe(value));
  it('validates defaults', () => expect(validateReferenceCaptureConfig().valid).toBe(true));
  it('freezes resolved config', () => expect(Object.isFrozen(resolveReferenceCaptureConfig())).toBe(true));
  it('freezes extras', () => expect(Object.isFrozen(resolveReferenceCaptureConfig().extras)).toBe(true));
  it('collects unknown extras', () => expect(resolveReferenceCaptureConfig({ label: 'x' }).extras.label).toBe('x'));
  it.each(['allowSyntheticCapture', 'allowRealCapture', 'requireVerifiedRealProvenance', 'conservativeMode'])('rejects disabled invariant %s', key => expect(validateReferenceCaptureConfig({ [key]: false }).valid).toBe(false));
  it.each(['allowPhysicalMachineAcceptance', 'persistFixture'])('rejects enabled forbidden option %s', key => expect(validateReferenceCaptureConfig({ [key]: true }).valid).toBe(false));
  it('treats null as defaults', () => expect(resolveReferenceCaptureConfig(null)).toEqual(DEFAULT_REFERENCE_CAPTURE_CONFIG));
  it('treats array as defaults', () => expect(resolveReferenceCaptureConfig([])).toEqual(DEFAULT_REFERENCE_CAPTURE_CONFIG));
});
