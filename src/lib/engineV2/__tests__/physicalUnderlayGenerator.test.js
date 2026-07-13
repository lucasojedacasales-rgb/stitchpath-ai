import { beforeAll, describe, expect, it } from 'vitest';
import { createRunningPhysicalFixture } from '../fixtures/runningPhysicalFixture.js';
import { createUnderlayPhysicalFixture } from '../fixtures/underlayPhysicalFixture.js';

let fixture;
beforeAll(() => { fixture = createUnderlayPhysicalFixture(); });
const underlay = value => value.physicalPlan.objectPaths[0].subpaths.filter(item => item.phase === 'underlay');

describe('Phase 9 physical underlay generation', () => {
  it('generates satin center-run underlay', () => expect(underlay(fixture.satin).some(item => item.technique === 'center_run')).toBe(true));
  it('generates tatami edge-run underlay', () => expect(underlay(fixture.tatami).some(item => item.technique === 'edge_run')).toBe(true));
  it('generates tatami-lattice underlay', () => expect(underlay(fixture.tatami).some(item => item.technique === 'tatami_lattice')).toBe(true));
  it('keeps underlay before top stitches', () => { const phases = fixture.tatami.physicalPlan.objectPaths[0].subpaths.map(item => item.phase); expect(phases.lastIndexOf('underlay')).toBeLessThan(phases.indexOf('top')); });
  it('uses the object thread rather than a new object', () => expect(fixture.tatami.physicalPlan.objectPaths[0].threadId).toBe(fixture.tatami.threadedObjectMaterialization.objects[0].threadId));
  it('does not create separate underlay object paths', () => expect(fixture.tatami.physicalPlan.objectPaths).toHaveLength(1));
  it('counts underlay points', () => expect(fixture.tatami.physicalPlan.objectPaths[0].underlayPointCount).toBeGreaterThan(0));
  it('counts underlay stitches', () => expect(fixture.tatami.physicalPlan.objectPaths[0].underlayStitchCount).toBeGreaterThan(0));
  it('keeps top stitches present after underlay', () => expect(fixture.tatami.physicalPlan.objectPaths[0].topStitchCount).toBeGreaterThan(0));
  it('does not generate running underlay', () => expect(createRunningPhysicalFixture().physicalPlan.objectPaths[0].underlaySubpathIds).toEqual([]));
  it('is deterministic for satin', () => expect(createUnderlayPhysicalFixture().satin.physicalPlan).toEqual(fixture.satin.physicalPlan));
  it('is deterministic for tatami', () => expect(createUnderlayPhysicalFixture().tatami.physicalPlan).toEqual(fixture.tatami.physicalPlan));
});
