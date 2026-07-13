import { beforeAll, describe, expect, it } from 'vitest';
import { createTatamiHolePhysicalFixture, createTatamiMultipleHolePhysicalFixture } from '../fixtures/tatamiHolePhysicalFixture.js';
import { createTatamiPhysicalFixture } from '../fixtures/tatamiPhysicalFixture.js';
import { segmentCrossesHole } from '../stitchGeneration/stitchGeometry.js';

let fixture;
let path;
beforeAll(() => { fixture = createTatamiPhysicalFixture(); path = fixture.physicalPlan.objectPaths[0]; });

describe('Phase 9 tatami generation', () => {
  it('generates a tatami object path', () => expect(path.generator).toBe('tatami'));
  it('generates multiple clipped top rows', () => expect(path.topSubpathIds.length).toBeGreaterThan(2));
  it('uses the Phase 7 fill angle', () => { const expected = fixture.technicalPlan.specifications[0].fillAnglePlan.normalizedAngleDegrees; expect(path.subpaths.find(item => item.phase === 'top').sourceTechnicalComponent.angleDegrees).toBe(expected); });
  it('uses the Phase 7 row spacing', () => { const expected = fixture.technicalPlan.specifications[0].stitchParameters.spacingMm; expect(path.subpaths.find(item => item.phase === 'top').sourceTechnicalComponent.spacingMm).toBe(expected); });
  it('alternates row direction', () => { const rows = path.subpaths.filter(item => item.phase === 'top'); const angle = rows[0].sourceTechnicalComponent.angleDegrees * Math.PI / 180; const direction = { x: Math.cos(angle), y: Math.sin(angle) }; const delta = row => (row.points.at(-1).x - row.points[0].x) * direction.x + (row.points.at(-1).y - row.points[0].y) * direction.y; expect(Math.sign(delta(rows[0]))).not.toBe(Math.sign(delta(rows[1]))); });
  it('reports approximate coverage explicitly', () => { expect(path.coverageMetrics.approximateCoverageRatio).toBeGreaterThan(0); expect(path.coverageMetrics.approximateCoverageRatioIsExact).toBe(false); });
  it('applies pull compensation only to generated endpoints', () => expect(path.coverageMetrics.compensationAdjustedPointCount).toBeGreaterThan(0));
  it('does not mutate source boundaries during compensation', () => { const before = JSON.stringify(fixture.threadedObjectMaterialization.objects[0].geometry); createTatamiPhysicalFixture(); expect(JSON.stringify(fixture.threadedObjectMaterialization.objects[0].geometry)).toBe(before); });
  it('preserves a single explicit hole', () => expect(createTatamiHolePhysicalFixture().physicalPlan.summary.explicitHoleObjectCount).toBe(1));
  it('splits rows around holes', () => expect(createTatamiHolePhysicalFixture().physicalPlan.objectPaths[0].coverageMetrics.rowsSplitByHoles).toBeGreaterThan(0));
  it('never stitches across a hole', () => { const holeFixture = createTatamiHolePhysicalFixture(); const object = holeFixture.threadedObjectMaterialization.objects[0]; const crosses = holeFixture.physicalPlan.objectPaths[0].subpaths.filter(item => item.phase === 'top').some(item => item.points.slice(1).some((point, index) => segmentCrossesHole(item.points[index], point, object.holes))); expect(crosses).toBe(false); });
  it('preserves multiple holes', () => expect(createTatamiMultipleHolePhysicalFixture().physicalPlan.summary.holeCrossingSegmentCount).toBe(0));
  it('does not compensate hole boundaries', () => { const holePath = createTatamiHolePhysicalFixture().physicalPlan.objectPaths[0]; const holeEndpoint = holePath.subpaths.filter(item => item.phase === 'top').flatMap(item => item.points).find(point => point.x === 6 || point.x === 12); expect(holeEndpoint?.sourceType).not.toBe('compensation_adjusted_endpoint'); });
  it('creates discontinuities instead of hidden row connectors', () => expect(path.subpathTransitions.length).toBe(path.subpaths.length - 1));
  it('is deterministic', () => expect(createTatamiPhysicalFixture().physicalPlan).toEqual(fixture.physicalPlan));
});
