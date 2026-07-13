import { describe, expect, it } from 'vitest';
import {
  isEngineV2Enabled,
  resolveEngineV2Config,
} from '../index.js';
import { DEFAULT_ENGINE_V2_CONFIG } from '../engineV2Config.js';

describe('Engine V2 configuration', () => {
  it('falls back safely and isolates unknown fields', () => {
    const input = { profile: 'unknown', machineProfile: 'ce01', futureField: { enabled: true } };
    const before = structuredClone(input);
    const resolved = resolveEngineV2Config(input);
    expect(resolved).toMatchObject({ profile: 'balanced', machineProfile: 'generic_dst' });
    expect(resolved.extras).toEqual({ futureField: { enabled: true } });
    expect(resolved.futureField).toBeUndefined();
    resolved.extras.futureField.enabled = false;
    expect(input).toEqual(before);
  });

  it('keeps V2 disabled by default', () => {
    expect(resolveEngineV2Config()).toMatchObject(DEFAULT_ENGINE_V2_CONFIG);
    expect(isEngineV2Enabled()).toBe(false);
  });

  it('does not activate V2 with v2Enabled alone', () => {
    expect(isEngineV2Enabled({ v2Enabled: true })).toBe(false);
  });

  it('does not activate V2 with engineVersion alone', () => {
    expect(isEngineV2Enabled({ engineVersion: 'v2' })).toBe(false);
  });

  it('activates V2 only with both explicit settings', () => {
    expect(isEngineV2Enabled({ engineVersion: 'v2', v2Enabled: true })).toBe(true);
  });
});
