/**
 * embroideryRegressionFixtures.js — StitchPath AI
 * ─────────────────────────────────────────────────────────────────────────────
 * Synthetic rasterized fixtures + matching normalized regions for the
 * regression suite. Each fixture produces an {imageData} (RGBA bitmap) and a
 * {regions} array (normalized [0-1] polygons with colors + region_class).
 *
 * No imports — pure data generation. The dark-stroke mask is derived from the
 * bitmap pixels (real motor), not from the regions.
 */

const W = 200, H = 200;
const BLACK = [12, 12, 12];
const RED = [220, 40, 40];
const LIGHT_PINK = [255, 182, 196];
const DARK_PINK = [232, 134, 154];
const BLUE = [44, 84, 204];
const YELLOW = [240, 222, 64];
const GRAY = [210, 210, 210];

function makeImageData(bg = [255, 255, 255]) {
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = bg[0]; data[i * 4 + 1] = bg[1]; data[i * 4 + 2] = bg[2]; data[i * 4 + 3] = 255;
  }
  return { width: W, height: H, data };
}
function setPx(img, x, y, c) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
}
function fillDisk(img, cx, cy, r, c) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++)
    if (x * x + y * y <= r * r) setPx(img, cx + x, cy + y, c);
}
function fillEllipse(img, cx, cy, rx, ry, c) {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++)
    if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) setPx(img, cx + x, cy + y, c);
}
function ring(img, cx, cy, r, th, c) {
  for (let y = -r - th; y <= r + th; y++) for (let x = -r - th; x <= r + th; x++) {
    const d = Math.sqrt(x * x + y * y);
    if (d >= r - th && d <= r + th) setPx(img, cx + x, cy + y, c);
  }
}
function ellipseRing(img, cx, cy, rx, ry, th, c) {
  for (let a = 0; a < Math.PI * 2; a += 0.01) {
    const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
    fillDisk(img, x, y, th, c);
  }
}
function arc(img, cx, cy, r, a0, a1, th, c) {
  for (let a = a0; a <= a1; a += 0.02) {
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    fillDisk(img, x, y, th, c);
  }
}
function line(img, x0, y0, x1, y1, th, c) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    fillDisk(img, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, th, c);
  }
}
function drawPolygonRing(img, pts, th, c, closed = true) {
  for (let i = 0; i < pts.length - 1; i++) line(img, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], th, c);
  if (closed) line(img, pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1], th, c);
}

function circlePolygon(cx, cy, r, n = 40) {
  const pts = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return pts;
}
function ellipsePolygon(cx, cy, rx, ry, n = 48) {
  const pts = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return pts;
}
function blobPolygon(cx, cy, baseR, n = 72) {
  const pts = []; for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    const r = baseR + 16 * Math.sin(3 * a) + 9 * Math.cos(5 * a);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  } return pts;
}
function normPts(pts) { return pts.map(([x, y]) => [x / W, y / H]); }

// ─── FIXTURE 1: simple circle (red fill + black outline) ──────────────────────
export function makeCircleFixture() {
  const img = makeImageData();
  fillDisk(img, 100, 100, 68, RED);
  ring(img, 100, 100, 68, 2, BLACK);
  const regions = [{
    id: 'fill_body', name: 'body', color: '#dc2828', stitch_type: 'fill',
    region_class: 'fill', object_group: 'body', area_mm2: 12000,
    path_points: normPts(circlePolygon(100, 100, 68)),
  }];
  return { name: 'circle', imageData: img, regions, expect: { outerContour: true, fill: true, noBBox: true, noDiagonals: true } };
}

// ─── FIXTURE 2: simplified Kirby ──────────────────────────────────────────────
export function makeKirbyFixture() {
  const img = makeImageData();
  fillEllipse(img, 100, 92, 56, 62, LIGHT_PINK);   // body light pink
  fillEllipse(img, 100, 128, 50, 32, DARK_PINK);   // lower dark pink — NO black line between
  fillEllipse(img, 70, 168, 19, 13, RED);          // left foot
  fillEllipse(img, 130, 168, 19, 13, RED);         // right foot
  ellipseRing(img, 100, 92, 56, 62, 2, BLACK);     // body outer outline
  ring(img, 70, 168, 19, 2, BLACK);                // left foot outline
  ring(img, 130, 168, 19, 2, BLACK);               // right foot outline
  arc(img, 100, 112, 13, 0.25, 2.9, 2, BLACK);     // mouth (open smile)
  ring(img, 82, 76, 5, 1, BLACK);                  // left eye
  ring(img, 118, 76, 5, 1, BLACK);                 // right eye
  const regions = [
    { id: 'body_light', name: 'body_light', color: '#ffb6c4', stitch_type: 'fill', region_class: 'fill', object_group: 'body', area_mm2: 9000, path_points: normPts(ellipsePolygon(100, 92, 56, 62)) },
    { id: 'body_shadow', name: 'body_shadow', color: '#e8869a', stitch_type: 'fill', region_class: 'fill', object_group: 'body', area_mm2: 3000, path_points: normPts(ellipsePolygon(100, 128, 50, 32)) },
    { id: 'foot_left', name: 'foot_left', color: '#dc2828', stitch_type: 'fill', region_class: 'fill', object_group: 'foot_left', area_mm2: 700, path_points: normPts(circlePolygon(70, 168, 19)) },
    { id: 'foot_right', name: 'foot_right', color: '#dc2828', stitch_type: 'fill', region_class: 'fill', object_group: 'foot_right', area_mm2: 700, path_points: normPts(circlePolygon(130, 168, 19)) },
  ];
  return {
    name: 'kirby', imageData: img, regions,
    expect: { mouth: true, eyes: true, outerContour: true, feet: true, lowerBody: true, noPinkBoundary: true, noArtificial: true, noDiagonals: true },
  };
}

// ─── FIXTURE 3: multicolor, NO black line between colors ──────────────────────
export function makeMulticolorFixture() {
  const img = makeImageData();
  fillDisk(img, 72, 100, 58, RED);
  fillDisk(img, 128, 100, 58, BLUE);
  fillDisk(img, 100, 140, 52, YELLOW);
  const regions = [
    { id: 'color_red', name: 'red', color: '#dc2828', stitch_type: 'fill', region_class: 'fill', object_group: 'color_red', area_mm2: 8000, path_points: normPts(circlePolygon(72, 100, 58)) },
    { id: 'color_blue', name: 'blue', color: '#2c54cc', stitch_type: 'fill', region_class: 'fill', object_group: 'color_blue', area_mm2: 8000, path_points: normPts(circlePolygon(128, 100, 58)) },
    { id: 'color_yellow', name: 'yellow', color: '#f0de40', stitch_type: 'fill', region_class: 'fill', object_group: 'color_yellow', area_mm2: 7000, path_points: normPts(circlePolygon(100, 140, 52)) },
  ];
  return { name: 'multicolor', imageData: img, regions, expect: { noContours: true, noFillBoundary: true, strictMaskEmpty: true } };
}

// ─── FIXTURE 4: irregular black outline only ──────────────────────────────────
export function makeIrregularFixture() {
  const img = makeImageData();
  const poly = blobPolygon(100, 100, 62);
  drawPolygonRing(img, poly, 2, BLACK, true);
  fillEllipse(img, 100, 100, 40, 38, GRAY); // minimal fill
  const regions = [{
    id: 'fill_blob', name: 'blob', color: '#d2d2d2', stitch_type: 'fill',
    region_class: 'fill', object_group: 'blob', area_mm2: 5000,
    path_points: normPts(blobPolygon(100, 100, 58)),
  }];
  return { name: 'irregular', imageData: img, regions, expect: { outerContour: true, notFragmented: true, coverageOk: true } };
}

// ─── FIXTURE 5: open details (mouth arc + brow lines) ─────────────────────────
export function makeOpenDetailsFixture() {
  const img = makeImageData();
  arc(img, 100, 105, 22, 3.5, 6.0, 2, BLACK);   // open mouth arc (downward)
  line(img, 70, 70, 92, 76, 2, BLACK);          // left brow
  line(img, 108, 76, 130, 70, 2, BLACK);        // right brow
  const regions = [];
  return { name: 'open_details', imageData: img, regions, expect: { openDetailPreserved: true, notClosed: true, notFill: true } };
}

// ─── FIXTURE 6: real-like diagonal guard ───────────────────────────────────────
// Pink body + a black C-ring (open, gap on the right). The universal detector
// forces it closed (large bbox) which would satin-close across the gap and
// produce a long black diagonal crossing the body. The dark-mask segment guard
// must cut that closing (force open) so no diagonal is exported.
export function makeDiagonalGuardFixture() {
  const img = makeImageData();
  fillEllipse(img, 100, 100, 70, 70, LIGHT_PINK);
  // open black ring: gap around angle 0 (right side) — ends separated ~40mm
  for (let a = 0.6; a < Math.PI * 2 - 0.6; a += 0.01) {
    const x = 100 + Math.cos(a) * 70, y = 100 + Math.sin(a) * 70;
    fillDisk(img, x, y, 2, BLACK);
  }
  const regions = [
    { id: 'body_pink', name: 'body_pink', color: '#ffb6c4', stitch_type: 'fill', region_class: 'fill', object_group: 'body', area_mm2: 12000, path_points: normPts(ellipsePolygon(100, 100, 70, 70)) },
  ];
  return {
    name: 'real_like_diagonal_guard',
    imageData: img, regions,
    expect: { outerContour: true, noDiagonals: true, guardRemoved: true, noCommandDiagonal: true },
  };
}

// ─── FIXTURE 7: both feet export guard ────────────────────────────────────────
// Body + two separate feet, each red fill + real black outline ring. Both foot
// contours must be detected and exported, sewn after their fill, same color.
export function makeBothFeetFixture() {
  const img = makeImageData();
  fillEllipse(img, 100, 90, 50, 50, LIGHT_PINK);   // body
  fillEllipse(img, 70, 168, 19, 13, RED);           // left foot fill
  fillEllipse(img, 130, 168, 19, 13, RED);         // right foot fill
  ellipseRing(img, 100, 90, 50, 50, 2, BLACK);     // body outline
  ring(img, 70, 168, 19, 2, BLACK);                // left foot outline
  ring(img, 130, 168, 19, 2, BLACK);              // right foot outline
  const regions = [
    { id: 'body', name: 'body', color: '#ffb6c4', stitch_type: 'fill', region_class: 'fill', object_group: 'body', area_mm2: 8000, path_points: normPts(ellipsePolygon(100, 90, 50, 50)) },
    { id: 'foot_left', name: 'foot_left', color: '#dc2828', stitch_type: 'fill', region_class: 'fill', object_group: 'foot_left', area_mm2: 700, path_points: normPts(circlePolygon(70, 168, 19)) },
    { id: 'foot_right', name: 'foot_right', color: '#dc2828', stitch_type: 'fill', region_class: 'fill', object_group: 'foot_right', area_mm2: 700, path_points: normPts(circlePolygon(130, 168, 19)) },
  ];
  return { name: 'both_feet_export_guard', imageData: img, regions, expect: { bothFeet: true, feetAfterFill: true, noMismatch: true } };
}

export const FIXTURE_DIMS = { W, H };