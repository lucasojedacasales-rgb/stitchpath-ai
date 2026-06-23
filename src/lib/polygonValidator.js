/**
 * Polygon validation and repair utilities for embroidery digitization.
 * Ensures closed paths, repairs gaps, removes self-intersections.
 */

/**
 * Check if polygon is closed (first and last points match within tolerance)
 */
export function isPolygonClosed(pts, tolerance = 0.001) {
  if (!pts || pts.length < 3) return false;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const dist = Math.hypot(first[0] - last[0], first[1] - last[1]);
  return dist < tolerance;
}

/**
 * Close a polygon by adding the first point at the end if needed
 */
export function closePolygon(pts) {
  if (!pts || pts.length < 3) return pts;
  if (isPolygonClosed(pts)) return pts;
  return [...pts, [pts[0][0], pts[0][1]]];
}

/**
 * Find and repair small gaps in polygon (< threshold distance)
 */
export function repairGaps(pts, gapThreshold = 0.003) {
  if (!pts || pts.length < 3) return pts;
  const result = [];
  
  for (let i = 0; i < pts.length; i++) {
    const curr = pts[i];
    const next = pts[(i + 1) % pts.length];
    
    result.push(curr);
    
    const dist = Math.hypot(next[0] - curr[0], next[1] - curr[1]);
    
    // If gap is small, interpolate midpoint
    if (dist > 0 && dist < gapThreshold) {
      const mid = [
        (curr[0] + next[0]) / 2,
        (curr[1] + next[1]) / 2
      ];
      result.push(mid);
    }
  }
  
  // Remove last if it's a duplicate of first
  if (result.length > 3 && 
      Math.hypot(result[result.length-1][0] - result[0][0], 
                 result[result.length-1][1] - result[0][1]) < 0.001) {
    result.pop();
  }
  
  return result;
}

/**
 * Detect self-intersections using sweep line algorithm
 * Returns array of intersection points
 */
export function detectSelfIntersections(pts) {
  const intersections = [];
  
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = i + 2; j < pts.length - 1; j++) {
      // Skip adjacent edges
      if (j === i + 1 || (i === 0 && j === pts.length - 2)) continue;
      
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[j];
      const p4 = pts[j + 1];
      
      const intersection = lineIntersection(p1, p2, p3, p4);
      if (intersection) {
        intersections.push({ segmentA: i, segmentB: j, point: intersection });
      }
    }
  }
  
  return intersections;
}

/**
 * Check if point is inside polygon using ray casting
 */
export function isPointInPolygon(pt, polygon) {
  const [x, y] = pt;
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  
  return inside;
}

/**
 * Check if line segment intersects polygon boundary
 */
export function doesLineIntersectBoundary(p1, p2, polygon) {
  for (let i = 0; i < polygon.length; i++) {
    const polyP1 = polygon[i];
    const polyP2 = polygon[(i + 1) % polygon.length];
    
    const intersection = lineIntersection(p1, p2, polyP1, polyP2);
    if (intersection) {
      // Check if intersection is not at endpoints
      if (!pointEquals(intersection, p1) && !pointEquals(intersection, p2)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Clip line segment to polygon using Sutherland-Hodgman
 * Returns clipped segment or null if completely outside
 */
export function clipLineToPolygon(p1, p2, polygon) {
  let segment = [p1, p2];
  
  for (let i = 0; i < polygon.length; i++) {
    const edgeStart = polygon[i];
    const edgeEnd = polygon[(i + 1) % polygon.length];
    
    const clipped = clipLineToEdge(segment[0], segment[1], edgeStart, edgeEnd);
    if (!clipped) return null;
    
    segment = clipped;
  }
  
  return segment;
}

/**
 * Clip line segment to a half-plane defined by edge
 */
function clipLineToEdge(p1, p2, edgeStart, edgeEnd) {
  const inside1 = isLeftOfEdge(p1, edgeStart, edgeEnd);
  const inside2 = isLeftOfEdge(p2, edgeStart, edgeEnd);
  
  if (inside1 && inside2) return [p1, p2]; // both inside
  if (!inside1 && !inside2) return null;   // both outside
  
  // One inside, one outside - find intersection
  const intersection = lineIntersection(p1, p2, edgeStart, edgeEnd);
  if (!intersection) return null;
  
  if (inside1) return [p1, intersection];
  else return [intersection, p2];
}

/**
 * Check if point is on left side of directed edge (inside side)
 */
function isLeftOfEdge(pt, edgeStart, edgeEnd) {
  const cross = (edgeEnd[0] - edgeStart[0]) * (pt[1] - edgeStart[1]) -
                (edgeEnd[1] - edgeStart[1]) * (pt[0] - edgeStart[0]);
  return cross >= 0;
}

/**
 * Find intersection of two line segments
 * Returns intersection point or null if parallel/non-intersecting
 */
function lineIntersection(p1, p2, p3, p4) {
  const x1 = p1[0], y1 = p1[1];
  const x2 = p2[0], y2 = p2[1];
  const x3 = p3[0], y3 = p3[1];
  const x4 = p4[0], y4 = p4[1];
  
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null; // parallel
  
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
  
  if (t >= -1e-6 && t <= 1 + 1e-6 && u >= -1e-6 && u <= 1 + 1e-6) {
    return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
  }
  
  return null;
}

/**
 * Calculate polygon area using shoelace formula
 */
export function calculatePolygonArea(pts) {
  if (!pts || pts.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i][0] * pts[j][1];
    area -= pts[j][0] * pts[i][1];
  }
  return Math.abs(area) / 2;
}

/**
 * Validate polygon completely
 * Returns validation report
 */
export function validatePolygon(pts, regionName = 'unknown') {
  const report = {
    regionName,
    isValid: true,
    errors: [],
    warnings: [],
    metrics: {
      pointCount: pts?.length || 0,
      area: 0,
      perimeter: 0,
      isClosed: false
    }
  };
  
  if (!pts || pts.length < 3) {
    report.isValid = false;
    report.errors.push('Polygon has fewer than 3 points');
    return report;
  }
  
  // Check if closed
  report.metrics.isClosed = isPolygonClosed(pts);
  if (!report.metrics.isClosed) {
    report.errors.push('Polygon is not closed');
    report.isValid = false;
  }
  
  // Calculate metrics
  report.metrics.area = calculatePolygonArea(pts);
  report.metrics.perimeter = calculatePerimeter(pts);
  
  if (report.metrics.area < 0.001) {
    report.errors.push('Polygon area too small (< 0.001)');
    report.isValid = false;
  }
  
  // Check for self-intersections
  const intersections = detectSelfIntersections(pts);
  if (intersections.length > 0) {
    report.warnings.push(`${intersections.length} self-intersection(s) detected`);
  }
  
  // Check for gaps
  for (let i = 0; i < pts.length - 1; i++) {
    const dist = Math.hypot(pts[i+1][0] - pts[i][0], pts[i+1][1] - pts[i][1]);
    if (dist > 0.01) {
      report.warnings.push(`Large gap detected at point ${i} (${dist.toFixed(4)} units)`);
    }
  }
  
  return report;
}

function calculatePerimeter(pts) {
  let perim = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    perim += Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]);
  }
  return perim;
}

function pointEquals(p1, p2, tolerance = 1e-6) {
  return Math.hypot(p1[0] - p2[0], p1[1] - p2[1]) < tolerance;
}