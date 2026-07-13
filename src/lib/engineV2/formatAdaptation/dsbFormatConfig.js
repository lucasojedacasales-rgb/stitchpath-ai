const KNOWN_FIELDS = Object.freeze([
  'format', 'requiredCoordinateResolutionMm', 'maximumDeltaUnits', 'zeroDeltaStitchPolicy', 'zeroDeltaJumpPolicy', 'trimPolicy',
  'trimNoOutputAcknowledgement', 'requireFinalEnd', 'requireImplicitInitialColor', 'label', 'preserveSourceOrder',
  'preserveThreadBlockOrder', 'preserveThreadIds', 'preserveTrimLineage', 'allowPartialAdapterOutput', 'allowPartialBinaryOutput',
  'invokeExistingDSBLowLevelEncoder', 'invokeDSTEncoder', 'invokeBase44', 'connectApplication', 'CE01ArtworkLogic', 'conservativeMode',
]);

export const DSB_ZERO_STITCH_POLICIES = Object.freeze(['encode_penetration', 'block']);
export const DSB_ZERO_JUMP_POLICIES = Object.freeze(['explicit_no_output', 'block']);
export const DSB_TRIM_POLICIES = Object.freeze(['block', 'explicit_no_output']);

export const DEFAULT_DSB_FORMAT_CONFIG = Object.freeze({
  format: 'DSB', requiredCoordinateResolutionMm: 0.1, maximumDeltaUnits: 127,
  zeroDeltaStitchPolicy: 'encode_penetration', zeroDeltaJumpPolicy: 'explicit_no_output', trimPolicy: 'block',
  trimNoOutputAcknowledgement: null, requireFinalEnd: true, requireImplicitInitialColor: true, label: 'design',
  preserveSourceOrder: true, preserveThreadBlockOrder: true, preserveThreadIds: true, preserveTrimLineage: true,
  allowPartialAdapterOutput: false, allowPartialBinaryOutput: false, invokeExistingDSBLowLevelEncoder: true,
  invokeDSTEncoder: false, invokeBase44: false, connectApplication: false, CE01ArtworkLogic: false, conservativeMode: true,
  extras: Object.freeze({}),
});

export function resolveDSBFormatConfig(input = {}) {
  const extras = { ...(input.extras || {}) };
  Object.entries(input || {}).forEach(([key, value]) => { if (!KNOWN_FIELDS.includes(key) && key !== 'extras') extras[key] = structuredClone(value); });
  return Object.freeze({
    ...DEFAULT_DSB_FORMAT_CONFIG,
    ...Object.fromEntries(KNOWN_FIELDS.filter(key => key in input).map(key => [key, input[key]])),
    extras: Object.freeze(extras),
  });
}

const issue = (code, path, message) => ({ code, path, message });
export function validateDSBFormatConfig(input = {}) {
  const config = resolveDSBFormatConfig(input); const errors = [];
  if (config.format !== 'DSB') errors.push(issue('DSB_FORMAT_REQUIRED', 'format', 'Format must equal DSB.'));
  if (config.requiredCoordinateResolutionMm !== 0.1) errors.push(issue('DSB_RESOLUTION_MUST_BE_POINT_ONE', 'requiredCoordinateResolutionMm', 'DSB adaptation requires 0.1 mm units.'));
  if (config.maximumDeltaUnits !== 127) errors.push(issue('DSB_MAXIMUM_DELTA_MUST_BE_127', 'maximumDeltaUnits', 'DSB movement maximum must equal 127 units.'));
  if (!DSB_ZERO_STITCH_POLICIES.includes(config.zeroDeltaStitchPolicy)) errors.push(issue('INVALID_DSB_ZERO_STITCH_POLICY', 'zeroDeltaStitchPolicy', 'Zero stitch policy is invalid.'));
  if (!DSB_ZERO_JUMP_POLICIES.includes(config.zeroDeltaJumpPolicy)) errors.push(issue('INVALID_DSB_ZERO_JUMP_POLICY', 'zeroDeltaJumpPolicy', 'Zero jump policy is invalid.'));
  if (!DSB_TRIM_POLICIES.includes(config.trimPolicy)) errors.push(issue('INVALID_DSB_TRIM_POLICY', 'trimPolicy', 'Trim policy is invalid.'));
  if (config.trimPolicy === 'explicit_no_output' && (typeof config.trimNoOutputAcknowledgement !== 'string' || !config.trimNoOutputAcknowledgement.trim())) errors.push(issue('DSB_TRIM_ACKNOWLEDGEMENT_REQUIRED', 'trimNoOutputAcknowledgement', 'Explicit trim no-output policy requires a non-empty acknowledgement.'));
  const requiredTrue = ['requireFinalEnd', 'requireImplicitInitialColor', 'preserveSourceOrder', 'preserveThreadBlockOrder', 'preserveThreadIds', 'preserveTrimLineage', 'invokeExistingDSBLowLevelEncoder', 'conservativeMode'];
  const requiredFalse = ['allowPartialAdapterOutput', 'allowPartialBinaryOutput', 'invokeDSTEncoder', 'invokeBase44', 'connectApplication', 'CE01ArtworkLogic'];
  requiredTrue.forEach(key => { if (config[key] !== true) errors.push(issue('DSB_CONSERVATIVE_INVARIANT_REQUIRED', key, `${key} must remain true.`)); });
  requiredFalse.forEach(key => { if (config[key] !== false) errors.push(issue('DSB_FORBIDDEN_OPTION_ENABLED', key, `${key} must remain false.`)); });
  if (typeof config.label !== 'string' || !config.label.trim()) errors.push(issue('DSB_LABEL_REQUIRED', 'label', 'A non-empty label is required.'));
  return { valid: errors.length === 0, config, errors, warnings: [] };
}
