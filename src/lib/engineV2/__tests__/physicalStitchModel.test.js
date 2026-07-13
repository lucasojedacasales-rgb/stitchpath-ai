import { describe, expect, it } from 'vitest';
import { createMachineIndependentPhysicalStitchPlanV2, createObjectPhysicalStitchDispositionV2, createObjectPhysicalStitchPathV2, createPhysicalStitchPointV2, createPhysicalStitchSubpathV2, createPhysicalSubpathTransitionV2, physicalDispositionId, physicalGapId, physicalPathId, physicalPointId, physicalSubpathId } from '../stitchGeneration/physicalStitchModel.js';

describe('Phase 9 physical stitch models', () => {
  it('creates deterministic physical point IDs', () => expect(physicalPointId('object:a', 2, 3)).toBe('physical-point:object:a:0002:0003'));
  it('creates deterministic subpath IDs', () => expect(physicalSubpathId('object:a', 2, 'tatami')).toBe('physical-subpath:object:a:0002:tatami'));
  it('creates deterministic gap IDs', () => expect(physicalGapId('object:a', 'from', 'to')).toBe('physical-gap:object:a:from:to'));
  it('creates deterministic disposition IDs', () => expect(physicalDispositionId('object:a')).toBe('physical-disposition:object:a'));
  it('creates deterministic path IDs', () => expect(physicalPathId('object:a')).toBe('physical-path:object:a'));
  it('creates immutable physical points', () => expect(Object.isFrozen(createPhysicalStitchPointV2({ objectId: 'object:a', subpathIndex: 0, pointIndex: 0, x: 1, y: 2, phase: 'top', technique: 'running', sourceType: 'source_geometry' }))).toBe(true));
  it('preserves finite coordinates', () => expect(createPhysicalStitchPointV2({ x: 1.25, y: -2.5 }).x).toBe(1.25));
  it('does not add command types', () => expect(createPhysicalStitchPointV2()).not.toHaveProperty('type'));
  it('does not add timestamps', () => expect(JSON.stringify(createPhysicalStitchPointV2())).not.toMatch(/timestamp|createdAt/));
  it('clones point source data', () => { const source = { a: 1 }; const point = createPhysicalStitchPointV2({ source }); source.a = 2; expect(point.source.a).toBe(1); });
  it('creates subpath stitch count from points', () => expect(createPhysicalStitchSubpathV2({ objectId: 'object:a', subpathIndex: 0, technique: 'running', points: [{}, {}, {}] }).stitchCount).toBe(2));
  it('allows one-point anchor subpaths', () => expect(createPhysicalStitchSubpathV2({ objectId: 'object:a', subpathIndex: 0, technique: 'anchor', points: [{}] }).points).toHaveLength(1));
  it('deep-freezes subpath points', () => expect(Object.isFrozen(createPhysicalStitchSubpathV2({ points: [{ source: { a: 1 } }] }).points[0].source)).toBe(true));
  it('creates diagnostic transitions without commands', () => expect(createPhysicalSubpathTransitionV2({ objectId: 'object:a', fromSubpathId: 'a', toSubpathId: 'b' })).not.toHaveProperty('jump'));
  it('creates generated dispositions', () => expect(createObjectPhysicalStitchDispositionV2({ objectId: 'object:a', status: 'generated' }).status).toBe('generated'));
  it('clones disposition evidence', () => { const evidence = [{ code: 'A' }]; const disposition = createObjectPhysicalStitchDispositionV2({ objectId: 'object:a', evidence }); evidence[0].code = 'B'; expect(disposition.evidence[0].code).toBe('A'); });
  it('creates immutable object paths', () => expect(Object.isFrozen(createObjectPhysicalStitchPathV2({ objectId: 'object:a' }))).toBe(true));
  it('creates immutable physical plans', () => expect(Object.isFrozen(createMachineIndependentPhysicalStitchPlanV2())).toBe(true));
  it('indexes dispositions by default', () => { const disposition = createObjectPhysicalStitchDispositionV2({ objectId: 'object:a' }); expect(createMachineIndependentPhysicalStitchPlanV2({ dispositions: [disposition] }).byDispositionId[disposition.id]).toEqual(disposition); });
  it('uses the Phase 9 plan version', () => expect(createMachineIndependentPhysicalStitchPlanV2().version).toBe('2-machine-independent-physical-stitch-plan'));
});
