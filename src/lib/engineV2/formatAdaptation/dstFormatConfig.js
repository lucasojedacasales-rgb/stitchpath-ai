const KNOWN_FIELDS = Object.freeze([
  'format', 'requiredCoordinateResolutionMm', 'maximumDeltaUnits', 'zeroDeltaStitchPolicy', 'zeroDeltaJumpPolicy', 'trimPolicy',
  'requireFinalEnd', 'requireImplicitInitialColor', 'label', 'preserveSourceOrder', 'preserveThreadBlockOrder', 'preserveThreadIds',
  'preserveTrimIntent', 'allowPartialAdapterOutput', 'allowPartialBinaryOutput', 'invokeExistingDSTEncoder', 'invokeDSBEncoder',
  'connectApplication', 'CE01ArtworkLogic', 'conservativeMode',
]);

export const DST_ZERO_STITCH_POLICIES = Object.freeze(['encode_penetration', 'block']);
export const DST_ZERO_JUMP_POLICIES = Object.freeze(['explicit_no_output', 'block']);
export const DST_TRIM_POLICIES = Object.freeze(['legacy_three_zero_jumps', 'block']);

export const DEFAULT_DST_FORMAT_CONFIG = Object.freeze({
  format: 'DST', requiredCoordinateResolutionMm: 0.1, maximumDeltaUnits: 121,
  zeroDeltaStitchPolicy: 'encode_penetration', zeroDeltaJumpPolicy: 'explicit_no_output', trimPolicy: 'legacy_three_zero_jumps',
  requireFinalEnd: true, requireImplicitInitialColor: true, label: 'design', preserveSourceOrder: true,
  preserveThreadBlockOrder: true, preserveThreadIds: true, preserveTrimIntent: true, allowPartialAdapterOutput: false,
  allowPartialBinaryOutput: false, invokeExistingDSTEncoder: true, invokeDSBEncoder: false, connectApplication: false,
  CE01ArtworkLogic: false, conservativeMode: true, extras: Object.freeze({}),
});

export function resolveDSTFormatConfig(input = {}) {
  const extras = { ...(input.extras || {}) };
  Object.entries(input || {}).forEach(([key, value]) => { if (!KNOWN_FIELDS.includes(key) && key !== 'extras') extras[key] = structuredClone(value); });
  return Object.freeze({ ...DEFAULT_DST_FORMAT_CONFIG, ...Object.fromEntries(KNOWN_FIELDS.filter(key => key in input).map(key => [key, input[key]])), extras: Object.freeze(extras) });
}

const issue = (code, path, message) => ({ code, path, message });
export function validateDSTFormatConfig(input = {}) {
  const config = resolveDSTFormatConfig(input); const errors = [];
  if (config.format !== 'DST') errors.push(issue('DST_FORMAT_REQUIRED', 'format', 'Format must equal DST.'));
  if (config.requiredCoordinateResolutionMm !== 0.1) errors.push(issue('DST_RESOLUTION_MUST_BE_POINT_ONE', 'requiredCoordinateResolutionMm', 'DST adaptation requires 0.1 mm units.'));
  if (config.maximumDeltaUnits !== 121) errors.push(issue('DST_MAXIMUM_DELTA_MUST_BE_121', 'maximumDeltaUnits', 'DST movement maximum must equal 121 units.'));
  if (!DST_ZERO_STITCH_POLICIES.includes(config.zeroDeltaStitchPolicy)) errors.push(issue('INVALID_DST_ZERO_STITCH_POLICY', 'zeroDeltaStitchPolicy', 'Zero stitch policy is invalid.'));
  if (!DST_ZERO_JUMP_POLICIES.includes(config.zeroDeltaJumpPolicy)) errors.push(issue('INVALID_DST_ZERO_JUMP_POLICY', 'zeroDeltaJumpPolicy', 'Zero jump policy is invalid.'));
  if (!DST_TRIM_POLICIES.includes(config.trimPolicy)) errors.push(issue('INVALID_DST_TRIM_POLICY', 'trimPolicy', 'Trim policy is invalid.'));
  const requiredTrue = ['requireFinalEnd', 'requireImplicitInitialColor', 'preserveSourceOrder', 'preserveThreadBlockOrder', 'preserveThreadIds', 'preserveTrimIntent', 'invokeExistingDSTEncoder', 'conservativeMode'];
  const requiredFalse = ['allowPartialAdapterOutput', 'allowPartialBinaryOutput', 'invokeDSBEncoder', 'connectApplication', 'CE01ArtworkLogic'];
  requiredTrue.forEach(key => { if (config[key] !== true) errors.push(issue('DST_CONSERVATIVE_INVARIANT_REQUIRED', key, `${key} must remain true.`)); });
  requiredFalse.forEach(key => { if (config[key] !== false) errors.push(issue('DST_FORBIDDEN_OPTION_ENABLED', key, `${key} must remain false.`)); });
  if (typeof config.label !== 'string' || !config.label.trim()) errors.push(issue('DST_LABEL_REQUIRED', 'label', 'A non-empty label is required.'));
  return { valid: errors.length === 0, config, errors, warnings: [] };
}

