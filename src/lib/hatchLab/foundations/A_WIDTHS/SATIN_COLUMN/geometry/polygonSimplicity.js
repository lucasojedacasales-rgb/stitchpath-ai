/**
 * polygonSimplicity.js — P1.F0.1 robust simple-polygon detection.
 *
 * Detects, with one explicit numeric epsilon:
 *  - strict crossings between non-adjacent edges
 *  - a non-adjacent vertex lying on an edge interior
 *  - contact (touch) between non-adjacent edges
 *  - collinear overlap between non-adjacent edges
 *  - zero-length edges
 *  - repeated (duplicated or reversed) edges
 *
 * Shared endpoints of genuinely adjacent edges are never a defect.
 */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const cross2 = (u, v) => u[0] * v[1] - u[1] * v[0];

export function orientation(a, b, c, eps) {
  const v = cross2(sub(b, a), sub(c, a));
  if (v > eps) return 1;
  if (v < -eps) return -1;
  return 0;
}

export function onSegment(a, b, p, eps) {
  if (orientation(a, b, p, eps) !== 0) return false;
  const minX = Math.min(a[0], b[0]) - eps, maxX = Math.max(a[0], b[0]) + eps;
  const minY = Math.min(a[1], b[1]) - eps, maxY = Math.max(a[1], b[1]) + eps;
  return p[0] >= minX && p[0] <= maxX && p[1] >= minY && p[1] <= maxY;
}

const samePoint = (a, b, eps) => Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps;

/**
 * Returns { simple, defects: [{ kind, edgeA, edgeB, detail }], epsilonMm }.
 * Edges are the closed-polygon edges i → (i+1) % n.
 */
export function analyzePolygonSimplicity(pointsMm, options = {}) {
  const eps = Number.isFinite(options.geometryEpsilonMm) ? options.geometryEpsilonMm : 1e-9;
  const defects = [];
  const pts = Array.isArray(pointsMm) ? pointsMm : [];
  const n = pts.length;
  if (n < 3) {
    return { simple: false, defects: [{ kind: 'insufficientPoints', edgeA: null, edgeB: null, detail: `${n} points` }], epsilonMm: eps, edgeCount: n };
  }

  const edge = (i) => [pts[i], pts[(i + 1) % n]];

  // Zero-length edges.
  for (let i = 0; i < n; i++) {
    const [a, b] = edge(i);
    if (samePoint(a, b, eps)) defects.push({ kind: 'zeroLengthEdge', edgeA: i, edgeB: null, detail: `edge ${i} has zero length` });
  }

  // Repeated edges (same pair of endpoints, either direction).
  for (let i = 0; i < n; i++) {
    const [a1, b1] = edge(i);
    for (let j = i + 1; j < n; j++) {
      const [a2, b2] = edge(j);
      const identical = (samePoint(a1, a2, eps) && samePoint(b1, b2, eps)) || (samePoint(a1, b2, eps) && samePoint(b1, a2, eps));
      if (identical) defects.push({ kind: 'repeatedEdge', edgeA: i, edgeB: j, detail: `edges ${i} and ${j} share both endpoints` });
    }
  }

  const adjacent = (i, j) => i === j || (i + 1) % n === j || (j + 1) % n === i;

  for (let i = 0; i < n; i++) {
    const [a, b] = edge(i);
    for (let j = i + 1; j < n; j++) {
      if (adjacent(i, j)) continue;
      const [c, d] = edge(j);
      const o1 = orientation(a, b, c, eps);
      const o2 = orientation(a, b, d, eps);
      const o3 = orientation(c, d, a, eps);
      const o4 = orientation(c, d, b, eps);

      if (o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4) {
        defects.push({ kind: 'strictCrossing', edgeA: i, edgeB: j, detail: `edges ${i} and ${j} cross` });
        continue;
      }

      // Collinear overlap: all four orientations zero and the projections overlap
      // on more than a single point.
      if (o1 === 0 && o2 === 0 && o3 === 0 && o4 === 0) {
        const overlapping = onSegment(a, b, c, eps) || onSegment(a, b, d, eps) || onSegment(c, d, a, eps) || onSegment(c, d, b, eps);
        if (overlapping) {
          const touchesOnly = (samePoint(a, c, eps) || samePoint(a, d, eps) || samePoint(b, c, eps) || samePoint(b, d, eps))
            && !(onSegment(a, b, c, eps) && onSegment(a, b, d, eps))
            && !(onSegment(c, d, a, eps) && onSegment(c, d, b, eps));
          defects.push({
            kind: touchesOnly ? 'nonAdjacentEdgeContact' : 'collinearOverlap',
            edgeA: i, edgeB: j,
            detail: `edges ${i} and ${j} are collinear and ${touchesOnly ? 'touch' : 'overlap'}`,
          });
        }
        continue;
      }

      // A vertex of one edge lying on the other edge (touch / T-junction).
      const vertexOn = [
        [c, i, j, 'vertex of edge ' + j + ' on edge ' + i, onSegment(a, b, c, eps)],
        [d, i, j, 'vertex of edge ' + j + ' on edge ' + i, onSegment(a, b, d, eps)],
        [a, j, i, 'vertex of edge ' + i + ' on edge ' + j, onSegment(c, d, a, eps)],
        [b, j, i, 'vertex of edge ' + i + ' on edge ' + j, onSegment(c, d, b, eps)],
      ].filter((v) => v[4]);
      if (vertexOn.length > 0) {
        const shared = samePoint(a, c, eps) || samePoint(a, d, eps) || samePoint(b, c, eps) || samePoint(b, d, eps);
        defects.push({
          kind: shared ? 'nonAdjacentEdgeContact' : 'vertexOnNonAdjacentEdge',
          edgeA: i, edgeB: j,
          detail: vertexOn[0][3],
        });
      }
    }
  }

  return { simple: defects.length === 0, defects, epsilonMm: eps, edgeCount: n };
}

/** Backwards-compatible boolean surface used by the P1.F0 tests. */
export function hasSelfIntersection(pointsMm, options = {}) {
  return !analyzePolygonSimplicity(pointsMm, options).simple;
}