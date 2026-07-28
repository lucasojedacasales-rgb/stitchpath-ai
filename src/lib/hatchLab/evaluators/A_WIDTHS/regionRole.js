/**
 * regionRole.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A.1)
 * Region role detection, kept in its own module to avoid import cycles.
 */

import { CONTOUR_MARKERS } from './verifiedFieldMap.js';

export function isContourLike(region) {
  if (!region || typeof region !== 'object') return false;
  if (typeof region.type === 'string' && CONTOUR_MARKERS.typeValues.includes(region.type)) return true;
  if (typeof region.region_class === 'string' && CONTOUR_MARKERS.regionClassValues.includes(region.region_class)) return true;
  if (region[CONTOUR_MARKERS.parentField] != null) return true;
  return false;
}