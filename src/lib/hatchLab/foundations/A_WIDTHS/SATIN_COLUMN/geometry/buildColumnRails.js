/**
 * buildColumnRails.js — perpendicular stations along the principal axis and
 * deterministic left/right rail classification.
 *
 * Left/right is defined by the sign of t along the canonical minor axis
 * (majorAxis rotated +90°): the smaller t is always the leftRailPoint.
 *
 * P1.F0.1: a failed station is never silently dropped. Failures are indexed and
 * the axial gaps they create are measured, so a caller can refuse to join the
 * rails across a hole in the sampling.
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
  const failedStationIndices = [];
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
      paired: hits.length === 2,
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
      failedStationIndices.push(stations.length);
      failedStations += 1;
    }
    stations.push(station);
  }

  const stationCount = stations.length;

  // Axial gaps between consecutive PAIRED stations. With every station paired the
  // gap equals spacingMm, so a gap is only counted when it exceeds it.
  const pairedPositions = stations.filter((st) => st.paired).map((st) => st.stationMm);
  let stationGapCount = 0;
  let maximumStationGapMm = 0;
  for (let i = 1; i < pairedPositions.length; i++) {
    const gap = pairedPositions[i] - pairedPositions[i - 1];
    if (gap > spacingMm * 1.5) {
      stationGapCount += 1;
      if (gap > maximumStationGapMm) maximumStationGapMm = gap;
    }
  }

  let minimumWidthMm = null, meanWidthMm = null, maximumWidthMm = null, widthVariationRatio = null;
  if (widths.length > 0) {
    minimumWidthMm = Math.min(...widths);
    maximumWidthMm = Math.max(...widths);
    meanWidthMm = widths.reduce((a, b) => a + b, 0) / widths.length;
    widthVariationRatio = meanWidthMm > 0 ? (maximumWidthMm - minimumWidthMm) / meanWidthMm : null;
  }

  const allStationsPaired = stationCount > 0 && failedStations === 0;

  return {
    stations,
    leftRail: stations.filter((st) => st.leftRailPoint).map((st) => st.leftRailPoint),
    rightRail: stations.filter((st) => st.rightRailPoint).map((st) => st.rightRailPoint),
    centerPoints: stations.filter((st) => st.centerPoint).map((st) => st.centerPoint),
    stationCount,
    successfulStations,
    failedStations,
    failedStationIndices,
    allStationsPaired,
    railsContiguous: allStationsPaired,
    stationGapCount,
    maximumStationGapMm,
    stationSuccessRatio: stationCount > 0 ? successfulStations / stationCount : 0,
    minimumWidthMm,
    meanWidthMm,
    maximumWidthMm,
    widthVariationRatio,
  };
}