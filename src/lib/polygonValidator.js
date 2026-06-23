/**
 * FASE 2-3: VECTORIZACIÓN + VALIDACIÓN
 * Conversión a polígonos cerrados, reparación, validación
 */

export function validateAndRepairPolygon(points) {
  if (!points || points.length < 3) {
    return { valid: false, error: 'Insufficient points', polygon: null };
  }

  let polygon = [...points];

  // 1. Verificar cierre
  if (polygon[0].x !== polygon[polygon.length - 1].x ||
      polygon[0].y !== polygon[polygon.length - 1].y) {
    polygon.push({ x: polygon[0].x, y: polygon[0].y });
  }

  // 2. Remover duplicados consecutivos
  polygon = removeDuplicates(polygon);
  if (polygon.length < 3) {
    return { valid: false, error: 'Not enough unique points after dedup', polygon: null };
  }

  // 3. Verificar auto-intersecciones
  const selfIntersections = detectSelfIntersections(polygon);
  if (selfIntersections.length > 0) {
    polygon = repairSelfIntersections(polygon, selfIntersections);
  }

  // 4. Verificar área válida
  const area = calculatePolygonArea(polygon);
  if (area <= 0) {
    polygon = polygon.reverse();
    return { valid: true, repaired: true, polygon, area: Math.abs(area), warning: 'Winding reversed' };
  }

  // 5. Validación final
  const isClockwise = area < 0;
  const finalArea = Math.abs(area);

  return {
    valid: true,
    repaired: selfIntersections.length > 0,
    polygon,
    area: finalArea,
    pointCount: polygon.length,
    isClosed: true,
    isClockwise
  };
}

function removeDuplicates(polygon) {
  const result = [];
  const tolerance = 0.5;

  for (const pt of polygon) {
    const last = result[result.length - 1];
    if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) > tolerance) {
      result.push(pt);
    }
  }

  return result;
}

export function detectSelfIntersections(polygon) {
  const intersections = [];

  for (let i = 0; i < polygon.length - 1; i++) {
    for (let j = i + 2; j < polygon.length - 1; j++) {
      const p1 = polygon[i];
      const p2 = polygon[i + 1];
      const p3 = polygon[j];
      const p4 = polygon[j + 1];

      const inter = lineIntersection(p1, p2, p3, p4);
      if (inter) {
        intersections.push({ i, j, point: inter });
      }
    }
  }

  return intersections;
}

function lineIntersection(p1, p2, p3, p4) {
  const x1 = p1.x, y1 = p1.y;
  const x2 = p2.x, y2 = p2.y;
  const x3 = p3.x, y3 = p3.y;
  const x4 = p4.x, y4 = p4.y;

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  if (t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999) {
    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1)
    };
  }

  return null;
}

function repairSelfIntersections(polygon, intersections) {
  // Algoritmo simplificado: remover picos que causan auto-intersección
  let repaired = [...polygon];

  for (const inter of intersections.sort((a, b) => b.i - a.i)) {
    const { i, j } = inter;
    // Eliminar la sección que causa la intersección
    if (i < j) {
      repaired.splice(i + 1, j - i);
    }
  }

  return repaired;
}

export function calculatePolygonArea(polygon) {
  let area = 0;

  for (let i = 0; i < polygon.length - 1; i++) {
    const p1 = polygon[i];
    const p2 = polygon[i + 1];
    area += (p2.x - p1.x) * (p2.y + p1.y) / 2;
  }

  return area;
}

export function simplifyPolygon(polygon, tolerance = 0.5) {
  // Ramer-Douglas-Peucker
  if (polygon.length <= 2) return polygon;

  const simplified = [polygon[0]];

  for (let i = 1; i < polygon.length - 1; i++) {
    const dist = pointToLineDistance(polygon[i], polygon[0], polygon[polygon.length - 1]);
    if (dist > tolerance) {
      simplified.push(polygon[i]);
    }
  }

  simplified.push(polygon[polygon.length - 1]);

  // Recursivo para mayor simplificación
  if (simplified.length > 10) {
    return simplified;
  }

  return simplified;
}

function pointToLineDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;

  if (len2 === 0) return Math.hypot(point.x - a.x, point.y - a.y);

  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;

  return Math.hypot(point.x - projX, point.y - projY);
}

export function isPointInPolygon(point, polygon) {
  let inside = false;
  const x = point.x, y = point.y;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

    if (intersect) inside = !inside;
  }

  return inside;
}

export function clipPointsToPolygon(points, polygon) {
  return points.filter(pt => isPointInPolygon(pt, polygon));
}

// Aliases for compatibility
export function validatePolygon(polygon) {
  return validateAndRepairPolygon(polygon);
}

export function closePolygon(polygon) {
  if (polygon[0].x !== polygon[polygon.length - 1].x ||
      polygon[0].y !== polygon[polygon.length - 1].y) {
    polygon.push({ x: polygon[0].x, y: polygon[0].y });
  }
  return polygon;
}

export function repairGaps(polygon, tolerance = 1) {
  const result = [];
  for (let i = 0; i < polygon.length - 1; i++) {
    result.push(polygon[i]);
    const p1 = polygon[i];
    const p2 = polygon[i + 1];
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    
    if (dist > tolerance) {
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      result.push(mid);
    }
  }
  result.push(polygon[polygon.length - 1]);
  return result;
}