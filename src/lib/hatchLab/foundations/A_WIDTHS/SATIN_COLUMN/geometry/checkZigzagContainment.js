/**
 * checkZigzagContainment.js — verifies the candidate zigzag stays inside (or on)
 * the polygon. Each consecutive segment is sampled at the configured fractions
 * (0 / 25 / 50 / 75 / 100 % by default). Pure: mutates nothing.
 */

import { isInsideOrOnPolygon } from './pointInPolygon.js';

export function checkZigzagContainment(pointsMm, polygonMm, options = {}) {
  const tol = Number.isFinite(options.containmentToleranceMm) ? options.containmentToleranceMm : 1e-4;
  const fractions = Array.isArray(options.containmentSampleFractions) && options.containmentSampleFractions.length
    ? options.containmentSampleFractions
    : [0, 0.25, 0.5, 0.75, 1];

  const pts = Array.isArray(pointsMm) ? pointsMm : [];
  const poly = Array.isArray(polygonMm) ? polygonMm : [];
  if (pts.length < 2 || poly.length < 3) {
    return {
      containmentStatus: 'unavailable', segmentsChecked: 0, samplesChecked: 0,
      outsideSampleCount: 0, outsideSegmentIndices: [], toleranceMm: tol, sampleFractions: fractions,
    };
  }

  const outsideSegments = [];
  let samplesChecked = 0;
  let outsideSampleCount = 0;

  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    let segmentOutside = 0;
    for (const f of fractions) {
      const sample = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      samplesChecked += 1;
      if (!isInsideOrOnPolygon(sample, poly, tol)) { outsideSampleCount += 1; segmentOutside += 1; }
    }
    if (segmentOutside > 0) outsideSegments.push(i);
  }

  return {
    containmentStatus: outsideSampleCount === 0 ? 'contained' : 'escapes',
    segmentsChecked: pts.length - 1,
    samplesChecked,
    outsideSampleCount,
    outsideSegmentIndices: outsideSegments,
    toleranceMm: tol,
    sampleFractions: fractions,
  };
}