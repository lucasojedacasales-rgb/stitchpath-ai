/**
 * pointInPolygon.js — pure point-in-polygon test with an explicit boundary
 * tolerance. A point on (or within toleranceMm of) the boundary counts as
 * inside, because a satin rail point sits exactly on the boundary.
 */

function distanceToSegment(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const wx = p[0] - a[0], wy = p[1] - a[1];
  const len2 = vx * vx + vy * vy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

export function distanceToPolygonBoundary(point, polygon) {
  let best = Infinity;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const d = distanceToSegment(point, polygon[i], polygon[(i + 1) % n]);
    if (d < best) best = d;
  }
  return best;
}

/** Ray-crossing interior test (no boundary tolerance). */
export function isStrictlyInside(point, polygon) {
  let inside = false;
  const n = polygon.length;
  const [x, y] = point;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside or on the boundary within toleranceMm. */
export function isInsideOrOnPolygon(point, polygon, toleranceMm = 0) {
  if (isStrictlyInside(point, polygon)) return true;
  return distanceToPolygonBoundary(point, polygon) <= toleranceMm;
}