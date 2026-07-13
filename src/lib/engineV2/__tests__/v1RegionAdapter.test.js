import { describe, expect, it } from 'vitest';
import { adaptV1RegionToRegionV2, adaptV1RegionsToRegionV2 } from '../index.js';
import { createInvalidRegionsFixture } from '../fixtures/invalidRegionsFixture.js';

const options = { coordinateSpace: 'normalized' };
const invalid = createInvalidRegionsFixture();

describe('Phase 2 V1 region adapter', () => {
  it('prefers path_points and preserves artwork color independently', () => {
    const result = adaptV1RegionToRegionV2({
      id: 'legacy', color: '#12ab34', path_points: [[0, 0], [1, 0], [0, 1]],
      contour_points: [[0, 0], [0.5, 0], [0, 0.5]], sourceRegionId: 'source-7',
    }, options);
    expect(result.accepted).toBe(true);
    expect(result.region.visualColor).toBe('#12ab34');
    expect(result.region.threadId).toBeUndefined();
    expect(result.region.source).toMatchObject({ originalSourceId: 'legacy', sourceRegionId: 'source-7', sourceGeometryField: 'path_points' });
  });

  it('uses contour_points only as fallback', () => {
    const result = adaptV1RegionsToRegionV2(invalid.contourFallback, options);
    expect(result.acceptedCount).toBe(1);
    expect(result.regions[0].source.sourceGeometryField).toBe('contour_points');
    expect(result.warnings.some(item => item.code === 'CONTOUR_POINTS_FALLBACK')).toBe(true);
  });

  it('rejects missing IDs by default', () => {
    const result = adaptV1RegionsToRegionV2(invalid.missingId, options);
    expect(result.rejected[0].errors.some(item => item.code === 'MISSING_REGION_ID')).toBe(true);
  });

  it('generates deterministic IDs only when enabled', () => {
    const first = adaptV1RegionsToRegionV2(invalid.missingId, { ...options, generateMissingIds: true });
    const second = adaptV1RegionsToRegionV2(invalid.missingId, { ...options, generateMissingIds: true });
    expect(first.regions[0].id).toBe('region-v2-0001');
    expect(second.regions[0].id).toBe(first.regions[0].id);
  });

  it('detects duplicate IDs without corrupting the first region', () => {
    const result = adaptV1RegionsToRegionV2(invalid.duplicateIds, options);
    expect(result.acceptedCount).toBe(1);
    expect(result.rejected[0].errors.some(item => item.code === 'DUPLICATE_REGION_ID')).toBe(true);
  });

  it('skips hidden regions by default', () => {
    const result = adaptV1RegionsToRegionV2(invalid.hidden, options);
    expect(result.acceptedCount).toBe(0);
    expect(result.rejected[0].errors[0].code).toBe('HIDDEN_REGION_SKIPPED');
  });

  it('includes hidden regions only when requested', () => {
    const result = adaptV1RegionsToRegionV2(invalid.hidden, { ...options, includeHidden: true });
    expect(result.acceptedCount).toBe(1);
  });

  it('converts pixel and millimeter source regions', () => {
    const pixel = adaptV1RegionsToRegionV2(invalid.pixel, { coordinateSpace: 'pixel', sourceWidth: 100, sourceHeight: 100 });
    const millimeter = adaptV1RegionsToRegionV2(invalid.millimeter, { coordinateSpace: 'millimeter', designWidthMm: 50, designHeightMm: 100 });
    expect(pixel.regions[0].geometry[0]).toEqual({ x: 0.1, y: 0.1 });
    expect(millimeter.regions[0].geometry[0]).toEqual({ x: 0.1, y: 0.05 });
  });

  it('isolates invalid regions and does not mutate source arrays', () => {
    const source = [
      { id: 'good', path_points: [[0, 0], [0.5, 0], [0, 0.5]] },
      ...invalid.selfIntersecting,
    ];
    const before = structuredClone(source);
    const result = adaptV1RegionsToRegionV2(source, options);
    expect(result.acceptedCount).toBe(1);
    expect(result.rejectedCount).toBe(1);
    expect(result.mutationsDetected).toBe(false);
    expect(source).toEqual(before);
  });
});
