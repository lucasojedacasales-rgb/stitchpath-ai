import { MACHINE_ORIGIN_MODES } from './machineProfileModel.js';

export const DEFAULT_MACHINE_ADAPTATION_CONFIG = Object.freeze({
  machineProfile: 'generic_dst',
  transform: Object.freeze({ scale: 1, rotationDegrees: 0, invertX: false, invertY: false, translateXmm: 0, translateYmm: 0, originMode: 'preserve_design_origin', customOriginMm: null }),
  roundingMode: 'half_away_from_zero',
  validateHoopBounds: true,
  blockOutOfBounds: true,
  splitStitchMovements: true,
  splitJumpMovements: true,
  preserveCanonicalOrder: true,
  preserveCommandSemantics: true,
  preserveThreadBlocks: true,
  preserveTrimIntent: true,
  blockUnsupportedCommand: true,
  blockUnsupportedTrim: false,
  allowPartialAdaptedStream: false,
  encoding: false,
  invokeDSTEncoder: false,
  invokeDSBEncoder: false,
  CE01Logic: false,
  conservativeMode: true,
});

export function resolveMachineAdaptationConfig(input = {}) {
  const known = new Set(Object.keys(DEFAULT_MACHINE_ADAPTATION_CONFIG));
  const supplied = Object.fromEntries(Object.entries(input).filter(([key]) => known.has(key) && key !== 'transform'));
  const transformInput = input.transform && typeof input.transform === 'object' ? input.transform : {};
  const transformKnown = new Set(Object.keys(DEFAULT_MACHINE_ADAPTATION_CONFIG.transform));
  const transform = Object.freeze({ ...DEFAULT_MACHINE_ADAPTATION_CONFIG.transform, ...Object.fromEntries(Object.entries(transformInput).filter(([key]) => transformKnown.has(key))), extras: Object.freeze(Object.fromEntries(Object.entries(transformInput).filter(([key]) => !transformKnown.has(key)))) });
  const extras = Object.freeze(Object.fromEntries(Object.entries(input).filter(([key]) => !known.has(key))));
  return Object.freeze({ ...DEFAULT_MACHINE_ADAPTATION_CONFIG, ...supplied, transform, extras });
}

export function validateMachineAdaptationConfig(config) {
  const errors = [];
  const add = (code, path, message) => errors.push({ code, path, message });
  const transform = config?.transform || {};
  if (!Number.isFinite(transform.scale) || transform.scale <= 0) add('INVALID_MACHINE_SCALE', 'transform.scale', 'Scale must be positive and finite.');
  if ('scaleX' in (transform.extras || {}) || 'scaleY' in (transform.extras || {})) add('NON_UNIFORM_MACHINE_SCALE_FORBIDDEN', 'transform', 'Non-uniform scaling is forbidden.');
  if (!Number.isFinite(transform.rotationDegrees)) add('INVALID_MACHINE_ROTATION', 'transform.rotationDegrees', 'Rotation must be finite.');
  if (!Number.isFinite(transform.translateXmm) || !Number.isFinite(transform.translateYmm)) add('INVALID_MACHINE_TRANSLATION', 'transform', 'Translation must be finite.');
  if (!MACHINE_ORIGIN_MODES.includes(transform.originMode)) add('INVALID_MACHINE_ORIGIN_MODE', 'transform.originMode', 'Origin mode is invalid.');
  if (transform.originMode === 'custom' && (!Number.isFinite(transform.customOriginMm?.x) || !Number.isFinite(transform.customOriginMm?.y))) add('INVALID_CUSTOM_MACHINE_ORIGIN', 'transform.customOriginMm', 'Custom origin requires finite coordinates.');
  if (config?.roundingMode !== 'half_away_from_zero') add('INVALID_MACHINE_ROUNDING_MODE', 'roundingMode', 'Only half-away-from-zero rounding is supported.');
  const forbidden = { encoding: config?.encoding, invokeDSTEncoder: config?.invokeDSTEncoder, invokeDSBEncoder: config?.invokeDSBEncoder, CE01Logic: config?.CE01Logic };
  Object.entries(forbidden).forEach(([key, value]) => { if (value) add('MACHINE_ADAPTATION_FORBIDDEN_OUTPUT_BEHAVIOR', key, `${key} must remain disabled.`); });
  if (config?.allowPartialAdaptedStream) add('PARTIAL_MACHINE_STREAM_FORBIDDEN', 'allowPartialAdaptedStream', 'Partial adapted streams are forbidden.');
  const automatic = [...Object.keys(config?.extras || {}), ...Object.keys(transform.extras || {})].filter(key => /auto.*(fit|scale|shrink|translate)|fitTo/i.test(key));
  if (automatic.length) add('AUTOMATIC_MACHINE_FIT_FORBIDDEN', 'extras', 'Automatic fitting fields are forbidden.');
  return { valid: errors.length === 0, errors, warnings: [] };
}
