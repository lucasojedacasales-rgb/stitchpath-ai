// ── Tatami Fill Generator ─────────────────────────────────────────────────────
// Generates real stitch points from a polygon contour (canvas px coords).
// Returns { stitches: [[x0,y0,x1,y1], ...], totalStitches: number }
// Each stitch is a short line segment [startX, startY, endX, endY].

const TATAMI_OFFSETS = [0, 0.25, 0.5, 0.75]; // cyclic row offsets

/**
 * @param {Array<[number,number]>} polygon  - canvas px coords [[x,y],...]
 * @param {number} densityMm  - row spacing in mm (default 0.4)
 * @param {number} stitchLenMm - stitch pitch in mm (default 2.5)
 * @param {number} angleDeg   - fill angle in degrees (default 0 = horizontal rows)
 * @param {number} pxPerMm    - canvas pixels per mm
 */
export function generateTatamiFill(polygon, densityMm = 0.4, stitchLenMm = 2.5, angleDeg = 0, pxPerMm = 4) {
  if (!polygon || polygon.length < 3) return { stitches: [], totalStitches: 0 };

  const rowSpacingPx  = Math.max(1, densityMm * pxPerMm);
  const stitchPitchPx = Math.max(1, stitchLenMm * pxPerMm);
  // Half-length of each rendered stitch line (visual: ~2px at zoom=1)
  const halfLenPx = Math.max(1, (stitchLenMm * 0.4) * pxPerMm);

  const angle = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(-angle), sin = Math.sin(-angle);
  const cosR = Math.cos(angle), sinR = Math.sin(angle);

  // Rotate polygon into fill-angle space
  const rotated = polygon.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);

  const minY = Math.min(...rotated.map(p => p[1]));
  const maxY = Math.max(...rotated.map(p => p[1]));

  const stitches = [];
  let rowIdx = 0;

  for (let ry = minY + rowSpacingPx / 2; ry <= maxY; ry += rowSpacingPx) {
    const xs = scanlineIntersections(rotated, ry);
    if (xs.length < 2) { rowIdx++; continue; }
    xs.sort((a, b) => a - b);

    const cycleOffset = TATAMI_OFFSETS[rowIdx % 4] * stitchPitchPx;
    const forward = rowIdx % 2 === 0;

    for (let i = 0; i < xs.length - 1; i += 2) {
      const xL = xs[i], xR = xs[i + 1];
      const segLen = xR - xL;
      if (segLen < stitchPitchPx * 0.5) continue;

      // First stitch position with cyclic offset
      const firstX = xL + ((cycleOffset % stitchPitchPx + stitchPitchPx) % stitchPitchPx);

      const rowPoints = [];
      // Entry point at polygon edge
      rowPoints.push(forward ? xL : xR);
      // Interior stitch points
      for (let x = firstX; x < xR - 0.1; x += stitchPitchPx) {
        if (x > xL + 0.1) rowPoints.push(x);
      }
      // Exit point at polygon edge
      const exitX = forward ? xR : xL;
      if (Math.abs(exitX - rowPoints[rowPoints.length - 1]) > 0.1) rowPoints.push(exitX);

      const ordered = forward ? rowPoints : rowPoints.slice().reverse();

      for (const px of ordered) {
        // Stitch as short line in the fill direction
        // In rotated space: line goes along X axis (fill direction)
        const rx0 = px - halfLenPx, ry0 = ry;
        const rx1 = px + halfLenPx, ry1 = ry;
        // Rotate back to world space
        const wx0 = rx0 * cosR - ry0 * sinR;
        const wy0 = rx0 * sinR + ry0 * cosR;
        const wx1 = rx1 * cosR - ry1 * sinR;
        const wy1 = rx1 * sinR + ry1 * cosR;
        stitches.push([wx0, wy0, wx1, wy1]);
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