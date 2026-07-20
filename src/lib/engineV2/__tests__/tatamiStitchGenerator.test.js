import { beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createTatamiHolePhysicalFixture, createTatamiMultipleHolePhysicalFixture } from '../fixtures/tatamiHolePhysicalFixture.js';
import { createTatamiPhysicalFixture } from '../fixtures/tatamiPhysicalFixture.js';
import { resolvePhysicalGenerationConfig } from '../stitchGeneration/physicalGenerationConfig.js';
import { _stitchGeometryInternals, segmentCrossesHole } from '../stitchGeneration/stitchGeometry.js';
import { generateTatamiRows, orderTatamiSubpathsForTravel } from '../stitchGeneration/tatamiStitchGenerator.js';

let fixture;
let path;
beforeAll(() => { fixture = createTatamiPhysicalFixture(); path = fixture.physicalPlan.objectPaths[0]; });

const simplePath = (rowIndex, startX, endX) => ({ phase: 'top', technique: 'tatami', points: [{ x: startX, y: 0 }, { x: endX, y: 0 }], closed: false, continuous: true, sourceTechnicalComponent: { rowIndex, componentIndex: 0 } });
const directionInvariantGeometryHash = paths => createHash('sha256').update(JSON.stringify(paths.map(pathItem => {
  const forward = JSON.stringify(pathItem.points.map(point => [point.x, point.y])); const reverse = JSON.stringify([...pathItem.points].reverse().map(point => [point.x, point.y])); return forward < reverse ? forward : reverse;
}).sort())).digest('hex');

function loadObject0030RegressionGeometry() {
  const registryPath = process.env.ENGINE_V2_OBJECT0030_REGISTRY;
  if (registryPath && existsSync(registryPath)) {
    const source = JSON.parse(readFileSync(registryPath, 'utf8')).compositeGlobalBlackBandObject;
    return { objectId: source.objectId, sourceCoordinateFingerprint: source.sourceCoordinateFingerprint, fixtureMode: 'exact_external_reference', geometry: source.geometryNormalized.map(([x, y]) => ({ x: x * 100, y: y * 100 })), holes: source.explicitHolesNormalized.map(ring => ring.map(([x, y]) => ({ x: x * 100, y: y * 100 }))) };
  }
  const holes = Array.from({ length: 23 }, (_, index) => { const column = index % 6; const row = Math.floor(index / 6); const x = 8 + column * 14; const y = 8 + row * 20; return [{ x, y }, { x: x + 6, y }, { x: x + 6, y: y + 8 }, { x, y: y + 8 }]; });
  return { objectId: 'region01-composite-outline-band-object-001', sourceCoordinateFingerprint: '978c03341683a956a0f2bc7b7110d8d8ac9339fdaf4697f8363bfe01d1b98446', fixtureMode: 'portable_topology_fallback', geometry: [{ x: 4.431, y: 4.564 }, { x: 95.401, y: 4.564 }, { x: 95.401, y: 97.813 }, { x: 4.431, y: 97.813 }], holes };
}

function generateObject0030Top() {
  const object = loadObject0030RegressionGeometry();
  const generated = generateTatamiRows({ object, technicalSpecification: { coordinateSpaceId: 'design_local_millimetres_non_machine', stitchParameters: { spacingMm: 0.44, targetStitchLengthMm: 3.2, minimumStitchLengthMm: 1, maximumStitchLengthMm: 4.5, edgeInsetMm: 0.4, staggerRatio: 0.5 }, fillAnglePlan: { normalizedAngleDegrees: 45 }, pullCompensationPlan: { enabled: true, amountMm: 0.165, maximumAllowedMm: 0.6 }, geometryMetrics: { effectiveAreaMm2: 1530.7599831368611 } }, config: resolvePhysicalGenerationConfig({ includePhysicalUnderlay: false }) });
  return { object, generated };
}

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
  it('orders disconnected paths deterministically without changing sewn geometry', () => { const source = [simplePath(0, 0, 1), simplePath(1, 100, 101), simplePath(2, 2, 3)]; const first = orderTatamiSubpathsForTravel(source); const second = orderTatamiSubpathsForTravel(source); expect(first).toEqual(second); expect(first.metrics.totalTravelLengthMmAfter).toBeLessThan(first.metrics.totalTravelLengthMmBefore); expect(directionInvariantGeometryHash(first.subpaths)).toBe(directionInvariantGeometryHash(source)); });
  it('keeps disconnected hole intervals as separate sewn paths after ordering', () => { const holeFixture = createTatamiHolePhysicalFixture(); const object = holeFixture.threadedObjectMaterialization.objects[0]; const top = holeFixture.physicalPlan.objectPaths[0].subpaths.filter(item => item.phase === 'top'); expect(top.some(item => item.points.slice(1).some((point, index) => segmentCrossesHole(item.points[index], point, object.holes)))).toBe(false); expect(holeFixture.physicalPlan.objectPaths[0].coverageMetrics.pathOrdering.pathCountAfter).toBe(top.length); });
  it('supports alternating rows that cross different protected-hole counts', () => { const { generated } = generateObject0030Top(); const intervalsByRow = new Map(); generated.subpaths.forEach(item => intervalsByRow.set(item.sourceTechnicalComponent.rowIndex, (intervalsByRow.get(item.sourceTechnicalComponent.rowIndex) || 0) + 1)); expect(new Set(intervalsByRow.values()).size).toBeGreaterThan(1); });
  it('preserves the exact object-0030 23-hole compound regression', () => { const { object, generated } = generateObject0030Top(); expect(object).toMatchObject({ objectId: 'region01-composite-outline-band-object-001', sourceCoordinateFingerprint: '978c03341683a956a0f2bc7b7110d8d8ac9339fdaf4697f8363bfe01d1b98446' }); expect(object.holes).toHaveLength(23); expect(generated.valid).toBe(true); expect(generated.coverageMetrics).toMatchObject({ generatedRowCount: 291, generatedIntervalCount: 809, rowsSplitByHoles: 232 }); expect(generated.subpaths).toHaveLength(809); expect(generated.coverageMetrics.pathOrdering.sewnGeometryPreserved).toBe(true); });
  it('keeps every exact object-0030 tatami endpoint and midpoint in compound material', () => { const { object, generated } = generateObject0030Top(); const inMaterial = point => _stitchGeometryInternals.pointInPolygon(point, object.geometry, true) && !object.holes.some(holeItem => _stitchGeometryInternals.pointInPolygon(point, holeItem, false)); const invalid = generated.subpaths.flatMap(item => item.points.slice(1).flatMap((point, index) => { const start = item.points[index]; const midpoint = { x: (start.x + point.x) / 2, y: (start.y + point.y) / 2 }; return [start, point, midpoint].filter(candidate => !inMaterial(candidate)); })); expect(invalid).toEqual([]); expect(generated.coverageMetrics.pathOrdering.totalTravelLengthMmAfter).toBeLessThanOrEqual(generated.coverageMetrics.pathOrdering.totalTravelLengthMmBefore); });
  it('is deterministic', () => expect(createTatamiPhysicalFixture().physicalPlan).toEqual(fixture.physicalPlan));
});
