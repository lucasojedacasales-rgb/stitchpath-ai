import { describe, expect, it } from 'vitest';
import { distributeStitchIntervals, summarizeStitchLengths } from '../stitchGeneration/stitchLengthDistribution.js';

const distribute = (length, overrides = {}) => distributeStitchIntervals(length, { targetStitchLengthMm: 2, minimumStitchLengthMm: 1, maximumStitchLengthMm: 3, ...overrides });
describe('Phase 9 stitch length distribution', () => {
  it('distributes a segment evenly', () => expect(distribute(10).lengths).toEqual([2, 2, 2, 2, 2]));
  it('preserves exact total length', () => expect(distribute(11).lengths.reduce((sum, value) => sum + value, 0)).toBeCloseTo(11));
  it('keeps lengths above minimum when possible', () => expect(distribute(11).lengths.every(value => value >= 1)).toBe(true));
  it('keeps lengths below maximum when possible', () => expect(distribute(11).lengths.every(value => value <= 3)).toBe(true));
  it('avoids a tiny final remainder', () => expect(new Set(distribute(10.1).lengths).size).toBe(1));
  it('reports impossible short bounds explicitly', () => expect(distribute(0.5).warnings[0].code).toBe('STITCH_LENGTH_BOUNDS_MATHEMATICALLY_IMPOSSIBLE'));
  it('retains impossible short segments as one evidenced interval', () => expect(distribute(0.5).exceptionCode).toBe('PRESERVED_SHORT_SOURCE_SEGMENT'));
  it('rejects nonfinite lengths', () => expect(distribute(Infinity).valid).toBe(false));
  it('rejects zero target length', () => expect(distribute(5, { targetStitchLengthMm: 0 }).valid).toBe(false));
  it('rejects inverted bounds', () => expect(distribute(5, { minimumStitchLengthMm: 4, maximumStitchLengthMm: 2 }).valid).toBe(false));
  it('summarizes minimum', () => expect(summarizeStitchLengths([1, 2, 3]).minimumMm).toBe(1));
  it('summarizes maximum', () => expect(summarizeStitchLengths([1, 2, 3]).maximumMm).toBe(3));
  it('summarizes average', () => expect(summarizeStitchLengths([1, 2, 3]).averageMm).toBe(2));
  it('summarizes total', () => expect(summarizeStitchLengths([1, 2, 3]).totalMm).toBe(6));
  it('handles empty distributions', () => expect(summarizeStitchLengths([]).count).toBe(0));
});
