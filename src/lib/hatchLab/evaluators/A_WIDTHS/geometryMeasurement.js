/**
 * geometryMeasurement.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A)
 * Pure geometric measurement in mm. No rounding until the caller reports.
 */

import { MEASUREMENT_METHOD } from './evaluatorSchema.js';

const isPoint = p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/** Verified point sources: fills use path_points, contour objects contour_points. */
export function extractPoints(region) {
  if (!region || typeof region !== 'object') return { points: [], sourceField: null };
  if (Array.isArray(region.path_points) && region.path_points.length > 0) {
    return { points: region.path_points.filter(isPoint), sourceField: 'region.path_points' };
  }
  if (Array.isArray(region.contour_points) && region.contour_points.length > 0) {
    return { points: region.contour_points.filter(isPoint), sourceField: 'region.contour_points' };
  }
  return { points: [], sourceField: null };
}

function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return Math.abs(a) / 2;
}

/**
 * @returns {null | {measurementMethod, centerXMm, centerYMm, boundingWidthMm,
 *   boundingHeightMm, areaMm2, aspectRatio, pointCount, minimumX, maximumX,
 *   minimumY, maximumY, pointsSourceField, limitation}}
 */
export function measureRegion(region, convertPoint) {
  if (typeof convertPoint !== 'function') return null;
  const { points, sourceField } = extractPoints(region);
  if (points.length < 2) return null;

  const mm = points.map(convertPoint);
  let minimumX = Infinity, maximumX = -Infinity, minimumY = Infinity, maximumY = -Infinity;
  let sx = 0, sy = 0;
  for (const [x, y] of mm) {
    if (x < minimumX) minimumX = x;
    if (x > maximumX) maximumX = x;
    if (y < minimumY) minimumY = y;
    if (y > maximumY) maximumY = y;
    sx += x; sy += y;
  }
  const boundingWidthMm = maximumX - minimumX;
  const boundingHeightMm = maximumY - minimumY;

  return {
    measurementMethod: MEASUREMENT_METHOD,
    centerXMm: (minimumX + maximumX) / 2,
    centerYMm: (minimumY + maximumY) / 2,
    centroidXMm: sx / mm.length,
    centroidYMm: sy / mm.length,
    boundingWidthMm,
    boundingHeightMm,
    areaMm2: mm.length >= 3 ? polygonArea(mm) : null,
    aspectRatio: boundingHeightMm > 0 ? boundingWidthMm / boundingHeightMm : null,
    pointCount: mm.length,
    minimumX, maximumX, minimumY, maximumY,
    pointsSourceField: sourceField,
    limitation: 'bounding_box_width is valid as the main measurement for straight bars (barra_recta) only; it is NOT a universal local width profile for curved, tapered or capsule shapes.',
  };
}