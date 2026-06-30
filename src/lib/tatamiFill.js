/**
 * tatamiFill.js — Scanline Fill Generator for Embroidery
 *
 * Algorithm:
 *  1. Rotate polygon so fill lines are horizontal (angle-agnostic scanline)
 *  2. For each Y scanline (step = rowSpacing):
 *     a. Compute edge intersections (even-odd rule)
 *     b. Sort intersections → inside/outside pairs
 *     c. Place needle points across each span at stitchPitch intervals
 *     d. Alternate direction per row (boustrophedon zigzag)
 *     e. Apply tatami brick offset (4-phase cycle)
 *  3. Rotate all needle points back to world space
 *  4. Connect consecutive needles as stitch segments [x0,y0,x1,y1]
 *
 * Output: { stitches: [[x0,y0,x1,y1],...], totalStitches: number }
 */

const TATAMI_PHASES = [0, 0.25, 0.5, 0.75];

/**
 * @param {Array<[number,number]>} polygon   - canvas px coords [[x,y],...]
 * @param {number} densityMm   - row spacing in mm (typical: 0.35–0.5)
 * @param {number} stitchLenMm - stitch length in mm (typical: 2.5–4.0)
 * @param {number} angleDeg    - fill angle in degrees (0 = horizontal)
 * @param {number} pxPerMm     - canvas pixels per mm
 */
export function generateTatamiFill(polygon, densityMm = 0.4, stitchLenMm = 3.0, angleDeg = 0, pxPerMm = 4) {
  if (!polygon || polygon.length < 3) return { stitches: [], totalStitches: 0 };

  // ── Physical → pixel conversions ─────────────────────────────────────────────
  // Guard against degenerate pxPerMm (e.g. canvas not yet sized)
  const safePxPerMm   = Math.max(0.5, pxPerMm);
  const rowSpacingPx  = Math.max(1.0, densityMm  * safePxPerMm);
  const stitchPitchPx = Math.max(2.0, stitchLenMm * safePxPerMm);

  // ── Rotation helpers ──────────────────────────────────────────────────────────
  const rad  = (angleDeg * Math.PI) / 180;
  const cosF =  Math.cos(-rad), sinF = Math.sin(-rad); // world → fill-space
  const cosB =  Math.cos( rad), sinB = Math.sin( rad); // fill-space → world

  const toFill  = (x, y) => [ x * cosF - y * sinF,  x * sinF + y * cosF ];
  const toWorld = (x, y) => [ x * cosB - y * sinB,  x * sinB + y * cosB ];

  // ── Step 1: rotate polygon into fill-space ────────────────────────────────────
  const rotPoly = polygon.map(([x, y]) => toFill(x, y));

  const minY = Math.min(...rotPoly.map(p => p[1]));
  const maxY = Math.max(...rotPoly.map(p => p[1]));
  const minX = Math.min(...rotPoly.map(p => p[0]));
  const maxX = Math.max(...rotPoly.map(p => p[0]));

  // Sanity: polygon must have measurable extent
  if (maxY - minY < 1 || maxX - minX < 1) return { stitches: [], totalStitches: 0 };

  const stitches = [];
  let rowIdx = 0;

  // ── Step 2: scanline loop ─────────────────────────────────────────────────────
  // Start half a row inside the top edge so first row doesn't land on boundary
  for (let ry = minY + rowSpacingPx * 0.5; ry <= maxY - rowSpacingPx * 0.1; ry += rowSpacingPx) {

    // 2a. Edge intersections at this Y
    const xs = scanlineIntersections(rotPoly, ry);
    if (xs.length < 2) { rowIdx++; continue; }
    xs.sort((a, b) => a - b);

    // 2b. Build inside spans from even-odd pairs
    const spans = [];
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xL = xs[i], xR = xs[i + 1];
      if (xR - xL < 1.0) continue; // skip degenerate hairline spans
      spans.push([xL, xR]);
    }
    if (spans.length === 0) { rowIdx++; continue; }

    // 2c/2d. Direction and tatami phase per row
    const forward    = (rowIdx % 2) === 0;
    const brickPhase = TATAMI_PHASES[rowIdx % 4];
    const brickOff   = brickPhase * stitchPitchPx;

    // Reverse span traversal order when going right-to-left
    if (!forward) spans.reverse();

    let prevWorldX = null, prevWorldY = null;

    for (let si = 0; si < spans.length; si++) {
      const [xL, xR] = spans[si];

      // 2c. Place needle points across the span
      const needles = buildNeedlePoints(xL, xR, stitchPitchPx, brickOff, forward);
      if (needles.length < 2) continue;

      // Connect previous span end → this span start (intra-row travel stitch)
      if (prevWorldX !== null) {
        const [sx, sy] = toWorld(needles[0], ry);
        stitches.push([prevWorldX, prevWorldY, sx, sy]);
      }

      // Emit stitches along span
      for (let ni = 0; ni < needles.length - 1; ni++) {
        const [wx0, wy0] = toWorld(needles[ni],     ry);
        const [wx1, wy1] = toWorld(needles[ni + 1], ry);
        stitches.push([wx0, wy0, wx1, wy1]);
      }

      const lastNeedle = needles[needles.length - 1];
      const [lx, ly] = toWorld(lastNeedle, ry);
      prevWorldX = lx;
      prevWorldY = ly;
    }

    rowIdx++;
  }

  return { stitches, totalStitches: stitches.length };
}

// ── Needle point placer ───────────────────────────────────────────────────────
// Distributes needle penetrations across [xL, xR] with tatami brick offset.
// Returns X positions in traversal order (L→R or R→L).

function buildNeedlePoints(xL, xR, pitch, brickOff, forward) {
  const needles = [];

  // Start and end edge needle (always lands on polygon boundary)
  needles.push(xL);

  // Phase: how far into the pitch cycle this row starts
  const phase = ((brickOff % pitch) + pitch) % pitch;
  let first = xL + phase;
  if (first <= xL + 0.1) first += pitch;

  for (let nx = first; nx < xR - 0.1; nx += pitch) {
    needles.push(nx);
  }

  needles.push(xR);

  // Remove duplicates closer than 0.5px
  const deduped = [needles[0]];
  for (let i = 1; i < needles.length; i++) {
    if (needles[i] - deduped[deduped.length - 1] > 0.5) deduped.push(needles[i]);
  }

  if (!forward) deduped.reverse();
  return deduped;
}

// ── Scanline edge intersection ────────────────────────────────────────────────
// Standard even-odd scanline: returns all X where horizontal line Y=ry
// crosses a polygon edge. Uses the top-inclusive convention to avoid
// double-counting vertices.

function scanlineIntersections(poly, ry) {
  const xs = [];
  const n  = poly.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % n];
    // Top-inclusive: count edge if ry is in [min(ay,by), max(ay,by))
    if ((ay <= ry && by > ry) || (by <= ry && ay > ry)) {
      const t = (ry - ay) / (by - ay);
      xs.push(ax + t * (bx - ax));
    }
  }
  return xs;
}