/**
 * Industrial Stitch Processor — StitchPath AI
 * ─────────────────────────────────────────────────────────────────────────────
 * Enhances stitch sequences for MACHINE STABILITY over aesthetics.
 *
 * Features:
 *   1. Redundant node elimination — remove consecutive duplicate points
 *   2. Mandatory underlay — grid foundation for fill/satin objects
 *   3. Tie-in / tie-off — locking stitches at start/end of every object
 *   4. Constant density normalization — consistent stitch spacing
 *   5. Color-grouped path optimization — nearest-neighbor within each color
 */

// ─── Physical constants (mm) ────────────────────────────────────────────────
const TIE_SIZE = 0.5;          // locking stitch length
const UNDERLAY_SPACING = 2.0;  // row spacing for underlay grid
const UNDERLAY_INSET = 0.3;    // inset from object bounding box
const DENSITY_TARGET = 3.0;    // target stitch spacing for normalization

// ═══════════════════════════════════════════════════════════════════════════
//  NODE CLEANUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Remove consecutive duplicate / near-duplicate points below tolerance.
 * Eliminates redundant nodes that cause needle wear and zero-length stitches.
 */
export function removeRedundantNodes(points, tolerance = 0.3) {
  if (!points || points.length < 2) return points || [];
  const result = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1];
    const dist = Math.hypot(points[i][0] - prev[0], points[i][1] - prev[1]);
    if (dist >= tolerance) result.push(points[i]);
  }
  return result;
}

/**
 * Normalize density: insert intermediate points where gaps exceed 1.5× target.
 * Ensures constant stitch spacing across the entire path.
 */
export function normalizeDensity(points, targetSpacing = DENSITY_TARGET) {
  if (!points || points.length < 2) return points || [];
  const result = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [px, py] = result[result.length - 1];
    const [cx, cy] = points[i];
    const dist = Math.hypot(cx - px, cy - py);
    if (dist > targetSpacing * 1.5) {
      const steps = Math.ceil(dist / targetSpacing);
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        result.push([px + (cx - px) * t, py + (cy - py) * t]);
      }
    }
    result.push(points[i]);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
//  TIE-IN / TIE-OFF (locking stitches)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tie-in: 4 small locking stitches at the start of an object.
 * Prevents thread from unraveling at the beginning of a sew block.
 */
export function generateTieIn(startPoint) {
  const [x, y] = startPoint;
  return [
    [x, y],
    [x + TIE_SIZE, y + TIE_SIZE * 0.3],
    [x - TIE_SIZE * 0.3, y + TIE_SIZE * 0.3],
    [x + TIE_SIZE * 0.5, y],
  ];
}

/**
 * Tie-off: 4 small locking stitches at the end of an object.
 * Secures thread before trim or color change.
 */
export function generateTieOff(endPoint) {
  const [x, y] = endPoint;
  return [
    [x + TIE_SIZE, y],
    [x - TIE_SIZE * 0.3, y + TIE_SIZE * 0.3],
    [x + TIE_SIZE, y + TIE_SIZE * 0.3],
    [x, y],
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
//  UNDERLAY (mandatory foundation)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate underlay stitches — boustrophedon grid inside the object's bbox.
 * Provides a stable foundation for fill/satin stitches, preventing fabric
 * distortion and improving sew stability.
 */
export function generateUnderlay(obj) {
  const pts = obj.points;
  if (!pts || pts.length < 3) return [];

  // Compute bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  // Inset from edge
  minX += UNDERLAY_INSET;
  minY += UNDERLAY_INSET;
  maxX -= UNDERLAY_INSET;
  maxY -= UNDERLAY_INSET;
  if (maxX <= minX || maxY <= minY) return [];

  const underlayPoints = [];
  let y = minY;
  let flip = false;
  while (y <= maxY) {
    if (flip) {
      underlayPoints.push([maxX, y]);
      underlayPoints.push([minX, y]);
    } else {
      underlayPoints.push([minX, y]);
      underlayPoints.push([maxX, y]);
    }
    flip = !flip;
    y += UNDERLAY_SPACING;
  }
  return underlayPoints;
}

// ═══════════════════════════════════════════════════════════════════════════
//  PATH OPTIMIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Optimize object order: group by color, then nearest-neighbor within each group.
 * Minimizes color changes and jump distances for machine efficiency.
 */
export function optimizeObjectOrder(objects) {
  if (!objects || objects.length <= 1) return objects || [];

  // Group by color
  const colorGroups = new Map();
  for (const obj of objects) {
    const color = obj.color || '#000000';
    if (!colorGroups.has(color)) colorGroups.set(color, []);
    colorGroups.get(color).push(obj);
  }

  // Nearest-neighbor within each color group
  const ordered = [];
  let lastPos = [0, 0];

  for (const [, group] of colorGroups) {
    const remaining = [...group];
    while (remaining.length > 0) {
      let bestIdx = 0, bestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const pts = remaining[i].points;
        if (!pts || pts.length === 0) continue;
        const d = Math.hypot(pts[0][0] - lastPos[0], pts[0][1] - lastPos[1]);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      const next = remaining.splice(bestIdx, 1)[0];
      ordered.push(next);
      if (next.points && next.points.length > 0) {
        lastPos = next.points[next.points.length - 1];
      }
    }
  }

  return ordered;
}

// ═══════════════════════════════════════════════════════════════════════════
//  FULL OBJECT PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process a single object into industrial-grade stitch points.
 * Returns array of [x_mm, y_mm] (without offset) in sewing order:
 *   tie-in → underlay → main stitches (density-normalized) → tie-off
 *
 * @param {Object} obj — stitch object with points, stitch_type, etc.
 * @param {Object} machine — machine settings (uses minStitchLength)
 * @returns {Array<[number, number]>} stitch points in mm
 */
export function processObjectStitches(obj, machine) {
  const ms = machine;
  const rawPoints = obj.points || [];
  if (rawPoints.length < 2) return [];

  // 1. Remove redundant nodes
  const cleaned = removeRedundantNodes(rawPoints, ms.minStitchLength || 0.3);
  if (cleaned.length < 2) return [];

  // 2. Normalize density
  const normalized = normalizeDensity(cleaned);
  if (normalized.length < 2) return [];

  const result = [];

  // 3. Tie-in (locking stitches at start)
  result.push(...generateTieIn(normalized[0]));

  // 4. Underlay (mandatory for fill/satin objects)
  if (obj.stitch_type === 'fill' || obj.stitch_type === 'satin') {
    result.push(...generateUnderlay(obj));
  }

  // 5. Main stitches (density-normalized)
  result.push(...normalized);

  // 6. Tie-off (locking stitches at end)
  result.push(...generateTieOff(normalized[normalized.length - 1]));

  return result;
}