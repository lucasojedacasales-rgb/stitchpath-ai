const clone = value => {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, clone(nested)]));
  return value;
};

export function deepFreezeMachineValue(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreezeMachineValue);
  return Object.freeze(value);
}

export const TRIM_CAPABILITIES = Object.freeze(['native', 'intent_only', 'unsupported', 'unknown']);
export const UNSUPPORTED_TRIM_POLICIES = Object.freeze(['preserve_intent', 'block']);
export const MACHINE_ORIGIN_MODES = Object.freeze(['preserve_design_origin', 'design_center_to_machine_origin', 'custom']);

export function createMachineProfileV2(input = {}) {
  return deepFreezeMachineValue({
    id: input.id ?? null,
    name: input.name ?? input.id ?? null,
    description: input.description ?? null,
    coordinateResolutionMm: input.coordinateResolutionMm ?? null,
    maximumStitchDeltaUnits: input.maximumStitchDeltaUnits ?? null,
    maximumJumpDeltaUnits: input.maximumJumpDeltaUnits ?? null,
    hoopBoundsMm: clone(input.hoopBoundsMm ?? null),
    initialMachinePositionUnits: clone(input.initialMachinePositionUnits ?? { x: 0, y: 0 }),
    trimCapability: input.trimCapability ?? 'unknown',
    unsupportedTrimPolicy: input.unsupportedTrimPolicy ?? 'preserve_intent',
    supportsColorChange: input.supportsColorChange !== false,
    supportsEnd: input.supportsEnd !== false,
    defaultTransform: clone(input.defaultTransform ?? { scale: 1, rotationDegrees: 0, invertX: false, invertY: false, translateXmm: 0, translateYmm: 0, originMode: 'preserve_design_origin' }),
    source: clone(input.source ?? null),
    metadata: clone(input.metadata ?? {}),
  });
}

export const GENERIC_DST_MACHINE_PROFILE = createMachineProfileV2({
  id: 'generic_dst',
  name: 'Generic DST preparation',
  description: 'Internal 0.1 mm integer-coordinate preparation; not manufacturer certified.',
  coordinateResolutionMm: 0.1,
  maximumStitchDeltaUnits: null,
  maximumJumpDeltaUnits: null,
  hoopBoundsMm: null,
  initialMachinePositionUnits: { x: 0, y: 0 },
  trimCapability: 'intent_only',
  unsupportedTrimPolicy: 'preserve_intent',
  supportsColorChange: true,
  supportsEnd: true,
  defaultTransform: { scale: 1, rotationDegrees: 0, invertX: false, invertY: false, translateXmm: 0, translateYmm: 0, originMode: 'preserve_design_origin' },
  source: { internalProfile: true, manufacturerCertified: false, encodingContract: false },
});

export const BUILT_IN_MACHINE_PROFILES = Object.freeze({ generic_dst: GENERIC_DST_MACHINE_PROFILE });

export function resolveMachineProfile(profile = 'generic_dst') {
  if (typeof profile === 'string') return BUILT_IN_MACHINE_PROFILES[profile] ?? null;
  return profile && typeof profile === 'object' ? createMachineProfileV2(profile) : null;
}
