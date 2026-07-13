import { describe, expect, it } from 'vitest';
import { createDependencyThreadRevisitFixture } from '../fixtures/dependencyThreadRevisitFixture.js';
import { createLargeSequenceFixture } from '../fixtures/largeSequenceFixture.js';
import { createSimpleSequenceFixture } from '../fixtures/simpleSequenceFixture.js';
import { createThreadChangeOptimizationFixture } from '../fixtures/threadChangeOptimizationFixture.js';
import { scheduleDependencyAwareObjects } from '../sequencing/dependencyAwareScheduler.js';
import { resolveSequencePlanningConfig } from '../sequencing/sequencePlanningConfig.js';

function schedule(fixture, overrides = {}) {
  return scheduleDependencyAwareObjects({ objects: fixture.objects, technicalSpecifications: fixture.technicalPlan.specifications, config: resolveSequencePlanningConfig(overrides) });
}

describe('Phase 8 dependency-aware scheduler', () => {
  it('creates a complete exact schedule', () => expect(schedule(createSimpleSequenceFixture()).complete).toBe(true));
  it('uses exact search for small auto inputs', () => expect(schedule(createSimpleSequenceFixture()).searchMetadata.algorithmUsed).toBe('exact'));
  it('marks exact optimality guaranteed', () => expect(schedule(createSimpleSequenceFixture()).searchMetadata.optimalityGuaranteed).toBe(true));
  it('schedules each object exactly once', () => { const fixture = createThreadChangeOptimizationFixture(); const result = schedule(fixture); expect(new Set(result.execution.map(item => item.objectId)).size).toBe(fixture.objects.length); });
  it('uses stable IDs rather than source array order', () => { const fixture = createSimpleSequenceFixture(); const reverse = { ...fixture, objects: [...fixture.objects].reverse() }; expect(schedule(fixture).execution.map(item => item.objectId)).toEqual(schedule(reverse).execution.map(item => item.objectId)); });
  it('minimizes thread changes before travel', () => expect(schedule(createThreadChangeOptimizationFixture()).searchMetadata.costTuple.threadChangeCount).toBe(1));
  it('does not abandon an eligible same-thread object for travel', () => { const result = schedule(createThreadChangeOptimizationFixture()); expect(result.execution.slice(0, 2).map(item => item.objectId).every(id => id.includes('green'))).toBe(true); });
  it('respects a dependency chain', () => expect(schedule(createDependencyThreadRevisitFixture()).execution.map(item => item.objectId)).toEqual(['object:revisit-green-base', 'object:revisit-red-middle', 'object:revisit-green-top']));
  it('records dependency-gated revisits', () => expect(schedule(createDependencyThreadRevisitFixture()).execution.at(-1).repeatedThreadReason).toBe('dependency_gated_revisit'));
  it('counts a forced revisit once', () => expect(schedule(createDependencyThreadRevisitFixture()).searchMetadata.costTuple.threadRevisitCount).toBe(1));
  it('uses beam above the exact limit', () => expect(schedule(createLargeSequenceFixture()).searchMetadata.algorithmUsed).toBe('beam'));
  it('marks beam optimality false', () => expect(schedule(createLargeSequenceFixture()).searchMetadata.optimalityGuaranteed).toBe(false));
  it('reports beam pruning', () => expect(schedule(createLargeSequenceFixture(), { beamWidth: 4 }).searchMetadata.prunedStateCount).toBeGreaterThan(0));
  it('is deterministic in beam mode', () => { const fixture = createLargeSequenceFixture(); expect(schedule(fixture, { algorithm: 'beam', beamWidth: 8 }).execution.map(item => `${item.objectId}:${item.entryCandidateId}:${item.exitCandidateId}`)).toEqual(schedule(fixture, { algorithm: 'beam', beamWidth: 8 }).execution.map(item => `${item.objectId}:${item.entryCandidateId}:${item.exitCandidateId}`)); });
  it('reports a deterministic state-limit failure without partial output', () => { const result = schedule(createLargeSequenceFixture(), { algorithm: 'exact', maximumExpandedStates: 1 }); expect([result.complete, result.execution.length, result.searchMetadata.maximumExpandedStatesReached]).toEqual([false, 0, true]); });
  it('does not generate commands or stitches', () => expect(JSON.stringify(schedule(createSimpleSequenceFixture()))).not.toMatch(/"commands"|"stitches"/));
});
