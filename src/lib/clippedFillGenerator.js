/**
 * clippedFillGenerator.js — Polygon-clipped scanline fill for embroidery
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates fill stitches INSIDE a polygon using scanline intersection.
 * No stitches are placed outside the polygon boundary.
 *
 * Algorithm:
 *   1. Rotate polygon so fill rows are horizontal (angle-agnostic)
 *   2. Scanline top→bottom at densityMm intervals
 *   3. For each row: compute polygon edge intersections → inside spans
 *   4. Place needles across each span at stitchLenMm intervals (boustrophedon)
 *   5. Jumps between spans (never stitches across gaps)
 *   6. Rotate points back to world space
 *   7. Post-process: split long (>7.5mm), merge micro (<0.8mm)
 *   8. Validate: pointInPolygon safety check
 *
 * Returns: Array<[x_mm, y_mm, 'J'|'S']>  ('J'=jump, 'S'=stitch, default 'S')
 */

const MAX_STITCH_MM = 7.5;
const MIN_STITCH_MM = 0.8;
const TATAMI_PHASES = [0, 0.25, 0.5, 0.75];

/**
 * @param {Array<[number,number]>} polygonMm — polygon in mm coordinates
 * @param {Object} options — { densityMm, stitchLenMm, angleDeg, regionId }
 * @returns {Array<[number, number, string]>} stitch points with optional 'J' flag
 */
export function generateClippedFillStitches(polygonMm, options = {}) {
  const {
    densityMm = 0.4,
    stitchLenMm = 3.0,
    angleDeg = 0,
    regionId = 'unknown',
  } = options;

  const log = (msg) => console.log(`[fill-clip] ${msg}`);
  log(`region: ${regionId}`);

  if (!polygonMm || polygonMm.length < 3) return [];
  log(`polygon points: ${polygonMm.length}`);

  // ── Rotation to fill-space (rows become horizontal) ──────────────────────
  const rad = (angleDeg * Math.PI) / 180;
  const cF = Math.cos(-rad), sF = Math.sin(-rad);
  const cB = Math.cos(rad), sB = Math.sin(rad);
  const toF = (x, y) => [x * cF - y * sF, x * sF + y * cF];
  const toW = (x, y) => [x * cB - y * sB, x * sB + y * cB];

  // Rotate polygon to fill-space
  const rp = polygonMm.map(([x, y]) => toF(x, y));
  const minY = Math.min(...rp.map(p => p[1]));
  const maxY = Math.max(...rp.map(p => p[1]));
  const minX = Math.min(...rp.map(p => p[0]));
  const maxX = Math.max(...rp.map(p => p[0]));

  if (maxY - minY < densityMm || maxX - minX < densityMm) return [];

  const rawPoints = []; // Array<[x_mm, y_mm, 'J'|'S']>
  let scanlineCount = 0;
  let intervalCount = 0;
  let jumpCount = 0;
  let rowIdx = 0;

  // ── Scanline loop ────────────────────────────────────────────────────────
  for (let ry = minY + densityMm * 0.5; ry < maxY; ry += densityMm) {
    const xs = _edgeIntersections(rp, ry);
    if (xs.length < 2) { rowIdx++; continue; }
    xs.sort((a, b) => a - b);

    // Build inside spans (even-odd rule: pair 0-1, 2-3, ...)
    const spans = [];
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (xs[i + 1] - xs[i] < 0.5) continue;
      spans.push([xs[i], xs[i + 1]]);
    }
    if (spans.length === 0) { rowIdx++; continue; }

    scanlineCount++;
    intervalCount += spans.length;

    // Boustrophedon: alternate direction each row
    const forward = (rowIdx % 2) === 0;
    const brickOff = TATAMI_PHASES[rowIdx % 4] * stitchLenMm;
    if (!forward) spans.reverse();

    for (let sIdx = 0; sIdx < spans.length; sIdx++) {
      const [xL, xR] = spans[sIdx];
      const needles = _placeNeedles(xL, xR, stitchLenMm, brickOff, forward);
      if (needles.length < 2) continue;

      // Jump to start of span (unless this is the very first point)
      if (rawPoints.length > 0) {
        const [wx, wy] = toW(needles[0], ry);
        rawPoints.push([wx, wy, 'J']);
        jumpCount++;
      }

      // Emit stitch points across this span
      for (let i = 0; i < needles.length; i++) {
        const [wx, wy] = toW(needles[i], ry);
        rawPoints.push([wx, wy, 'S']);
      }
    }

    rowIdx++;
  }

  log(`scanlines generated: ${scanlineCount}`);
  log(`intervals generated: ${intervalCount}`);
  log(`jumps between intervals: ${jumpCount}`);

  // ── Post-process: split long, merge micro, validate inside ───────────────
  const result = _postProcess(rawPoints, polygonMm, regionId, log);

  // ── Validation report ────────────────────────────────────────────────────
  let outsideCount = 0;
  let longCount = 0;
  let microCount = 0;
  let stitchCount = 0;
  let prevX = null, prevY = null;

  for (const pt of result) {
    if (pt[2] === 'J') { prevX = pt[0]; prevY = pt[1]; continue; }
    stitchCount++;
    if (!_pointInPolygon(pt[0], pt[1], polygonMm)) outsideCount++;
    if (prevX !== null) {
      const d = Math.hypot(pt[0] - prevX, pt[1] - prevY);
      if (d > MAX_STITCH_MM) longCount++;
      if (d > 0 && d < MIN_STITCH_MM) microCount++;
    }
    prevX = pt[0]; prevY = pt[1];
  }

  log(`stitches inside: ${stitchCount - outsideCount}`);
  log(`rejected outside: ${outsideCount}`);
  log(`long stitches split: ${longCount}`);
  log(`micro stitches merged: ${microCount}`);
  log(`validation outside count: ${outsideCount}`);

  if (outsideCount > 0) {
    console.warn(`[fill-clip] WARNING: ${outsideCount} stitches outside region ${regionId}`);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
//  POST-PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

function _postProcess(points, polygon, regionId, log) {
  const out = [];
  let splitCount = 0;
  let mergeCount = 0;
  let rejectedCount = 0;
  let prevX = null, prevY = null;

  for (const pt of points) {
    const [x, y, flag] = pt;
    const isJump = flag === 'J';

    if (isJump) {
      // Jumps pass through, but update prev position
      out.push([x, y, 'J']);
      prevX = x; prevY = y;
      continue;
    }

    // Validate inside polygon (safety check — scanline should guarantee this)
    if (!_pointInPolygon(x, y, polygon)) {
      rejectedCount++;
      // Convert to jump instead of dropping — preserves travel path
      out.push([x, y, 'J']);
      prevX = x; prevY = y;
      continue;
    }

    // Merge micro-stitches: skip if too close to previous stitch
    if (prevX !== null) {
      const d = Math.hypot(x - prevX, y - prevY);
      if (d < MIN_STITCH_MM && d > 0) {
        mergeCount++;
        continue; // skip this point
      }
    }

    // Split long stitches: insert intermediate points
    if (prevX !== null) {
      const d = Math.hypot(x - prevX, y - prevY);
      if (d > MAX_STITCH_MM) {
        const steps = Math.ceil(d / MAX_STITCH_MM);
        for (let s = 1; s < steps; s++) {
          const mx = prevX + (x - prevX) * s / steps;
          const my = prevY + (y - prevY) * s / steps;
          out.push([mx, my, 'S']);
        }
        splitCount++;
      }
    }

    out.push([x, y, 'S']);
    prevX = x; prevY = y;
  }

  log(`long stitches split: ${splitCount}`);
  log(`micro stitches merged: ${mergeCount}`);
  log(`rejected outside: ${rejectedCount}`);

  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
//  GEOMETRY HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** Ray-casting point-in-polygon test. */
function _pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Returns all X coordinates where horizontal line Y=ry crosses polygon edges. */
function _edgeIntersections(poly, ry) {
  const xs = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % n];
    if ((ay <= ry && by > ry) || (by <= ry && ay > ry)) {
      const t = (ry - ay) / (by - ay);
      xs.push(ax + t * (bx - ax));
    }
  }
  return xs;
}

/** Places needles at [xL, xR] boundary + interior points at pitch intervals. */
function _placeNeedles(xL, xR, pitch, brickOff, forward) {
  const phase = ((brickOff % pitch) + pitch) % pitch;
  const needles = [xL];

  let nx = xL + phase;
  if (nx <= xL + 0.3) nx += pitch;

  while (nx < xR - 0.3) {
    needles.push(nx);
    nx += pitch;
  }

  needles.push(xR);

  // Deduplicate
  const out = [needles[0]];
  for (let i = 1; i < needles.length; i++) {
    if (needles[i] - out[out.length - 1] > 0.3) out.push(needles[i]);
  }

  return forward ? out : out.reverse();
}