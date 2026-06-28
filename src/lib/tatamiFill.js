// ── Tatami Fill Generator ─────────────────────────────────────────────────────
// Generates real machine embroidery stitch paths from a polygon.
// Output: { stitches: [[x0,y0,x1,y1], ...], totalStitches: number }
//
// Each stitch is ONE needle penetration — a segment from the previous
// needle point to the next, as a real embroidery machine produces them.
// Rows run full width (edge to edge) alternating direction (boustrophedon).
// Tatami offset shifts each row's start by stitchPitch/4 for the classic brick pattern.

const TATAMI_OFFSETS = [0, 0.25, 0.5, 0.75]; // fraction of stitch pitch per row cycle

/**
 * @param {Array<[number,number]>} polygon   - canvas px coords [[x,y],...]
 * @param {number} densityMm   - row spacing in mm  (typical: 0.35–0.5)
 * @param {number} stitchLenMm - stitch length in mm (typical: 2.5–4.0)
 * @param {number} angleDeg    - fill angle in degrees (0 = horizontal)
 * @param {number} pxPerMm     - canvas pixels per mm
 */
export function generateTatamiFill(polygon, densityMm = 0.4, stitchLenMm = 3.0, angleDeg = 0, pxPerMm = 4) {
  if (!polygon || polygon.length < 3) return { stitches: [], totalStitches: 0 };

  // Professional machine parameters
  // Row spacing = thread diameter territory (~0.35mm for 40wt, ~0.45mm for 30wt)
  const rowSpacingPx  = Math.max(1.5, densityMm * pxPerMm);
  // Stitch pitch = distance between needle penetrations along the row
  const stitchPitchPx = Math.max(rowSpacingPx * 2, stitchLenMm * pxPerMm);

  const angleRad = (angleDeg * Math.PI) / 180;
  const cosF = Math.cos(-angleRad), sinF = Math.sin(-angleRad); // into fill space
  const cosB = Math.cos(angleRad),  sinB = Math.sin(angleRad);  // back to world

  // Rotate polygon into fill-angle space so rows are horizontal
  const rotPoly = polygon.map(([x, y]) => [
    x * cosF - y * sinF,
    x * sinF + y * cosF,
  ]);

  const minY = Math.min(...rotPoly.map(p => p[1]));
  const maxY = Math.max(...rotPoly.map(p => p[1]));

  const stitches = [];
  let rowIdx = 0;

  for (let ry = minY + rowSpacingPx * 0.5; ry <= maxY; ry += rowSpacingPx) {
    const xs = scanlineIntersections(rotPoly, ry);
    if (xs.length < 2) { rowIdx++; continue; }
    xs.sort((a, b) => a - b);

    // Tatami brick offset for this row
    const brickOffset = TATAMI_OFFSETS[rowIdx % 4] * stitchPitchPx;
    const forward = rowIdx % 2 === 0;

    for (let si = 0; si < xs.length - 1; si += 2) {
      const xL = xs[si], xR = xs[si + 1];
      if (xR - xL < stitchPitchPx * 0.4) { rowIdx++; continue; }

      // Build needle penetration points for this span
      // Start at left edge, place needle points every stitchPitch with brick offset
      const needles = [xL];
      const firstNeedle = xL + ((brickOffset % stitchPitchPx + stitchPitchPx) % stitchPitchPx);
      for (let nx = firstNeedle; nx < xR - 0.5; nx += stitchPitchPx) {
        if (nx > xL + 0.5) needles.push(nx);
      }
      needles.push(xR);

      // Direction: alternate each row (boustrophedon = real machine behavior)
      if (!forward) needles.reverse();

      // Emit stitch segments: from needle[i] to needle[i+1]
      for (let ni = 0; ni < needles.length - 1; ni++) {
        const rx0 = needles[ni],     ry0 = ry;
        const rx1 = needles[ni + 1], ry1 = ry;
        // Rotate back to world coordinates
        stitches.push([
          rx0 * cosB - ry0 * sinB,
          rx0 * sinB + ry0 * cosB,
          rx1 * cosB - ry1 * sinB,
          rx1 * sinB + ry1 * cosB,
        ]);
      }
    }

    rowIdx++;
  }

  return { stitches, totalStitches: stitches.length };
}

function scanlineIntersections(poly, y) {
  const xs = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
      const t = (y - a[1]) / (b[1] - a[1]);
      xs.push(a[0] + t * (b[0] - a[0]));
    }
  }
  return xs;
}