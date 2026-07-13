import { describe, expect, it } from 'vitest';
import { DEFAULT_CANONICAL_COMPILATION_CONFIG, resolveCanonicalCompilationConfig, validateCanonicalCompilationConfig } from '../commandCompilation/canonicalCompilationConfig.js';

describe('Phase 10 canonical compilation configuration', () => {
  it('uses six decimal places by default', () => expect(DEFAULT_CANONICAL_COMPILATION_CONFIG.coordinatePrecisionDecimals).toBe(6));
  it('uses positive comparison tolerance', () => expect(DEFAULT_CANONICAL_COMPILATION_CONFIG.comparisonToleranceMm).toBe(0.000001));
  it('emits initial positioning by default', () => expect(DEFAULT_CANONICAL_COMPILATION_CONFIG.emitInitialPositionJump).toBe(true));
  it('allows geometrically proven connectors', () => expect(DEFAULT_CANONICAL_COMPILATION_CONFIG.allowSafeSubpathConnectorStitches).toBe(true));
  it('requires connectors inside geometry', () => expect(DEFAULT_CANONICAL_COMPILATION_CONFIG.requireConnectorInsideEffectiveRegion).toBe(true));
  it('requires connectors to avoid holes', () => expect(DEFAULT_CANONICAL_COMPILATION_CONFIG.requireConnectorWithoutHoleCrossing).toBe(true));
  it('uses technical specification maximums', () => expect(DEFAULT_CANONICAL_COMPILATION_CONFIG.connectorMaximumLengthSource).toBe('technical_specification'));
  it('trims unsafe subpath gaps', () => expect(DEFAULT_CANONICAL_COMPILATION_CONFIG.trimUnsafeSubpathDiscontinuities).toBe(true));
  it('trims between objects', () => expect(DEFAULT_CANONICAL_COMPILATION_CONFIG.trimBetweenObjects).toBe(true));
  it('deduplicates adjacent trims', () => expect(DEFAULT_CANONICAL_COMPILATION_CONFIG.deduplicateAdjacentTrims).toBe(true));
  it('omits zero-distance jumps', () => expect(DEFAULT_CANONICAL_COMPILATION_CONFIG.omitZeroDistanceJumps).toBe(true));
  it('forbids object-boundary stitches', () => expect(DEFAULT_CANONICAL_COMPILATION_CONFIG.forbidStitchAcrossObjectBoundary).toBe(true));
  it('rejects partial streams by default', () => expect(DEFAULT_CANONICAL_COMPILATION_CONFIG.allowPartialCanonicalStream).toBe(false));
  it('keeps machine behavior disabled', () => expect([DEFAULT_CANONICAL_COMPILATION_CONFIG.machineAdaptation, DEFAULT_CANONICAL_COMPILATION_CONFIG.coordinateQuantization, DEFAULT_CANONICAL_COMPILATION_CONFIG.movementSplitting]).toEqual([false, false, false]));
  it('keeps encoding disabled', () => expect(DEFAULT_CANONICAL_COMPILATION_CONFIG.encoding).toBe(false));
  it('preserves unknown fields in extras', () => expect(resolveCanonicalCompilationConfig({ customAudit: 1 }).extras.customAudit).toBe(1));
  it('honors safe explicit overrides', () => expect(resolveCanonicalCompilationConfig({ emitInitialPositionJump: false }).emitInitialPositionJump).toBe(false));
  it('rejects negative coordinate precision', () => expect(validateCanonicalCompilationConfig(resolveCanonicalCompilationConfig({ coordinatePrecisionDecimals: -1 })).valid).toBe(false));
  it('rejects nonpositive tolerance', () => expect(validateCanonicalCompilationConfig(resolveCanonicalCompilationConfig({ comparisonToleranceMm: 0 })).valid).toBe(false));
  it.each(['machineAdaptation', 'coordinateQuantization', 'movementSplitting', 'encoding'])('rejects enabled forbidden behavior %s', field => expect(validateCanonicalCompilationConfig(resolveCanonicalCompilationConfig({ [field]: true })).errors.some(item => item.code === 'PHASE_10_MACHINE_OR_ENCODING_BEHAVIOR_FORBIDDEN')).toBe(true));
});
