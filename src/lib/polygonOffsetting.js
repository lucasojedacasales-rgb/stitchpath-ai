/**
 * Polygon Offsetting Engine
 * Generates inward/outward offsets for safety margins and compensations
 */

// ─── Vector Math ───────────────────────────────────────────────────

function normalize(vec) {
  const len = Math.hypot(vec[0], vec[1]);
  return len > 1e-10 ? [vec[0] / len, vec[1] / len] : [0, 0];
}

function perpendicular(vec) {
  return [-vec[1], vec[0]];
}

function scale(vec, s) {
  return [vec[0] * s, vec[1] * s];
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1]];
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1];
}

// ─── Offset Calculation ────────────────────────────────────────────

/**
 * Compute an offset polygon (inward or outward)
 * Uses parallel edge offsetting with miter joins at vertices
 */
export function offsetPolygon(polygon, distance, direction = 'inward') {
  if (!polygon || polygon.length < 3) return [];

  const sign = direction === 'inward' ? -1 : 1;
  const offset = Math.abs(distance);
  const offseted = [];

  for (let i = 0; i < polygon.length; i++) {
    const prev = polygon[(i - 1 + polygon.length) % polygon.length];
    const curr = polygon[i];
    const next = polygon[(i + 1) % polygon.length];

    // Edge vectors
    const edge1 = [curr[0] - prev[0], curr[1] - prev[1]];
    const edge2 = [next[0] - curr[0], next[1] - curr[1]];

    // Perpendiculars (normals), normalized
    const perp1 = normalize(perpendicular(edge1));
    const perp2 = normalize(perpendicular(edge2));

    // Offset edges
    const offsetPrev = scale(perp1, sign * offset);
    const offsetNext = scale(perp2, sign * offset);

    // Offset points
    const p1 = add(prev, offsetPrev);
    const p2 = add(curr, offsetPrev);
    const p3 = add(curr, offsetNext);
    const p4 = add(next, offsetNext);

    // Line intersection (miter join)
    const intersection = lineIntersection(p1, p2, p3, p4);

    if (intersection) {
      offseted.push(intersection);
    } else {
      // Fallback: use simple offset (bevel join)
      const avg = [(offsetPrev[0] + offsetNext[0]) / 2, (offsetPrev[1] + offsetNext[1]) / 2];
      offseted.push(add(curr, avg));
    }
  }

  return offseted;
}

/**
 * Line-line intersection
 */
function lineIntersection(p1, p2, p3, p4) {
  const x1 = p1[0], y1 = p1[1];
  const x2 = p2[0], y2 = p2[1];
  const x3 = p3[0], y3 = p3[1];
  const x4 = p4[0], y4 = p4[1];

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}

// ─── Multi-level Offsetting ────────────────────────────────────────

/**
 * Generate multiple offset levels (useful for underlay/stabilization)
 */
export function multiLevelOffset(polygon, baseOffset, levels = 2) {
  const result = [polygon];
  let current = polygon;

  for (let i = 0; i < levels - 1; i++) {
    current = offsetPolygon(current, baseOffset * (i + 1), 'inward');
    if (current.length >= 3) {
      result.push(current);
    } else {
      break;
    }
  }

  return result;
}

// ─── Pull Compensation ────────────────────────────────────────────

/**
 * Apply pull compensation: fabric shrinks slightly under stitching
 * Offset outward to compensate for fabric contraction
 */
export function applyPullCompensation(polygon, compensationFactor = 0.5) {
  const area = calculateArea(polygon);
  const perimeter = calculatePerimeter(polygon);
  
  // Estimate shrinkage: smaller fills shrink more
  const shrinkRate = Math.max(0.1, 1 - (area / (perimeter * perimeter)) * 0.5);
  const offsetDist = compensationFactor * shrinkRate;

  return offsetPolygon(polygon, offsetDist, 'outward');
}

// ─── Geometric Utilities ────────────────────────────────────────────

function calculateArea(polygon) {
  if (!polygon || polygon.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    area += p1[0] * p2[1] - p2[0] * p1[1];
  }
  return Math.abs(area) / 2;
}

function calculatePerimeter(polygon) {
  if (!polygon || polygon.length < 2) return 0;

  let perim = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    perim += distance(p1, p2);
  }
  return perim;
}

export function getPolygonMetrics(polygon) {
  return {
    area: calculateArea(polygon),
    perimeter: calculatePerimeter(polygon),
    pointCount: polygon.length,
    centroid: calculateCentroid(polygon)
  };
}

function calculateCentroid(polygon) {
  if (!polygon || polygon.length === 0) return [0, 0];

  let cx = 0, cy = 0;
  for (const p of polygon) {
    cx += p[0];
    cy += p[1];
  }
  return [cx / polygon.length, cy / polygon.length];
}

// ─── Validation ────────────────────────────────────────────────────

export function isValidOffsetPolygon(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  
  // Check all points are valid [x, y] pairs
  return polygon.every(p => 
    Array.isArray(p) && p.length === 2 && 
    typeof p[0] === 'number' && typeof p[1] === 'number' &&
    isFinite(p[0]) && isFinite(p[1])
  );
}

export function validateOffsetResult(original, offseted, expectedOffset) {
  const origMetrics = getPolygonMetrics(original);
  const offsetMetrics = getPolygonMetrics(offseted);

  return {
    originalValid: origMetrics.pointCount >= 3,
    offsetValid: offsetMetrics.pointCount >= 3,
    areaChange: offsetMetrics.area - origMetrics.area,
    perimeterChange: offsetMetrics.perimeter - origMetrics.perimeter,
    degenerate: offsetMetrics.area < 0.1 || offsetMetrics.pointCount < 3
  };
}