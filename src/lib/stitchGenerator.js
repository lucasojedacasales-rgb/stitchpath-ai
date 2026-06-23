/**
 * FASE 4-5: GENERACIÓN DE PUNTADAS + CLIPPING OBLIGATORIO
 * Tatami, Satin, Run, Bean - con validación y clipping
 */

import { isPointInPolygon, clipPointsToPolygon } from './polygonValidator.js';

export function generateRegionStitches(polygon, options = {}) {
  const {
    stitchType = 'fill',
    density = 0.7,
    angle = 45,
    minArea = 5,
    safeFactor = 0.95
  } = options;

  let stitches = [];

  switch (stitchType) {
    case 'fill':
      stitches = generateTatamiStitches(polygon, { density, angle });
      break;
    case 'satin':
      stitches = generateSatinStitches(polygon, { density, angle });
      break;
    case 'running_stitch':
      stitches = generateRunStitches(polygon, { density });
      break;
    case 'bean':
      stitches = generateBeanStitches(polygon, { density });
      break;
    default:
      return [];
  }

  // ─── CLIPPING OBLIGATORIO: garantizar que TODAS las puntadas están en el polígono ───
  const clipped = clipPointsToPolygon(stitches, polygon);

  // Validación
  if (clipped.length === 0) {
    console.warn(`No stitches survived clipping for ${stitchType}`);
    return [];
  }

  const validRatio = clipped.length / Math.max(1, stitches.length);
  if (validRatio < 0.5) {
    console.warn(`Only ${(validRatio * 100).toFixed(1)}% of stitches survived clipping`);
  }

  return clipped;
}

/**
 * TATAMI: Líneas paralelas (relleno estándar)
 */
function generateTatamiStitches(polygon, options) {
  const { density = 0.7, angle = 45 } = options;
  const stitches = [];

  const bbox = getBoundingBox(polygon);
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Bounding box rotado
  const rotatedCorners = [];
  for (let y = bbox.minY; y <= bbox.maxY; y += 1) {
    for (let x = bbox.minX; x <= bbox.maxX; x += 1) {
      rotatedCorners.push({
        x: x * cos + y * sin,
        y: -x * sin + y * cos
      });
    }
  }

  const minRy = Math.min(...rotatedCorners.map(c => c.y));
  const maxRy = Math.max(...rotatedCorners.map(c => c.y));
  const spacing = Math.max(0.3, density);

  // Scanlines paralelas
  for (let ry = minRy; ry <= maxRy; ry += spacing) {
    const intersections = findScanlineIntersections(polygon, ry, rad);

    if (intersections.length < 2) continue;
    intersections.sort((a, b) => a - b);

    for (let i = 0; i < intersections.length - 1; i += 2) {
      const x1 = intersections[i];
      const x2 = intersections[i + 1];

      if (x2 - x1 < 0.1) continue;

      const lineStitches = interpolateLine(x1, ry, x2, ry, Math.min(0.5, density / 2), rad);
      stitches.push(...lineStitches);
    }
  }

  return stitches;
}

/**
 * SATIN: Zigzag entre dos líneas paralelas
 */
function generateSatinStitches(polygon, options) {
  const { density = 0.5, angle = 0 } = options;
  const stitches = [];

  const contour = extractPolygonContour(polygon);
  const offset1 = offsetPolygon(polygon, density / 2);
  const offset2 = offsetPolygon(polygon, -density / 2);

  if (!offset1 || !offset2) {
    return generateRunStitches(polygon, { density });
  }

  const points1 = resampleContour(offset1, density);
  const points2 = resampleContour(offset2, density);

  const minCount = Math.min(points1.length, points2.length);

  for (let i = 0; i < minCount; i++) {
    stitches.push(points1[i]);
    stitches.push(points2[i]);
  }

  return stitches;
}

/**
 * RUN STITCH: Contorno simple
 */
function generateRunStitches(polygon, options) {
  const { density = 1.0 } = options;
  const stitches = [];

  const contour = resampleContour(polygon, density);

  for (const pt of contour) {
    stitches.push(pt);
  }

  return stitches;
}

/**
 * BEAN STITCH: Detalles pequeños (3x línea)
 */
function generateBeanStitches(polygon, options) {
  const { density = 0.3 } = options;
  const stitches = [];

  const contour = resampleContour(polygon, density);

  for (let i = 0; i < contour.length - 1; i++) {
    const p1 = contour[i];
    const p2 = contour[i + 1];

    // Bean: 3x cada puntada
    stitches.push(p1);
    stitches.push(p1);
    stitches.push(p1);

    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    stitches.push(mid);
    stitches.push(mid);
    stitches.push(mid);
  }

  return stitches;
}

/**
 * HELPERS
 */

function getBoundingBox(polygon) {
  const xs = polygon.map(p => p.x);
  const ys = polygon.map(p => p.y);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

function findScanlineIntersections(polygon, scanY, angle) {
  const intersections = [];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  for (let i = 0; i < polygon.length - 1; i++) {
    const p1 = polygon[i];
    const p2 = polygon[i + 1];

    const ry1 = -p1.x * sin + p1.y * cos;
    const ry2 = -p2.x * sin + p2.y * cos;

    if ((ry1 <= scanY && ry2 > scanY) || (ry2 <= scanY && ry1 > scanY)) {
      const t = (scanY - ry1) / (ry2 - ry1);
      const rx = p1.x * cos + p1.y * sin + t * ((p2.x * cos + p2.y * sin) - (p1.x * cos + p1.y * sin));
      intersections.push(rx);
    }
  }

  return intersections;
}

function interpolateLine(x1, y1, x2, y2, step, angle) {
  const points = [];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const count = Math.max(1, Math.floor(dist / step));

  for (let i = 0; i <= count; i++) {
    const t = count > 0 ? i / count : 0;
    const rx = x1 + (x2 - x1) * t;
    const ry = y1 + (y2 - y1) * t;

    const x = rx * cos - ry * sin;
    const y = rx * sin + ry * cos;

    points.push({ x, y });
  }

  return points;
}

function resampleContour(polygon, step) {
  const points = [];
  let accDist = 0;

  for (let i = 0; i < polygon.length - 1; i++) {
    const p1 = polygon[i];
    const p2 = polygon[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy);

    if (dist === 0) continue;

    const steps = Math.ceil(dist / step);
    for (let j = 0; j <= steps; j++) {
      const t = steps > 0 ? j / steps : 0;
      points.push({
        x: p1.x + t * dx,
        y: p1.y + t * dy
      });
    }
  }

  return points;
}

function offsetPolygon(polygon, offset) {
  // Simplified offset: scale from centroid
  if (Math.abs(offset) < 0.01) return polygon;

  const cx = polygon.reduce((s, p) => s + p.x, 0) / polygon.length;
  const cy = polygon.reduce((s, p) => s + p.y, 0) / polygon.length;

  return polygon.map(p => ({
    x: cx + (p.x - cx) * (1 - offset / 10),
    y: cy + (p.y - cy) * (1 - offset / 10)
  }));
}

function extractPolygonContour(polygon) {
  return polygon;
}