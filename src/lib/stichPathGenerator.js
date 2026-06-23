/**
 * Stitch Path Generator (Vector-Only)
 * CRITICAL: All stitch paths are generated ONLY from closed vector polygons
 * Never directly from image pixels
 */

import { clipPathToPolygon } from './clipperEngine';
import { offsetPolygon, applyPullCompensation, getPolygonMetrics } from './polygonOffsetting';

// ─── Tatami Fill Generation ────────────────────────────────────────

/**
 * Generate tatami (fill) stitches from a vector polygon
 * Only uses polygon geometry, no pixel data
 */
export function generateTatamiFill(polygon, config = {}) {
  if (!polygon || polygon.length < 3) return [];

  const {
    density = 0.7,
    angle = 45,
    pullCompensation = 0,
    underlayLayers = 1,
    maxStitchLength = 3,
    segmentDivisions = 1
  } = config;

  // Validate polygon
  if (!isValidPolygon(polygon)) return [];

  // Apply pull compensation if needed
  let workPolygon = polygon;
  if (pullCompensation > 0) {
    workPolygon = applyPullCompensation(polygon, pullCompensation);
    if (!isValidPolygon(workPolygon)) workPolygon = polygon;
  }

  const stitches = [];

  // Underlay layers
  if (underlayLayers > 0) {
    for (let layer = 0; layer < underlayLayers; layer++) {
      const underlayAngle = angle + (layer * 45); // Rotate each layer
      const underlayStitches = generateTatamiLayer(
        workPolygon,
        density * 0.4,
        underlayAngle,
        maxStitchLength,
        segmentDivisions
      );
      stitches.push(...underlayStitches.map(s => ({ ...s, isUnderlay: true })));
    }
  }

  // Main fill
  const fillStitches = generateTatamiLayer(
    workPolygon,
    density,
    angle,
    maxStitchLength,
    segmentDivisions
  );
  stitches.push(...fillStitches);

  // Clip all stitches to polygon boundary
  return clipStitchesToPolygon(stitches, workPolygon);
}

function generateTatamiLayer(polygon, density, angle, maxStitchLength, segmentDivisions) {
  const angleRad = (angle * Math.PI) / 180;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  // Get bounding box
  const bounds = getBounds(polygon);
  const { minX, minY, maxX, maxY } = bounds;
  const width = maxX - minX;
  const height = maxY - minY;

  // Spacing between stitch lines
  const spacing = Math.max(0.5, 3 / Math.max(0.1, density));

  // Diagonal length for coverage
  const diagLen = Math.hypot(width, height) + spacing * 2;

  const stitches = [];
  const lines = [];

  // Generate parallel lines in rotated space
  for (let pos = -diagLen; pos < diagLen; pos += spacing) {
    const y = pos;
    const x1 = -diagLen;
    const x2 = diagLen;

    // Rotate back to original space
    const p1x = minX + (x1 * cosA - y * sinA);
    const p1y = minY + (x1 * sinA + y * cosA);
    const p2x = minX + (x2 * cosA - y * sinA);
    const p2y = minY + (x2 * sinA + y * cosA);

    lines.push([[p1x, p1y], [p2x, p2y]]);
  }

  // Intersect lines with polygon
  for (const line of lines) {
    const segments = linePolygonIntersection(line[0], line[1], polygon);

    for (const segment of segments) {
      // Subdivide long segments
      const divisions = Math.ceil(
        Math.hypot(segment[1][0] - segment[0][0], segment[1][1] - segment[0][1]) / maxStitchLength
      );

      for (let i = 0; i < divisions; i++) {
        const t1 = i / divisions;
        const t2 = (i + 1) / divisions;

        const s1 = [
          segment[0][0] + t1 * (segment[1][0] - segment[0][0]),
          segment[0][1] + t1 * (segment[1][1] - segment[0][1])
        ];
        const s2 = [
          segment[0][0] + t2 * (segment[1][0] - segment[0][0]),
          segment[0][1] + t2 * (segment[1][1] - segment[0][1])
        ];

        stitches.push({
          from: s1,
          to: s2,
          type: 'tatami',
          length: Math.hypot(s2[0] - s1[0], s2[1] - s1[1])
        });
      }
    }
  }

  // Alternate direction per segment group
  return stitches;
}

// ─── Satin Line Generation ────────────────────────────────────────

/**
 * Generate satin (parallel lines) stitches from a vector polygon
 */
export function generateSatinLines(polygon, config = {}) {
  if (!polygon || polygon.length < 3) return [];

  const {
    density = 0.7,
    angle = 45,
    lineWidth = 2,
    maxStitchLength = 2
  } = config;

  if (!isValidPolygon(polygon)) return [];

  const stitches = [];
  const angleRad = (angle * Math.PI) / 180;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  const bounds = getBounds(polygon);
  const { minX, minY, maxX, maxY } = bounds;
  const spacing = Math.max(0.5, 2 / Math.max(0.1, density));
  const diagLen = Math.hypot(maxX - minX, maxY - minY) + spacing * 2;

  // Generate satin lines
  for (let pos = 0; pos < lineWidth; pos += spacing) {
    const offset = pos - lineWidth / 2;
    for (let angle_pos = -diagLen; angle_pos < diagLen; angle_pos += spacing) {
      const y = angle_pos;
      const x1 = -diagLen + offset;
      const x2 = diagLen + offset;

      const p1x = minX + (x1 * cosA - y * sinA);
      const p1y = minY + (x1 * sinA + y * cosA);
      const p2x = minX + (x2 * cosA - y * sinA);
      const p2y = minY + (x2 * sinA + y * cosA);

      const segments = linePolygonIntersection([p1x, p1y], [p2x, p2y], polygon);

      for (const seg of segments) {
        stitches.push({
          from: seg[0],
          to: seg[1],
          type: 'satin',
          length: Math.hypot(seg[1][0] - seg[0][0], seg[1][1] - seg[0][1])
        });
      }
    }
  }

  return clipStitchesToPolygon(stitches, polygon);
}

// ─── Running Stitch (Contour) ──────────────────────────────────────

/**
 * Generate running stitch along polygon boundary
 */
export function generateRunningStitch(polygon, config = {}) {
  if (!polygon || polygon.length < 3) return [];

  const {
    maxStitchLength = 1.5,
    offsetDistance = 0
  } = config;

  if (!isValidPolygon(polygon)) return [];

  // Apply offset if needed (inward for contour definition)
  let workPolygon = polygon;
  if (offsetDistance > 0) {
    workPolygon = offsetPolygon(polygon, offsetDistance, 'inward');
    if (!isValidPolygon(workPolygon)) workPolygon = polygon;
  }

  const stitches = [];

  // Walk polygon boundary
  for (let i = 0; i < workPolygon.length; i++) {
    const p1 = workPolygon[i];
    const p2 = workPolygon[(i + 1) % workPolygon.length];

    const dist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const divisions = Math.ceil(dist / maxStitchLength);

    for (let j = 0; j < divisions; j++) {
      const t1 = j / divisions;
      const t2 = (j + 1) / divisions;

      const s1 = [p1[0] + t1 * (p2[0] - p1[0]), p1[1] + t1 * (p2[1] - p1[1])];
      const s2 = [p1[0] + t2 * (p2[0] - p1[0]), p1[1] + t2 * (p2[1] - p1[1])];

      stitches.push({
        from: s1,
        to: s2,
        type: 'running_stitch',
        length: Math.hypot(s2[0] - s1[0], s2[1] - s1[1])
      });
    }
  }

  return stitches;
}

// ─── Clipping to Polygon ────────────────────────────────────────────

function clipStitchesToPolygon(stitches, polygon) {
  if (!polygon || polygon.length < 3) return stitches;

  return stitches.filter(stitch => {
    const { from, to } = stitch;
    const inFrom = pointInPolygon(from, polygon);
    const inTo = pointInPolygon(to, polygon);

    // Keep stitches that are at least partially inside
    return inFrom || inTo;
  });
}

function pointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];

    const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// ─── Line-Polygon Intersection ────────────────────────────────────

function linePolygonIntersection(p1, p2, polygon) {
  const segments = [];
  const intersections = [];

  // Find all intersections with polygon edges
  for (let i = 0; i < polygon.length; i++) {
    const v1 = polygon[i];
    const v2 = polygon[(i + 1) % polygon.length];

    const inter = segmentIntersection(p1, p2, v1, v2);
    if (inter) {
      intersections.push({
        point: inter,
        t: Math.hypot(inter[0] - p1[0], inter[1] - p1[1])
      });
    }
  }

  // Check endpoints
  if (pointInPolygon(p1, polygon)) {
    intersections.push({ point: p1, t: 0 });
  }
  if (pointInPolygon(p2, polygon)) {
    intersections.push({
      point: p2,
      t: Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
    });
  }

  // Sort and pair
  intersections.sort((a, b) => a.t - b.t);

  for (let i = 0; i < intersections.length - 1; i += 2) {
    if (intersections[i + 1]) {
      segments.push([intersections[i].point, intersections[i + 1].point]);
    }
  }

  return segments;
}

function segmentIntersection(p1, p2, p3, p4) {
  const x1 = p1[0], y1 = p1[1];
  const x2 = p2[0], y2 = p2[1];
  const x3 = p3[0], y3 = p3[1];
  const x4 = p4[0], y4 = p4[1];

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
  }

  return null;
}

// ─── Utility Functions ────────────────────────────────────────────

function isValidPolygon(polygon) {
  return (
    Array.isArray(polygon) &&
    polygon.length >= 3 &&
    polygon.every(
      p =>
        Array.isArray(p) &&
        p.length === 2 &&
        typeof p[0] === 'number' &&
        typeof p[1] === 'number' &&
        isFinite(p[0]) &&
        isFinite(p[1])
    )
  );
}

function getBounds(polygon) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const p of polygon) {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Calculate total stitch count (for estimates)
 */
export function calculateStitchCount(stitches) {
  return stitches.reduce((sum, s) => sum + (s.type === 'running_stitch' ? 1 : 1), 0);
}

/**
 * Convert stitch objects to path array
 */
export function stitchesToPath(stitches) {
  const path = [];

  for (const stitch of stitches) {
    path.push(stitch.from);
    path.push(stitch.to);
  }

  return path;
}