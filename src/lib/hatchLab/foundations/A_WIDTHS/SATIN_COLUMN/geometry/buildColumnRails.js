/**
 * buildColumnRails.js — perpendicular stations along the principal axis and
 * deterministic left/right rail classification.
 *
 * Left/right is defined by the sign of t along the canonical minor axis
 * (majorAxis rotated +90°): the smaller t is always the leftRailPoint.
 */

import { intersectSectionLine } from './boundaryIntersections.js';

export function buildColumnRails(pointsMm, axis, options) {
  const { spacingMm, edgeMarginMm, dedupeToleranceMm } = options;
  const [cx, cy] = axis.centroidMm;
  const major = axis.majorAxis;
  const minor = axis.minorAxis;
  const { sMin, sMax } = axis.projection;

  const stations = [];
  const widths = [];
  let successfulStations = 0;
  let failedStations = 0;

  const start = sMin + edgeMarginMm;
  const end = sMax - edgeMarginMm;

  for (let s = start; s <= end + 1e-9; s += spacingMm) {
    const origin = [cx + major[0] * s, cy + major[1] * s];
    const hits = intersectSectionLine(pointsMm, origin, minor, dedupeToleranceMm);
    const station = {
      stationMm: s,
      intersectionCount: hits.length,
      leftRailPoint: null,
      rightRailPoint: null,
      centerPoint: null,
      widthMm: null,
      warnings: [],
    };
    if (hits.length === 2) {
      const [left, right] = hits; // sorted by t along minor axis → deterministic
      station.leftRailPoint = left.point;
      station.rightRailPoint = right.point;
      station.centerPoint = [(left.point[0] + right.point[0]) / 2, (left.point[1] + right.point[1]) / 2];
      station.widthMm = right.t - left.t;
      widths.push(station.widthMm);
      successfulStations += 1;
    } else {
      station.warnings.push(`expected exactly 2 intersections, found ${hits.length}`);
      failedStations += 1;
    }
    stations.push(station);
  }

  const stationCount = stations.length;
  let minimumWidthMm = null, meanWidthMm = null, maximumWidthMm = null, widthVariationRatio = null;
  if (widths.length > 0) {
    minimumWidthMm = Math.min(...widths);
    maximumWidthMm = Math.max(...widths);
    meanWidthMm = widths.reduce((a, b) => a + b, 0) / widths.length;
    widthVariationRatio = meanWidthMm > 0 ? (maximumWidthMm - minimumWidthMm) / meanWidthMm : null;
  }

  return {
    stations,
    leftRail: stations.filter((st) => st.leftRailPoint).map((st) => st.leftRailPoint),
    rightRail: stations.filter((st) => st.rightRailPoint).map((st) => st.rightRailPoint),
    stationCount,
    successfulStations,
    failedStations,
    stationSuccessRatio: stationCount > 0 ? successfulStations / stationCount : 0,
    minimumWidthMm,
    meanWidthMm,
    maximumWidthMm,
    widthVariationRatio,
  };
}