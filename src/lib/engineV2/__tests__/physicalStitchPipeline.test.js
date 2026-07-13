import { beforeAll, describe, expect, it } from 'vitest';
import { createGenericMascotPhysicalFixture } from '../fixtures/genericMascotPhysicalFixture.js';
import { createPhysicalPointLimitFixture } from '../fixtures/physicalPointLimitFixture.js';

let fixture;
let plan;
beforeAll(() => { fixture = createGenericMascotPhysicalFixture(); plan = fixture.physicalPlan; });

describe('Phase 9 physical stitch pipeline', () => {
  it('generates all seven scheduled objects', () => expect(plan.summary.generatedObjectPathCount).toBe(7));
  it('creates one disposition for every scheduled object', () => expect(plan.dispositions).toHaveLength(plan.summary.sourceScheduledObjectCount));
  it('reports complete disposition coverage', () => expect(plan.summary.physicalDispositionCoveragePercent).toBe(100));
  it('has no silent scheduled-object drops', () => expect(plan.summary.silentScheduledObjectDropCount).toBe(0));
  it('has no duplicate physical dispositions', () => expect(plan.summary.duplicatePhysicalDispositionCount).toBe(0));
  it('preserves the Phase 8 execution order', () => expect(plan.executionOrder).toEqual(fixture.sequencePlan.executionSteps.map(item => item.objectId)));
  it('preserves Phase 8 thread blocks', () => expect(plan.threadBlockReferences).toEqual(fixture.sequencePlan.threadBlocks));
  it('preserves object thread IDs', () => { const threads = new Map(fixture.threadedObjectMaterialization.objects.map(item => [item.id, item.threadId])); expect(plan.objectPaths.every(item => item.threadId === threads.get(item.objectId))).toBe(true); });
  it('generates running paths', () => expect(plan.summary.runningObjectPathCount).toBe(4));
  it('generates tatami paths', () => expect(plan.summary.tatamiObjectPathCount).toBe(2));
  it('generates satin paths', () => expect(plan.summary.satinObjectPathCount).toBe(1));
  it('generates physical top stitches', () => expect(plan.summary.topStitchCount).toBeGreaterThan(0));
  it('generates physical underlay stitches', () => expect(plan.summary.underlayStitchCount).toBeGreaterThan(0));
  it('does not generate canonical commands', () => expect(plan.metadata.canonicalCommandsGenerated).toBe(false));
  it('does not apply machine adaptation or encoding', () => expect([plan.metadata.machineAdaptationAdded, plan.metadata.encodingAdded]).toEqual([false, false]));
  it('blocks an object point-limit overflow without a partial path', () => { const limited = createPhysicalPointLimitFixture().objectLimit.physicalPlan; expect(limited.dispositions[0].reasonCode).toBe('PHYSICAL_GENERATION_LIMIT_EXCEEDED'); expect(limited.objectPaths).toEqual([]); });
  it('blocks a total point-limit overflow without truncation', () => { const limited = createPhysicalPointLimitFixture().totalLimit.physicalPlan; expect(limited.summary.pointLimitExceededCount).toBe(1); expect(limited.summary.truncatedPathCount).toBe(0); });
  it('is deterministic across complete runs', () => expect(createGenericMascotPhysicalFixture().physicalPlan).toEqual(plan));
});
