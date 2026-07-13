const KNOWN_FIELDS = Object.freeze([
  'stopOnInvalidStage', 'stopOnPolicyBlockedBinary', 'requireStageValidation', 'requireCompleteStageCoverage',
  'requireInputImmutability', 'preserveStageResults', 'preserveStageDiagnostics', 'preserveBinaryLimitations',
  'allowSyntheticReferenceCapture', 'allowRealReferenceCapture', 'requireVerifiedRealProvenance',
  'connectApplication', 'invokeBase44', 'createBrowserDownload', 'persistReferenceFixture', 'conservativeMode',
]);

export const DEFAULT_END_TO_END_PIPELINE_CONFIG = Object.freeze({
  stopOnInvalidStage: true, stopOnPolicyBlockedBinary: true, requireStageValidation: true, requireCompleteStageCoverage: true,
  requireInputImmutability: true, preserveStageResults: true, preserveStageDiagnostics: true, preserveBinaryLimitations: true,
  allowSyntheticReferenceCapture: true, allowRealReferenceCapture: true, requireVerifiedRealProvenance: true,
  connectApplication: false, invokeBase44: false, createBrowserDownload: false, persistReferenceFixture: false,
  conservativeMode: true, extras: Object.freeze({}),
});

export function resolveEndToEndPipelineConfig(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const extras = { ...(source.extras || {}) };
  Object.entries(source).forEach(([key, value]) => { if (!KNOWN_FIELDS.includes(key) && key !== 'extras') extras[key] = structuredClone(value); });
  return Object.freeze({ ...DEFAULT_END_TO_END_PIPELINE_CONFIG, ...Object.fromEntries(KNOWN_FIELDS.filter(key => Object.hasOwn(source, key)).map(key => [key, source[key]])), extras: Object.freeze(extras) });
}

const issue = (code, path, message) => ({ code, path, message });
export function validateEndToEndPipelineConfig(input = {}) {
  const config = resolveEndToEndPipelineConfig(input); const errors = [];
  ['stopOnInvalidStage', 'stopOnPolicyBlockedBinary', 'requireStageValidation', 'requireCompleteStageCoverage', 'requireInputImmutability', 'preserveStageResults', 'preserveStageDiagnostics', 'preserveBinaryLimitations', 'allowSyntheticReferenceCapture', 'allowRealReferenceCapture', 'requireVerifiedRealProvenance', 'conservativeMode'].forEach(key => { if (config[key] !== true) errors.push(issue('END_TO_END_CONSERVATIVE_INVARIANT_REQUIRED', key, `${key} must remain true.`)); });
  ['connectApplication', 'invokeBase44', 'createBrowserDownload', 'persistReferenceFixture'].forEach(key => { if (config[key] !== false) errors.push(issue('END_TO_END_FORBIDDEN_OPTION_ENABLED', key, `${key} must remain false.`)); });
  ['image', 'imagePixels', 'canvas', 'base64Image', 'segmentation', 'vectorization', 'encoderConfig', 'trimPolicy', 'machineProfile'].forEach(key => { if (Object.hasOwn(config.extras, key)) errors.push(issue('END_TO_END_FORBIDDEN_ROOT_FIELD', `extras.${key}`, `${key} is forbidden at the orchestrator root.`)); });
  return { valid: errors.length === 0, config, errors, warnings: [] };
}
