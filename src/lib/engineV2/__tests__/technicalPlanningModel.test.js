import { describe, expect, it } from 'vitest';
import { createEntryExitCandidateV2, createGeneratorReadinessV2, createObjectTechnicalSpecificationV2, createPullCompensationPlanV2, createUnderlayPlanV2, technicalSpecificationIdForObject } from '../index.js';

describe('Phase 7 technical planning models', () => {
  const specification = () => createObjectTechnicalSpecificationV2({ objectId: 'object:a', regionId: 'region:a', threadId: 'thread:a', role: 'base_fill', stitchType: 'tatami', status: 'planned', materialProfileId: 'generic_medium_woven', planningProfile: 'balanced', geometryMetrics: { areaMm2: 10 }, stitchParameters: { spacingMm: 0.45 }, entryCandidates: [], exitCandidates: [], planningConfidence: 0.9, source: { fixture: true } });
  it('creates deterministic specification IDs', () => expect(specification().id).toBe('technical:object:a'));
  it('exposes the deterministic ID helper', () => expect(technicalSpecificationIdForObject('object:x')).toBe('technical:object:x'));
  it('preserves object and thread references', () => expect(specification()).toMatchObject({ objectId: 'object:a', threadId: 'thread:a', regionId: 'region:a' }));
  it('deeply freezes specifications', () => { const value = specification(); expect(Object.isFrozen(value)).toBe(true); expect(Object.isFrozen(value.geometryMetrics)).toBe(true); });
  it('deeply clones specification input', () => { const source = { geometryMetrics: { areaMm2: 10 } }; const value = createObjectTechnicalSpecificationV2({ objectId: 'object:x', ...source }); source.geometryMetrics.areaMm2 = 99; expect(value.geometryMetrics.areaMm2).toBe(10); });
  it('does not add physical stitches', () => expect(Object.hasOwn(specification(), 'stitches')).toBe(false));
  it.each(['geometry', 'threadBlocks', 'commands', 'route', 'machineProfile', 'encoder'])('does not add forbidden %s field', field => expect(Object.hasOwn(specification(), field)).toBe(false));
  it('creates immutable underlay plans without coordinates', () => { const plan = createUnderlayPlanV2({ applicable: true, enabled: true, sequence: [{ type: 'edge_run', insetMm: 1 }] }); expect(Object.isFrozen(plan.sequence[0])).toBe(true); expect(Object.hasOwn(plan.sequence[0], 'points')).toBe(false); });
  it('creates bounded pull-compensation plans', () => expect(createPullCompensationPlanV2({ applicable: true, enabled: true, strategy: 'uniform', amountMm: 0.2, maximumAllowedMm: 0.6 })).toMatchObject({ amountMm: 0.2, strategy: 'uniform' }));
  it('creates immutable candidate points', () => { const input = { id: 'candidate:x', objectId: 'object:x', kind: 'entry', point: { x: 1, y: 2 }, sourceType: 'boundary_vertex', valid: true }; const candidate = createEntryExitCandidateV2(input); input.point.x = 9; expect(candidate.point.x).toBe(1); expect(Object.isFrozen(candidate.point)).toBe(true); });
  it('creates readiness without generated stitches', () => { const readiness = createGeneratorReadinessV2({ generator: 'tatami', ready: true, confidence: 0.9 }); expect(readiness.ready).toBe(true); expect(Object.hasOwn(readiness, 'stitches')).toBe(false); });
});
