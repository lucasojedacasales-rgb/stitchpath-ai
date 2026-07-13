import { describe, expect, it } from 'vitest';
import { ENGINE_V2_END_TO_END_STAGE_REGISTRY, getEngineV2EndToEndStageDefinition, getEngineV2EndToEndStageRegistry } from '../orchestration/endToEndStageRegistry.js';

const expected = ['region_ingestion', 'semantic_analysis', 'object_planning', 'draft_materialization', 'thread_resolution', 'technical_planning', 'global_sequence', 'physical_generation', 'canonical_compilation', 'machine_adaptation', 'binary_export'];

describe('Phase 13A fixed stage registry', () => {
  it('contains exactly eleven stages', () => expect(ENGINE_V2_END_TO_END_STAGE_REGISTRY).toHaveLength(11));
  it('is frozen', () => expect(Object.isFrozen(ENGINE_V2_END_TO_END_STAGE_REGISTRY)).toBe(true));
  it('has fixed order', () => expect(ENGINE_V2_END_TO_END_STAGE_REGISTRY.map(stage => stage.id)).toEqual(expected));
  it('returns the authoritative registry identity', () => expect(getEngineV2EndToEndStageRegistry()).toBe(ENGINE_V2_END_TO_END_STAGE_REGISTRY));
  it.each(expected.map((id, index) => [id, index]))('defines %s at sequence %i', (id, index) => expect(getEngineV2EndToEndStageDefinition(id)?.sequenceIndex).toBe(index));
  it.each(expected)('marks %s transactional', id => expect(getEngineV2EndToEndStageDefinition(id)?.transactional).toBe(true));
  it.each(expected)('freezes definition %s', id => expect(Object.isFrozen(getEngineV2EndToEndStageDefinition(id))).toBe(true));
  it.each(expected)('declares input contract for %s', id => expect(getEngineV2EndToEndStageDefinition(id)?.inputContract).toBeTruthy());
  it.each(expected)('declares output contract for %s', id => expect(getEngineV2EndToEndStageDefinition(id)?.outputContract).toBeTruthy());
  it.each(expected)('declares source module for %s', id => expect(getEngineV2EndToEndStageDefinition(id)?.sourceModule).toMatch(/\.js$/));
  it('returns null for unknown stage', () => expect(getEngineV2EndToEndStageDefinition('optimizer')).toBeNull());
  it('places binary export last', () => expect(ENGINE_V2_END_TO_END_STAGE_REGISTRY.at(-1).id).toBe('binary_export'));
  it('contains no dynamic optimizer stage', () => expect(expected.some(id => id.includes('optimizer'))).toBe(false));
});
