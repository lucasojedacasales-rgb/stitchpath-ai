/**
 * boundaryIntersections.js — intersection of a perpendicular section line
 * with every segment of the polygon boundary. No edge is ever invented:
 * when a station does not yield exactly two distinct intersections it is
 * reported as failed.
 */

/**
 * Intersects the infinite line { origin + t·dir } with each polygon edge.
 * Returns intersections sorted by t, deduplicated within toleranceMm.
 */
export function intersectSectionLine(pointsMm, origin, dir, toleranceMm = 1e-6) {
  const n = pointsMm.length;
  const hits = [];
  for (let i = 0; i < n; i++) {
    const a = pointsMm[i];
    const b = pointsMm[(i + 1) % n];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const denom = dir[0] * ey - dir[1] * ex; // cross(dir, edge)
    if (Math.abs(denom) < 1e-12) continue; // parallel edge
    const wx = a[0] - origin[0];
    const wy = a[1] - origin[1];
    const t = (wx * ey - wy * ex) / denom; // position along the section line
    const u = (wx * dir[1] - wy * dir[0]) / denom; // position along the edge: cross(w, dir) / cross(dir, edge)
    if (u >= 0 && u < 1) { // half-open so shared vertices are not double-counted
      hits.push({ t, point: [origin[0] + dir[0] * t, origin[1] + dir[1] * t] });
    }
  }
  hits.sort((p, q) => p.t - q.t);
  const deduped = [];
  for (const h of hits) {
    const last = deduped[deduped.length - 1];
    if (last && Math.abs(h.t - last.t) <= toleranceMm) continue;
    deduped.push(h);
  }
  return deduped;
}