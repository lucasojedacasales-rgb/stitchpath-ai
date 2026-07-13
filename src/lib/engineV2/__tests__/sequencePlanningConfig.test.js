import { describe, expect, it } from 'vitest';
import { DEFAULT_SEQUENCE_PLANNING_CONFIG, resolveSequenceAlgorithm, resolveSequencePlanningConfig, validateSequencePlanningConfig } from '../sequencing/sequencePlanningConfig.js';

describe('Phase 8 sequencing configuration', () => {
  it('uses dependency_thread_travel by default', () => expect(DEFAULT_SEQUENCE_PLANNING_CONFIG.strategy).toBe('dependency_thread_travel'));
  it('uses auto algorithm by default', () => expect(DEFAULT_SEQUENCE_PLANNING_CONFIG.algorithm).toBe('auto'));
  it('defaults exact limit to nine', () => expect(DEFAULT_SEQUENCE_PLANNING_CONFIG.exactSearchObjectLimit).toBe(9));
  it('defaults beam width to 128', () => expect(DEFAULT_SEQUENCE_PLANNING_CONFIG.beamWidth).toBe(128));
  it('keeps physical stitches disabled', () => expect(DEFAULT_SEQUENCE_PLANNING_CONFIG.generatePhysicalStitches).toBe(false));
  it('keeps physical underlay disabled', () => expect(DEFAULT_SEQUENCE_PLANNING_CONFIG.generatePhysicalUnderlay).toBe(false));
  it('keeps canonical commands disabled', () => expect(DEFAULT_SEQUENCE_PLANNING_CONFIG.generateCanonicalCommands).toBe(false));
  it('keeps machine adaptation and encoding disabled', () => expect([DEFAULT_SEQUENCE_PLANNING_CONFIG.machineAdaptation, DEFAULT_SEQUENCE_PLANNING_CONFIG.encoding]).toEqual([false, false]));
  it('selects exact automatically at the limit', () => expect(resolveSequenceAlgorithm(resolveSequencePlanningConfig(), 9)).toBe('exact'));
  it('selects beam automatically above the limit', () => expect(resolveSequenceAlgorithm(resolveSequencePlanningConfig(), 10)).toBe('beam'));
  it('honors explicit exact mode', () => expect(resolveSequenceAlgorithm(resolveSequencePlanningConfig({ algorithm: 'exact' }), 20)).toBe('exact'));
  it('honors explicit beam mode', () => expect(resolveSequenceAlgorithm(resolveSequencePlanningConfig({ algorithm: 'beam' }), 2)).toBe('beam'));
  it('retains unknown fields in extras', () => expect(resolveSequencePlanningConfig({ futureOption: 3 }).extras.futureOption).toBe(3));
  it.each(['exactSearchObjectLimit', 'beamWidth', 'maximumExpandedStates', 'maximumEntryCandidatesPerObject', 'maximumExitCandidatesPerObject'])('rejects invalid positive-integer limit %s', field => expect(validateSequencePlanningConfig(resolveSequencePlanningConfig({ [field]: 0 })).valid).toBe(false));
  it('accepts finite explicit anchors', () => expect(validateSequencePlanningConfig(resolveSequencePlanningConfig({ startAnchorMm: { x: 0, y: 1 }, endAnchorMm: { x: 2, y: 3 } })).valid).toBe(true));
  it('rejects non-finite anchors', () => expect(validateSequencePlanningConfig(resolveSequencePlanningConfig({ startAnchorMm: { x: Infinity, y: 0 } })).valid).toBe(false));
  it('rejects physical generation requests', () => expect(validateSequencePlanningConfig(resolveSequencePlanningConfig({ generatePhysicalStitches: true })).errors[0].code).toBe('PHASE_8_PHYSICAL_OUTPUT_FORBIDDEN'));
});
