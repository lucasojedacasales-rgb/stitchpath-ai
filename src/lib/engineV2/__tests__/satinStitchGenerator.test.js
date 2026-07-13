import { beforeAll, describe, expect, it } from 'vitest';
import { createSatinBlockingFixture } from '../fixtures/satinBlockingFixture.js';
import { createSatinPhysicalFixture } from '../fixtures/satinPhysicalFixture.js';
import { analyzeSatinCrossSections } from '../stitchGeneration/satinStitchGenerator.js';

let fixture;
let path;
beforeAll(() => { fixture = createSatinPhysicalFixture(); path = fixture.physicalPlan.objectPaths[0]; });
const analysisFor = input => analyzeSatinCrossSections({ object: input.threadedObjectMaterialization.objects[0], technicalSpecification: input.technicalPlan.specifications[0], config: input.physicalPlan.config });

describe('Phase 9 satin generation', () => {
  it('generates a satin object path', () => expect(path.generator).toBe('satin'));
  it('uses cross-section points', () => expect(path.subpaths.find(item => item.phase === 'top').points.every(point => ['satin_cross_section', 'compensation_adjusted_endpoint'].includes(point.sourceType))).toBe(true));
  it('generates a single continuous top subpath', () => expect(path.subpaths.filter(item => item.phase === 'top')).toHaveLength(1));
  it('alternates opposing rail endpoints', () => { const points = path.subpaths.find(item => item.phase === 'top').points; expect(Math.sign(points[0].y - points[1].y)).not.toBe(Math.sign(points[1].y - points[2].y)); });
  it('preserves selected entry through an anchor', () => expect(path.firstPhysicalPoint).toEqual(expect.objectContaining(fixture.sequencePlan.selectedEntryExitPairs[0].entryPoint)));
  it('preserves selected exit through an anchor', () => expect(path.lastPhysicalPoint).toEqual(expect.objectContaining(fixture.sequencePlan.selectedEntryExitPairs[0].exitPoint)));
  it('reports cross-section count', () => expect(path.coverageMetrics.sectionCount).toBeGreaterThan(2));
  it('reports width variation', () => expect(path.coverageMetrics.widthVariationRatio).toBeGreaterThanOrEqual(1));
  it('applies satin pull compensation', () => expect(path.coverageMetrics.compensationAdjustedPointCount).toBeGreaterThan(0));
  it('does not trace the polygon boundary as top satin', () => expect(path.topPointCount).toBeLessThan(path.coverageMetrics.sectionCount + 3));
  it('rejects satin holes without a tatami fallback', () => { const blocked = createSatinBlockingFixture().withHole; expect(blocked.physicalPlan.dispositions[0].status).toBe('blocked'); expect(blocked.physicalPlan.objectPaths).toHaveLength(0); });
  it('rejects branching satin geometry', () => expect(createSatinBlockingFixture().branching.physicalPlan.dispositions[0].status).toBe('blocked'));
  it('detects cross-section direction deterministically', () => expect(analysisFor(fixture)).toEqual(analysisFor(fixture)));
  it('does not mutate source geometry', () => { const before = JSON.stringify(fixture.threadedObjectMaterialization.objects[0].geometry); createSatinPhysicalFixture(); expect(JSON.stringify(fixture.threadedObjectMaterialization.objects[0].geometry)).toBe(before); });
});
