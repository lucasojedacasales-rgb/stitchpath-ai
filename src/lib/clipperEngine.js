/**
 * Polygon Clipping Engine
 * Implements Sutherland-Hodgman algorithm for robust polygon clipping
 * Ensures all stitches stay within vector boundaries
 */

// ─── Geometric Primitives ──────────────────────────────────────────

function lineIntersection(p1, p2, p3, p4) {
  const x1 = p1[0], y1 = p1[1];
  const x2 = p2[0], y2 = p2[1];
  const x3 = p3[0], y3 = p3[1];
  const x4 = p4[0], y4 = p4[1];

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null; // parallel

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}

function pointInPolygon(point, polygon) {
  const x = point[0], y = point[1];
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];

    const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointOnSegment(p, a, b, tolerance = 1e-6) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < tolerance) return Math.hypot(p[0] - a[0], p[1] - a[1]) < tolerance;

  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));

  const closest = [a[0] + t * dx, a[1] + t * dy];
  return Math.hypot(p[0] - closest[0], p[1] - closest[1]) < tolerance;
}

// ─── Sutherland-Hodgman Polygon Clipping ───────────────────────────

function clipPolygonByEdge(polygon, edgeStart, edgeEnd) {
  if (polygon.length === 0) return [];

  const output = [];
  const dx = edgeEnd[0] - edgeStart[0];
  const dy = edgeEnd[1] - edgeStart[1];

  // Normal to the edge (pointing inward for CCW polygons)
  const normal = [-dy, dx];
  const normLen = Math.hypot(normal[0], normal[1]);
  const normUnit = normLen > 0 ? [normal[0] / normLen, normal[1] / normLen] : [0, 1];

  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i];
    const previous = polygon[i === 0 ? polygon.length - 1 : i - 1];

    // Test if points are on the "inside" of the edge
    const currVec = [current[0] - edgeStart[0], current[1] - edgeStart[1]];
    const prevVec = [previous[0] - edgeStart[0], previous[1] - edgeStart[1]];

    const currDot = currVec[0] * normUnit[0] + currVec[1] * normUnit[1];
    const prevDot = prevVec[0] * normUnit[0] + prevVec[1] * normUnit[1];

    const currInside = currDot >= -1e-10;
    const prevInside = prevDot >= -1e-10;

    if (currInside) {
      if (!prevInside) {
        // Entering: add intersection
        const inter = lineIntersection(previous, current, edgeStart, edgeEnd);
        if (inter) output.push(inter);
      }
      output.push([...current]);
    } else if (prevInside) {
      // Leaving: add intersection
      const inter = lineIntersection(previous, current, edgeStart, edgeEnd);
      if (inter) output.push(inter);
    }
  }

  return output;
}

/**
 * Main clip function: Subject polygon clipped by clip polygon
 */
export function clipPolygon(subject, clipPoly) {
  if (!subject || subject.length < 3 || !clipPoly || clipPoly.length < 3) {
    return [];
  }

  let output = [...subject];

  // Clip by each edge of the clip polygon
  for (let i = 0; i < clipPoly.length; i++) {
    if (output.length === 0) break;

    const edgeStart = clipPoly[i];
    const edgeEnd = clipPoly[(i + 1) % clipPoly.length];
    output = clipPolygonByEdge(output, edgeStart, edgeEnd);
  }

  return output;
}

// ─── Bounded Clipping (clip stitch paths to max rectangle) ──────────

export function clipPathToBounds(path, bounds) {
  if (!path || path.length < 2 || !bounds) return path;

  const { x, y, width, height } = bounds;
  const minX = x, maxX = x + width;
  const minY = y, maxY = y + height;

  const clipped = [];
  for (let i = 0; i < path.length; i++) {
    const current = path[i];
    const cx = current[0], cy = current[1];

    // Check if point is within bounds
    if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) {
      clipped.push(current);
    }
  }

  return clipped.length >= 2 ? clipped : [];
}

// ─── Point Clipping ────────────────────────────────────────────────

export function pointInsidePolygon(point, polygon) {
  return pointInPolygon(point, polygon);
}

export function clipPointToPolygon(points, polygon, mode = 'inside') {
  if (!polygon || polygon.length < 3) return points;

  return points.filter(p => {
    const inside = pointInPolygon(p, polygon);
    return mode === 'inside' ? inside : !inside;
  });
}

// ─── Segment Clipping (for stitches) ────────────────────────────────

export function clipSegmentToPolygon(p1, p2, polygon) {
  if (!polygon || polygon.length < 3) return null;

  const inside1 = pointInPolygon(p1, polygon);
  const inside2 = pointInPolygon(p2, polygon);

  // Both inside: return full segment
  if (inside1 && inside2) return [p1, p2];

  // Both outside: try to find intersection
  if (!inside1 && !inside2) {
    // Check if segment intersects polygon boundary
    for (let i = 0; i < polygon.length; i++) {
      const edgeStart = polygon[i];
      const edgeEnd = polygon[(i + 1) % polygon.length];
      const inter = lineIntersection(p1, p2, edgeStart, edgeEnd);
      if (inter && pointOnSegment(inter, p1, p2) && pointOnSegment(inter, edgeStart, edgeEnd)) {
        return null; // Segment crosses boundary but both ends outside
      }
    }
    return null;
  }

  // One inside, one outside: clip to boundary
  const outside = inside1 ? p2 : p1;
  const inside = inside1 ? p1 : p2;

  for (let i = 0; i < polygon.length; i++) {
    const edgeStart = polygon[i];
    const edgeEnd = polygon[(i + 1) % polygon.length];
    const inter = lineIntersection(inside, outside, edgeStart, edgeEnd);

    if (inter && pointOnSegment(inter, inside, outside) && pointOnSegment(inter, edgeStart, edgeEnd)) {
      return inside1 ? [p1, inter] : [inter, p2];
    }
  }

  return null;
}

// ─── Path Clipping (for full stitch sequences) ──────────────────────

export function clipPathToPolygon(stitchPath, polygon) {
  if (!stitchPath || stitchPath.length < 2 || !polygon || polygon.length < 3) {
    return [];
  }

  const clipped = [];
  let currentSegment = [];

  for (let i = 0; i < stitchPath.length - 1; i++) {
    const p1 = stitchPath[i];
    const p2 = stitchPath[i + 1];

    const result = clipSegmentToPolygon(p1, p2, polygon);

    if (result) {
      if (currentSegment.length === 0) {
        currentSegment.push(result[0]);
      }
      currentSegment.push(result[1]);
    } else {
      // Gap detected
      if (currentSegment.length >= 2) {
        clipped.push([...currentSegment]);
      }
      currentSegment = [];
    }
  }

  if (currentSegment.length >= 2) {
    clipped.push([...currentSegment]);
  }

  return clipped;
}

// ─── Validation ────────────────────────────────────────────────────

export function isValidClipPolygon(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  if (!polygon.every(p => Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number')) {
    return false;
  }
  return true;
}

export function calculateClipStatistics(originalPath, clippedPath) {
  const stats = {
    originalPoints: originalPath.reduce((sum, seg) => sum + seg.length, 0),
    clippedPoints: clippedPath.reduce((sum, seg) => sum + seg.length, 0),
    segments: clippedPath.length,
    retentionRate: 0,
    gapsIntroduced: 0
  };

  if (stats.originalPoints > 0) {
    stats.retentionRate = (stats.clippedPoints / stats.originalPoints);
    stats.gapsIntroduced = Math.max(0, stats.segments - 1);
  }

  return stats;
}