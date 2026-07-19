import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createTatamiPhysicalFixture } from '../fixtures/tatamiPhysicalFixture.js';
import { DEFAULT_PHYSICAL_GENERATION_CONFIG, resolvePhysicalGenerationConfig } from '../stitchGeneration/physicalGenerationConfig.js';
import { generateTatamiRows, resolveTatamiSamplingStep } from '../stitchGeneration/tatamiStitchGenerator.js';

const SCALES = Object.freeze([
  { id: 'uniform-0.75', x: 0.75, y: 0.75 },
  { id: 'uniform-1.00', x: 1, y: 1 },
  { id: 'uniform-1.25', x: 1.25, y: 1.25 },
  { id: 'wilcom-non-uniform', x: 1.417274939173, y: 1.418811002662 },
]);
const SOURCE_GEOMETRY = Object.freeze([{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 31.1 }, { x: 0, y: 31.1 }]);
const stableHash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const quantile = (values, ratio) => {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * ratio;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
};

function probe(scale) {
  const geometry = SOURCE_GEOMETRY.map(point => ({ x: point.x * scale.x, y: point.y * scale.y }));
  const fixture = createTatamiPhysicalFixture({ geometry });
  const object = fixture.threadedObjectMaterialization.objects[0];
  const technicalSpecification = {
    ...fixture.technicalPlan.specifications[0],
    stitchParameters: { ...fixture.technicalPlan.specifications[0].stitchParameters, staggerRatio: 0 },
  };
  const result = generateTatamiRows({
    object,
    technicalSpecification,
    config: resolvePhysicalGenerationConfig({ includePhysicalUnderlay: false, experimentalPhysicalMmStitchLengthInvariant: true }),
    targetOverride: 4,
  });
  const lengths = result.subpaths.flatMap(subpath => subpath.points.slice(1).map((point, index) => Math.hypot(point.x - subpath.points[index].x, point.y - subpath.points[index].y)));
  const points = result.subpaths.flatMap(subpath => subpath.points);
  return {
    valid: result.valid,
    sourceGeometryHash: stableHash(SOURCE_GEOMETRY),
    outputPathHash: stableHash(result.subpaths),
    rowCount: result.coverageMetrics.generatedRowCount,
    segmentCount: lengths.length,
    minimum: Math.min(...lengths),
    p50: quantile(lengths, 0.5),
    p90: quantile(lengths, 0.9),
    p95: quantile(lengths, 0.95),
    p99: quantile(lengths, 0.99),
    maximum: Math.max(...lengths),
    totalSewnLength: lengths.reduce((sum, value) => sum + value, 0),
    hardMinimumViolations: lengths.filter(value => value < technicalSpecification.stitchParameters.minimumStitchLengthMm).length,
    maximumStitchViolations: lengths.filter(value => value > 7).length,
    zeroLengthSegments: lengths.filter(value => value === 0).length,
    topology: { subpathCount: result.subpaths.length, closedSubpathCount: result.subpaths.filter(item => item.closed).length },
    extents: {
      minX: Math.min(...points.map(point => point.x)), maxX: Math.max(...points.map(point => point.x)),
      minY: Math.min(...points.map(point => point.y)), maxY: Math.max(...points.map(point => point.y)),
    },
  };
}

describe('Phase 13B19S promoted physical-mm stitch-length invariant', () => {
  it('defaults true and retains an independent force-disable kill switch', () => {
    expect(DEFAULT_PHYSICAL_GENERATION_CONFIG.experimentalPhysicalMmStitchLengthInvariant).toBe(true);
    const disabled = resolvePhysicalGenerationConfig({ experimentalPhysicalMmStitchLengthInvariant: false });
    expect(disabled.experimentalPhysicalMmStitchLengthInvariant).toBe(false);
    expect(disabled.encoding).toBe(false);
  });

  it('preserves exact flag-off output parity', () => {
    const first = createTatamiPhysicalFixture({ config: { experimentalPhysicalMmStitchLengthInvariant: false } });
    const second = createTatamiPhysicalFixture({ config: { experimentalPhysicalMmStitchLengthInvariant: false } });
    expect(second.physicalPlan).toEqual(first.physicalPlan);
    expect(stableHash(first.physicalPlan)).toBe('71160a8b8ff6d7ff053c40f35f130593405e01a93d074f2aee4e80e3d23b55fd');
  });

  it('makes implicit promoted behavior identical to explicit flag-on behavior', () => {
    const implicit = createTatamiPhysicalFixture();
    const explicit = createTatamiPhysicalFixture({ config: { experimentalPhysicalMmStitchLengthInvariant: true } });
    expect(implicit.physicalPlan).toEqual(explicit.physicalPlan);
  });

  it.each([
    [{ x: 1, y: 0 }, { scaleX: 1.25, scaleY: 1.25 }, 3.2],
    [{ x: 0, y: 1 }, { scaleX: 1.417274939173, scaleY: 1.418811002662 }, 4 / 1.418811002662],
    [{ x: 1, y: 1 }, { scaleX: 2, scaleY: 1 }, 4 / Math.hypot(2 / Math.SQRT2, 1 / Math.SQRT2)],
  ])('uses the local direction-dependent transform scale', (localDirection, transform, expectedStep) => {
    const resolved = resolveTatamiSamplingStep({ targetPhysicalStepMm: 4, localDirection, modelToPhysicalTransform: transform, coordinatesAlreadyPhysicalMm: false, experimentalEnabled: true });
    expect(resolved.valid).toBe(true);
    expect(resolved.modelStepMm).toBeCloseTo(expectedStep, 12);
    expect(resolved.compensationApplied).toBe(true);
  });

  it('does not double compensate already physical coordinates', () => {
    const resolved = resolveTatamiSamplingStep({ targetPhysicalStepMm: 4, localDirection: { x: 0, y: 1 }, modelToPhysicalTransform: { scaleX: 2, scaleY: 3 }, coordinatesAlreadyPhysicalMm: true, experimentalEnabled: true });
    expect(resolved).toMatchObject({ valid: true, modelStepMm: 4, compensationApplied: false, reason: 'COORDINATES_ALREADY_PHYSICAL_MM' });
  });

  it('fails closed without a required model transform', () => {
    expect(resolveTatamiSamplingStep({ targetPhysicalStepMm: 4, localDirection: { x: 1, y: 0 }, coordinatesAlreadyPhysicalMm: false, experimentalEnabled: true })).toMatchObject({ valid: false, reason: 'MODEL_TO_PHYSICAL_TRANSFORM_REQUIRED' });
  });

  it('passes all four deterministic physical scale probes', () => {
    const first = SCALES.map(probe);
    const second = SCALES.map(probe);
    expect(second).toEqual(first);
    const base = first[1];
    first.forEach(result => {
      expect(result.valid).toBe(true);
      expect(result.sourceGeometryHash).toBe(base.sourceGeometryHash);
      expect(result.p90).toBeGreaterThanOrEqual(3.8);
      expect(result.p90).toBeLessThanOrEqual(4.2);
      expect(result.p95 / base.p95).toBeGreaterThanOrEqual(0.95);
      expect(result.p95 / base.p95).toBeLessThanOrEqual(1.05);
      expect(result.maximum).toBeLessThanOrEqual(7);
      expect(result.hardMinimumViolations).toBe(0);
      expect(result.maximumStitchViolations).toBe(0);
      expect(result.zeroLengthSegments).toBe(0);
      expect(result.topology.closedSubpathCount).toBe(0);
    });
  });
});
