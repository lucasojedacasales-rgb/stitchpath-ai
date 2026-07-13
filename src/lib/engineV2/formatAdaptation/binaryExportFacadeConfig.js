const KNOWN_FIELDS = Object.freeze([
  'requireExplicitFormat', 'allowFormatFallback', 'allowCrossFormatInvocation', 'requireAcceptedBinary', 'allowBlockedResult',
  'cloneBinaryBytes', 'preserveFormatResult', 'preserveFormatWarnings', 'preserveFormatLimitations', 'connectApplication',
  'connectExportModal', 'invokeBase44', 'createBrowserDownload', 'conservativeMode',
]);

export const DEFAULT_BINARY_EXPORT_FACADE_CONFIG = Object.freeze({
  requireExplicitFormat: true, allowFormatFallback: false, allowCrossFormatInvocation: false, requireAcceptedBinary: true,
  allowBlockedResult: true, cloneBinaryBytes: true, preserveFormatResult: true, preserveFormatWarnings: true,
  preserveFormatLimitations: true, connectApplication: false, connectExportModal: false, invokeBase44: false,
  createBrowserDownload: false, conservativeMode: true, extras: Object.freeze({}),
});

export function resolveBinaryExportFacadeConfig(input = {}) {
  const extras = { ...(input.extras || {}) };
  Object.entries(input || {}).forEach(([key, value]) => { if (!KNOWN_FIELDS.includes(key) && key !== 'extras') extras[key] = structuredClone(value); });
  return Object.freeze({
    ...DEFAULT_BINARY_EXPORT_FACADE_CONFIG,
    ...Object.fromEntries(KNOWN_FIELDS.filter(key => key in input).map(key => [key, input[key]])), extras: Object.freeze(extras),
  });
}

const issue = (code, path, message) => ({ code, path, message });
export function validateBinaryExportFacadeConfig(input = {}) {
  const config = resolveBinaryExportFacadeConfig(input); const errors = [];
  ['requireExplicitFormat', 'requireAcceptedBinary', 'allowBlockedResult', 'cloneBinaryBytes', 'preserveFormatResult', 'preserveFormatWarnings', 'preserveFormatLimitations', 'conservativeMode'].forEach(key => {
    if (config[key] !== true) errors.push(issue('BINARY_FACADE_CONSERVATIVE_INVARIANT_REQUIRED', key, `${key} must remain true.`));
  });
  ['allowFormatFallback', 'allowCrossFormatInvocation', 'connectApplication', 'connectExportModal', 'invokeBase44', 'createBrowserDownload'].forEach(key => {
    if (config[key] !== false) errors.push(issue('BINARY_FACADE_FORBIDDEN_OPTION_ENABLED', key, `${key} must remain false.`));
  });
  const forbiddenRootFields = ['trimPolicy', 'trimNoOutputAcknowledgement', 'zeroDeltaStitchPolicy', 'zeroDeltaJumpPolicy', 'machineProfile', 'encoderConfig', 'maximumDeltaUnits'];
  forbiddenRootFields.forEach(key => { if (Object.hasOwn(config.extras, key)) errors.push(issue('BINARY_FACADE_FORMAT_POLICY_AT_ROOT', `extras.${key}`, `${key} belongs in formatConfig or the source stream, not facade config.`)); });
  return { valid: errors.length === 0, config, errors, warnings: [] };
}
