/**
 * PROFESSIONAL STITCH ENGINE
 * Basado en algoritmos de Ink/Stitch + PEmbroider
 * Genera puntadas de calidad industrial: Fill, Satin, Running, Underlay
 */

// ─────────────────────────────────────────────────────────────────────────────
// FILL: Tatami con offsets y underlay automático
// ─────────────────────────────────────────────────────────────────────────────

export function generateFill(polygon, options = {}) {
  const {
    density = 0.7,           // 0.4=sparse, 1.0=dense
    angle = 45,              // degrees
    underlay = true,
    pullCompensation = 0.1,  // mm
    minLineLength = 1.0      // mm
  } = options;

  const stitches = [];
  const angleRad = (angle * Math.PI) / 180;
  const spacing = Math.max(0.3, 2.0 / density); // mm between scanlines

  // Offset inward for pull compensation
  const offsetPoly = offsetPolygonInward(polygon, pullCompensation);
  if (offsetPoly.length < 3) return stitches;

  // Underlay: perpendicular runstitch
  if (underlay) {
    const underlayStitches = generateUnderlay(offsetPoly, 45 + angle);
    stitches.push(...underlayStitches);
  }

  // Main fill: scanline tatami
  const scanlines = generateScanlines(offsetPoly, angleRad, spacing);
  
  for (let i = 0; i < scanlines.length; i++) {
    const line = scanlines[i];
    if (line.length < minLineLength) continue;

    // Alternate direction (tatami pattern)
    const isReverse = i % 2 === 1;
    const points = isReverse ? line.reverse() : line;
    
    // Add points as stitches
    for (const pt of points) {
      stitches.push({
        x: pt[0],
        y: pt[1],
        type: 'stitch',
        cmd: stitches.length === 0 ? 'move' : 'stitch'
      });
    }

    // Trim between lines (optional)
    if (i < scanlines.length - 1) {
      stitches.push({ type: 'trim', cmd: 'trim' });
    }
  }

  return stitches;
}

// ─────────────────────────────────────────────────────────────────────────────
// SATIN: Parallel lines for narrow shapes
// ─────────────────────────────────────────────────────────────────────────────

export function generateSatin(polygon, options = {}) {
  const {
    density = 0.5,           // width of satin coverage
    angle = 0,               // perpendicular to shape
    spacing = 0.4            // mm between parallel lines
  } = options;

  const stitches = [];
  const angleRad = (angle * Math.PI) / 180;

  // Generate parallel lines perpendicular to shape orientation
  const scanlines = generateScanlines(polygon, angleRad, spacing);
  
  for (let i = 0; i < scanlines.length; i++) {
    const line = scanlines[i];
    if (line.length < 0.5) continue;

    for (const pt of line) {
      stitches.push({
        x: pt[0],
        y: pt[1],
        type: 'stitch',
        cmd: stitches.length === 0 ? 'move' : 'stitch'
      });
    }
  }

  return stitches;
}

// ─────────────────────────────────────────────────────────────────────────────
// RUNNING STITCH: Simple outline contour
// ─────────────────────────────────────────────────────────────────────────────

export function generateRunningStitch(polygon, options = {}) {
  const {
    stitch_length = 1.5,     // mm per stitch
    offset = 0.2             // mm inward
  } = options;

  const stitches = [];
  
  // Offset polygon inward slightly
  const offsetPoly = offsetPolygonInward(polygon, offset);
  
  // Resample polygon to target stitch length
  const resampled = resamplePath(offsetPoly, stitch_length);
  
  for (const pt of resampled) {
    stitches.push({
      x: pt[0],
      y: pt[1],
      type: 'stitch',
      cmd: stitches.length === 0 ? 'move' : 'stitch'
    });
  }

  // Close the loop
  if (resampled.length > 0) {
    const first = resampled[0];
    stitches.push({
      x: first[0],
      y: first[1],
      type: 'stitch',
      cmd: 'stitch'
    });
  }

  return stitches;
}

// ─────────────────────────────────────────────────────────────────────────────
// UNDERLAY: Foundation stitching for stability
// ─────────────────────────────────────────────────────────────────────────────

export function generateUnderlay(polygon, angle) {
  const angleRad = (angle * Math.PI) / 180;
  const spacing = 1.0; // mm
  const stitches = [];

  const scanlines = generateScanlines(polygon, angleRad, spacing);
  
  for (const line of scanlines) {
    if (line.length < 0.5) continue;
    for (const pt of line) {
      stitches.push({
        x: pt[0],
        y: pt[1],
        type: 'stitch',
        color: 'underlay',
        cmd: stitches.length === 0 ? 'move' : 'stitch'
      });
    }
  }

  return stitches;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function generateScanlines(polygon, angleRad, spacing) {
  if (polygon.length < 3) return [];

  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  // Find bounding box in rotated space
  let minY = Infinity, maxY = -Infinity;
  for (const [x, y] of polygon) {
    const ry = -x * sin + y * cos;
    minY = Math.min(minY, ry);
    maxY = Math.max(maxY, ry);
  }

  if (minY >= maxY) return [];

  const scanlines = [];

  for (let ry = minY; ry <= maxY; ry += spacing) {
    const intersections = [];

    // Find line-polygon intersections
    for (let i = 0; i < polygon.length; i++) {
      const p1 = polygon[i];
      const p2 = polygon[(i + 1) % polygon.length];

      const ry1 = -p1[0] * sin + p1[1] * cos;
      const ry2 = -p2[0] * sin + p2[1] * cos;

      if ((ry1 <= ry && ry2 > ry) || (ry2 <= ry && ry1 > ry)) {
        const t = (ry - ry1) / (ry2 - ry1);
        const ix = p1[0] + t * (p2[0] - p1[0]);
        const iy = p1[1] + t * (p2[1] - p1[1]);
        intersections.push([ix, iy]);
      }
    }

    // Sort intersections
    intersections.sort((a, b) => {
      const aRx = a[0] * cos + a[1] * sin;
      const bRx = b[0] * cos + b[1] * sin;
      return aRx - bRx;
    });

    // Create line segments (pairs of intersections)
    for (let i = 0; i < intersections.length - 1; i += 2) {
      scanlines.push([intersections[i], intersections[i + 1]]);
    }
  }

  return scanlines;
}

function offsetPolygonInward(polygon, amount) {
  if (amount === 0 || polygon.length < 3) return polygon;

  const offset = [];
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const prev = polygon[(i - 1 + n) % n];
    const curr = polygon[i];
    const next = polygon[(i + 1) % n];

    const e1 = [curr[0] - prev[0], curr[1] - prev[1]];
    const e2 = [next[0] - curr[0], next[1] - curr[1]];
    const len1 = Math.hypot(e1[0], e1[1]) || 1;
    const len2 = Math.hypot(e2[0], e2[1]) || 1;

    const n1 = [-e1[1] / len1, e1[0] / len1];
    const n2 = [-e2[1] / len2, e2[0] / len2];

    const bis = [n1[0] + n2[0], n1[1] + n2[1]];
    const bisLen = Math.hypot(bis[0], bis[1]) || 1;
    
    const cosHalf = (n1[0] * (bis[0] / bisLen) + n1[1] * (bis[1] / bisLen));
    const miter = cosHalf > 0.1 ? amount / cosHalf : amount;

    offset.push([
      curr[0] + (bis[0] / bisLen) * Math.min(miter, amount * 2),
      curr[1] + (bis[1] / bisLen) * Math.min(miter, amount * 2)
    ]);
  }

  return offset;
}

function resamplePath(path, targetLength) {
  const resampled = [];
  
  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i];
    const p2 = path[i + 1];
    
    resampled.push(p1);
    
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const dist = Math.hypot(dx, dy);
    
    if (dist > targetLength) {
      const steps = Math.ceil(dist / targetLength);
      for (let step = 1; step < steps; step++) {
        const t = step / steps;
        resampled.push([p1[0] + dx * t, p1[1] + dy * t]);
      }
    }
  }
  
  if (path.length > 0) {
    resampled.push(path[path.length - 1]);
  }
  
  return resampled;
}