export const ENGINE_V2_PROFILES = Object.freeze(['fast', 'balanced', 'detailed']);
export const ENGINE_V2_MACHINE_PROFILES = Object.freeze(['generic_dst']);

export const DEFAULT_ENGINE_V2_CONFIG = Object.freeze({
  engineVersion: 'v1',
  v2Enabled: false,
  profile: 'balanced',
  machineProfile: 'generic_dst',
  diagnosticsEnabled: true,
});

const KNOWN_FIELDS = new Set(Object.keys(DEFAULT_ENGINE_V2_CONFIG));

export function resolveEngineV2Config(config = {}) {
  const source = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  const extras = Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => !KNOWN_FIELDS.has(key))
      .map(([key, value]) => [key, cloneValue(value)]),
  );

  return {
    engineVersion: source.engineVersion === 'v2' ? 'v2' : 'v1',
    v2Enabled: source.v2Enabled === true,
    profile: ENGINE_V2_PROFILES.includes(source.profile) ? source.profile : 'balanced',
    machineProfile: ENGINE_V2_MACHINE_PROFILES.includes(source.machineProfile)
      ? source.machineProfile
      : 'generic_dst',
    diagnosticsEnabled: source.diagnosticsEnabled !== false,
    extras,
  };
}

export function isEngineV2Enabled(config = {}) {
  const resolved = resolveEngineV2Config(config);
  return resolved.engineVersion === 'v2' && resolved.v2Enabled === true;
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneValue(nested)]));
  }
  return value;
}
