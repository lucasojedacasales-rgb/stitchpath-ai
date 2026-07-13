import { beforeAll, describe, expect, it } from 'vitest';
import { createClosedOutlinePhysicalFixture } from '../fixtures/closedOutlinePhysicalFixture.js';
import { createRunningPhysicalFixture } from '../fixtures/runningPhysicalFixture.js';
import { generateRunningPhysicalPath } from '../stitchGeneration/runningStitchGenerator.js';

let fixture;
let path;
beforeAll(() => { fixture = createRunningPhysicalFixture(); path = fixture.physicalPlan.objectPaths[0]; });

describe('Phase 9 running stitch generation', () => {
  it('generates an open running path', () => expect(path.generator).toBe('running'));
  it('produces top stitches', () => expect(path.topStitchCount).toBeGreaterThan(0));
  it('preserves selected entry', () => expect(path.firstPhysicalPoint).toEqual(expect.objectContaining(fixture.sequencePlan.selectedEntryExitPairs[0].entryPoint)));
  it('preserves selected exit', () => expect(path.lastPhysicalPoint).toEqual(expect.objectContaining(fixture.sequencePlan.selectedEntryExitPairs[0].exitPoint)));
  it('retains source vertices in the sampled path', () => { const points = path.subpaths.flatMap(item => item.points); expect(fixture.threadedObjectMaterialization.objects[0].geometry.every(vertex => points.some(point => point.x === vertex.x && point.y === vertex.y))).toBe(true); });
  it('does not invent a centerline', () => expect(path.coverageMetrics.inventedCenterline).toBe(false));
  it('does not generate running underlay', () => expect(path.underlayStitchCount).toBe(0));
  it('uses one generated pass by default', () => expect(path.coverageMetrics.generatedPassCount).toBe(1));
  it('keeps physical commands absent', () => expect(path).not.toHaveProperty('commands'));
  it('is deterministic', () => expect(createRunningPhysicalFixture().physicalPlan).toEqual(fixture.physicalPlan));
  it('does not mutate source geometry', () => { const object = fixture.threadedObjectMaterialization.objects[0]; const before = JSON.stringify(object.geometry); createRunningPhysicalFixture(); expect(JSON.stringify(object.geometry)).toBe(before); });
  it('generates closed running outlines', () => { const closed = createClosedOutlinePhysicalFixture(); expect(closed.physicalPlan.objectPaths[0].subpaths.some(item => item.technique === 'running' && item.closed)).toBe(true); });
  it('generates complementary arcs for distinct closed anchors', () => { const closed = createClosedOutlinePhysicalFixture(); const result = generateRunningPhysicalPath({ object: closed.threadedObjectMaterialization.objects[0], technicalSpecification: closed.technicalPlan.specifications[0], selectedEntryExit: { entryPoint: { x: 0, y: 0 }, exitPoint: { x: 12, y: 8 } }, config: closed.physicalPlan.config }); expect(result.coverageMetrics.complementaryArcCount).toBe(2); });
  it('blocks malformed running geometry explicitly', () => { const result = generateRunningPhysicalPath({ object: { geometry: [] }, technicalSpecification: {}, selectedEntryExit: {}, config: { boundaryToleranceMm: 0.001 } }); expect(result.valid).toBe(false); expect(result.errors[0].code).toBe('RUNNING_SOURCE_GEOMETRY_INVALID'); });
});
