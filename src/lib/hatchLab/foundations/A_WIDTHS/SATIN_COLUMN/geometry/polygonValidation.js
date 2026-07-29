/**
 * polygonValidation.js — structural validation of a candidate polygon in mm.
 * Incompatible shapes are reported with concrete reasons, never repaired.
 */

export function shoelaceSignedArea(pts) {
  let a = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return a / 2;
}

export function perimeterMm(pts) {
  let p = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    p += Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]);
  }
  return p;
}

// Proper-crossing test between two segments, excluding shared endpoints.
function segmentsCross(a, b, c, d) {
  const cross = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function hasSelfIntersection(pts) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // Skip adjacent edges (they share a vertex by construction).
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      const c = pts[j];
      const d = pts[(j + 1) % n];
      if (segmentsCross(a, b, c, d)) return true;
    }
  }
  return false;
}

/**
 * Validates a polygon (mm) plus the identity/role metadata of its region.
 * region: { id, holes, region_class, type } — identity checks only, read-only.
 */
export function validatePolygonMm(pointsMm, region = {}, options = {}) {
  const minPoints = Number.isFinite(options.minPoints) ? options.minPoints : 4;
  const reasons = [];

  if (!Array.isArray(pointsMm) || pointsMm.length === 0) {
    return { valid: false, reasons: ['polygon is empty'], areaMm2: 0, perimeterMm: 0 };
  }
  for (const p of pointsMm) {
    if (!Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
      return { valid: false, reasons: ['polygon contains a non-finite point'], areaMm2: 0, perimeterMm: 0 };
    }
  }
  if (pointsMm.length < minPoints) reasons.push(`polygon has ${pointsMm.length} points, minimum is ${minPoints}`);

  // Consecutive duplicates must have been removed upstream (recorded, not silent).
  for (let i = 0; i < pointsMm.length; i++) {
    const j = (i + 1) % pointsMm.length;
    if (pointsMm[i][0] === pointsMm[j][0] && pointsMm[i][1] === pointsMm[j][1]) {
      reasons.push('polygon contains consecutive duplicate points');
      break;
    }
  }

  const signedArea = shoelaceSignedArea(pointsMm);
  const areaMm2 = Math.abs(signedArea);
  if (!(areaMm2 > 0)) reasons.push('polygon area is not positive');

  if (pointsMm.length >= minPoints && areaMm2 > 0 && hasSelfIntersection(pointsMm)) {
    reasons.push('polygon self-intersects');
  }

  // Identity / role constraints (straight-column foundation scope).
  if (!region || typeof region.id !== 'string' || region.id.length === 0) reasons.push('region identity (id) is missing');
  if (Array.isArray(region.holes) && region.holes.length > 0) reasons.push('region declares holes; foundation only admits hole-free polygons');
  const roleText = `${region.region_class || ''} ${region.type || ''}`.toLowerCase();
  if (/contour|outline/.test(roleText)) reasons.push('region role is contour/outline, incompatible with a filled straight column');
  if (/discard|detail_aux|auxiliary/.test(roleText)) reasons.push('region role is discarded or auxiliary detail');

  return {
    valid: reasons.length === 0,
    reasons,
    areaMm2,
    signedArea,
    perimeterMm: perimeterMm(pointsMm),
  };
}