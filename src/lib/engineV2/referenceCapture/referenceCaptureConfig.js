const KNOWN = Object.freeze(['allowSyntheticCapture', 'allowRealCapture', 'requireVerifiedRealProvenance', 'allowPhysicalMachineAcceptance', 'persistFixture', 'conservativeMode']);
export const DEFAULT_REFERENCE_CAPTURE_CONFIG = Object.freeze({
  allowSyntheticCapture: true,
  allowRealCapture: true,
  requireVerifiedRealProvenance: true,
  allowPhysicalMachineAcceptance: false,
  persistFixture: false,
  conservativeMode: true,
  extras: Object.freeze({}),
});

export function resolveReferenceCaptureConfig(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const extras = { ...(source.extras || {}) };
  Object.entries(source).forEach(([key, value]) => { if (!KNOWN.includes(key) && key !== 'extras') extras[key] = structuredClone(value); });
  return Object.freeze({ ...DEFAULT_REFERENCE_CAPTURE_CONFIG, ...Object.fromEntries(KNOWN.filter(key => Object.hasOwn(source, key)).map(key => [key, source[key]])), extras: Object.freeze(extras) });
}

const issue = (code, path, message) => ({ code, path, message });
export function validateReferenceCaptureConfig(input = {}) {
  const config = resolveReferenceCaptureConfig(input); const errors = [];
  ['allowSyntheticCapture', 'allowRealCapture', 'requireVerifiedRealProvenance', 'conservativeMode'].forEach(key => { if (config[key] !== true) errors.push(issue('REFERENCE_CAPTURE_CONSERVATIVE_INVARIANT_REQUIRED', key, `${key} must remain true.`)); });
  ['allowPhysicalMachineAcceptance', 'persistFixture'].forEach(key => { if (config[key] !== false) errors.push(issue('REFERENCE_CAPTURE_FORBIDDEN_OPTION_ENABLED', key, `${key} must remain false in Phase 13A.`)); });
  return { valid: errors.length === 0, config, errors, warnings: [] };
}
