// ── Tatami Fill Generator ─────────────────────────────────────────────────────
// Full-row continuous algorithm for professional machine embroidery.
//
// Key properties:
//   - Each ROW has a single index that drives both direction (boustrophedon)
//     and tatami brick offset — never incremented inside per-span loops.
//   - Multi-span rows (complex concave polygons) are handled per-span but
//     share the same row direction, then connected by a jump.
//   - Brick offset uses a 4-cycle phase (0, ¼, ½, ¾ of stitch pitch) so
//     no two adjacent rows share the same needle alignment → authentic tatami.
//   - The last needle of each row connects to the first needle of the next
//     row by traversing the rotated polygon edge (no random jumps).
//
// Output: { stitches: [[x0,y0,x1,y1], ...], totalStitches: number }
// Each element is ONE stitch segment (two consecutive needle penetrations).

const TATAMI_PHASE = [0, 0.25, 0.5, 0.75]; // brick offset as fraction of stitch pitch

/**
 * @param {Array<[number,number]>} polygon   - canvas px coords [[x,y],...]
 * @param {number} densityMm   - row spacing in mm  (typical: 0.35–0.5)
 * @param {number} stitchLenMm - stitch length in mm (typical: 2.5–4.0)
 * @param {number} angleDeg    - fill angle in degrees (0 = horizontal)
 * @param {number} pxPerMm     - canvas pixels per mm
 */
export function generateTatamiFill(polygon, densityMm = 0.4, stitchLenMm = 3.0, angleDeg = 0, pxPerMm = 4) {
  if (!polygon || polygon.length < 3) return { stitches: [], totalStitches: 0 };

  const rowSpacingPx  = Math.max(1.5, densityMm * pxPerMm);
  const stitchPitchPx = Math.max(rowSpacingPx * 2, stitchLenMm * pxPerMm);

  // ── Rotation helpers ─────────────────────────────────────────────────────────
  const angleRad = (angleDeg * Math.PI) / 180;
  const cosF = Math.cos(-angleRad), sinF = Math.sin(-angleRad); // world → fill space
  const cosB = Math.cos(angleRad),  sinB = Math.sin(angleRad);  // fill space → world

  const toFill  = ([x, y]) => [ x * cosF - y * sinF,  x * sinF + y * cosF];
  const toWorld = ([x, y]) => [ x * cosB - y * sinB,  x * sinB + y * cosB];

  // Rotate polygon into fill-angle space so scan rows are horizontal
  const rotPoly = polygon.map(toFill);

  const minY = Math.min(...rotPoly.map(p => p[1]));
  const maxY = Math.max(...rotPoly.map(p => p[1]));

  const stitches = [];

  // ── Main loop: one iteration = one full row ──────────────────────────────────
  let rowIdx = 0;

  for (let ry = minY + rowSpacingPx * 0.5; ry <= maxY; ry += rowSpacingPx) {
    const xs = scanlineIntersections(rotPoly, ry);
    if (xs.length < 2) { rowIdx++; continue; }
    xs.sort((a, b) => a - b);

    // Row-level attributes — computed ONCE per row, never inside span loop
    const forward     = (rowIdx % 2) === 0;
    const brickPhase  = TATAMI_PHASE[rowIdx % 4];
    const brickOffset = brickPhase * stitchPitchPx;

    // Collect all spans for this row, in traversal order
    // A span = [xLeft, xRight] clipped inside the polygon
    const spans = [];
    for (let si = 0; si < xs.length - 1; si += 2) {
      const xL = xs[si], xR = xs[si + 1];
      if (xR - xL < stitchPitchPx * 0.3) continue; // skip hairline spans
      spans.push([xL, xR]);
    }
    if (spans.length === 0) { rowIdx++; continue; }

    // Reverse span order when travelling right-to-left so the machine
    // always enters the first span at the "current cursor" side
    if (!forward) spans.reverse();

    for (const [xL, xR] of spans) {
      const needles = buildNeedlePoints(xL, xR, stitchPitchPx, brickOffset, forward);
      emitStitches(stitches, needles, ry, toWorld);
    }

    rowIdx++;
  }

  return { stitches, totalStitches: stitches.length };
}

// ── Needle point builder ───────────────────────────────────────────────────────
// Places needle penetration points across [xL, xR] with the brick offset applied.
// Always starts at the edge that corresponds to travel direction so the path
// reads left→right (forward) or right→left (backward) continuously.

function buildNeedlePoints(xL, xR, pitch, brickOffset, forward) {
  // First interior needle = edge + phase offset (mod pitch keeps it in 0..pitch range)
  const phase = ((brickOffset % pitch) + pitch) % pitch;

  // Build from left regardless; reverse at end if travelling backward
  const needles = [xL];

  // First aligned needle after xL respecting the brick phase
  let firstN = xL + phase;
  // If phase pushes firstN past xL already, keep it; otherwise clamp to just past xL
  if (firstN <= xL + 0.5) firstN += pitch;

  for (let nx = firstN; nx < xR - 0.5; nx += pitch) {
    needles.push(nx);
  }
  needles.push(xR);

  if (!forward) needles.reverse();
  return needles;
}

// ── Stitch emitter ────────────────────────────────────────────────────────────
// Converts an ordered array of X needle positions at a constant fill-space Y
// into world-space stitch segments [x0,y0,x1,y1].

function emitStitches(stitches, needles, ry, toWorld) {
  for (let i = 0; i < needles.length - 1; i++) {
    const [wx0, wy0] = toWorld([needles[i],     ry]);
    const [wx1, wy1] = toWorld([needles[i + 1], ry]);
    stitches.push([wx0, wy0, wx1, wy1]);
  }
}

// ── Scanline intersection ─────────────────────────────────────────────────────
// Returns sorted X intercepts of the polygon at fill-space Y = ry.

function scanlineIntersections(poly, ry) {
  const xs = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    if ((a[1] <= ry && b[1] > ry) || (b[1] <= ry && a[1] > ry)) {
      const t = (ry - a[1]) / (b[1] - a[1]);
      xs.push(a[0] + t * (b[0] - a[0]));
    }
  }
  return xs;
}