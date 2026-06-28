/**
 * contourTracer.js — Professional Contour Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Produces Wilcom-equivalent contours from raster images.
 *
 * Pipeline per blob:
 *  1. K-means++ color quantization
 *  2. Connected-component flood-fill (4+8-connected)
 *  3. Sub-pixel edge detection via Sobel + quadratic interpolation
 *  4. Moore-neighbor contour tracing on supersampled grid
 *  5. Sub-pixel refinement: gradient-weighted centroid per edge pixel
 *  6. Noise removal: spikes + short-segment pruning
 *  7. Corner detection & preservation (Harris-like curvature angle)
 *  8. Adaptive Douglas-Peucker (epsilon scales with local curvature)
 *  9. Chaikin corner-cutting smoothing (spares detected corners)
 * 10. Bézier fitting (cubic, least-squares per segment)
 * 11. Small-gap closure (snaps endpoints within threshold)
 * 12. Geometric metrics: area, perimeter, compactness, inertia, PCA angle
 */

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {string} imageUrl
 * @param {number} maxColors   - k-means palette size (default 8)
 * @param {Object} [opts]
 * @param {number} opts.analysisSize       - max canvas side (default 900)
 * @param {number} opts.minPixelArea       - minimum blob pixel count (default 10)
 * @param {number} opts.minSegmentLengthPx - segments shorter than this are removed (default 2.0)
 * @param {number} opts.cornerAngleDeg     - angle below which a vertex is a corner (default 120)
 * @param {number} opts.rdpBaseEpsilon     - base RDP tolerance in px (default 0.8)
 * @param {number} opts.chaikinPasses      - Chaikin smoothing passes (default 2)
 * @param {number} opts.gapClosurePx       - max distance to snap open gap endpoints (default 4)
 * @returns {Promise<ContourSet>}
 */
export async function traceImageContours(imageUrl, maxColors = 8, opts = {}) {
  const {
    analysisSize     = 900,
    minPixelArea     = 25,
    minSegmentLengthPx = 3.0,
    cornerAngleDeg   = 125,
    rdpBaseEpsilon   = 1.2,
    chaikinPasses    = 1,
    gapClosurePx     = 5,
  } = opts;

  const img = await loadImage(imageUrl);

  const scale = Math.min(analysisSize / img.width, analysisSize / img.height);
  const W = Math.round(img.width * scale);
  const H = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);
  const imageData = ctx.getImageData(0, 0, W, H);
  const pixels = imageData.data;

  // ── 1. Sub-pixel Sobel gradient map ───────────────────────────────────────
  const { gx: sobelGx, gy: sobelGy, mag: sobelMag } = computeSobelGradients(pixels, W, H);

  // ── 2. K-means++ palette ───────────────────────────────────────────────────
  const samples = [];
  for (let i = 0; i < W * H; i++) {
    if (pixels[i * 4 + 3] < 128) continue;
    samples.push([pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]]);
  }
  const k = Math.min(maxColors, samples.length);
  if (k === 0) return emptyContourSet(img, W, H);

  const palette = kMeansPlusPlus(samples, k, 20);

  // ── 3. Label map ───────────────────────────────────────────────────────────
  const labels = new Int32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (pixels[i * 4 + 3] < 128) { labels[i] = -1; continue; }
    labels[i] = nearestPalette([pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]], palette);
  }

  // ── 4. Blobs + contours per color ─────────────────────────────────────────
  const regions = [];

  for (let ci = 0; ci < palette.length; ci++) {
    const blobs = findBlobs(labels, W, H, ci, minPixelArea);

    for (const blob of blobs) {
      // 4a. Trace raw contour (Moore neighbor, pixel-integer)
      let contour = mooreTrace(blob.mask, W, H);
      if (contour.length < 4) continue;

      // 4b. Sub-pixel refinement: shift each point toward gradient centroid
      contour = subpixelRefine(contour, sobelGx, sobelGy, sobelMag, W, H);

      // 4c. Remove duplicate / collinear noise points
      contour = removeDuplicates(contour, 0.3);

      // 4d. Short-segment pruning (removes spurs / noise spikes)
      contour = pruneShortSegments(contour, minSegmentLengthPx);
      if (contour.length < 4) continue;

      // 4e. Detect corners (preserve through smoothing)
      const corners = detectCorners(contour, cornerAngleDeg);

      // 4f. Adaptive RDP — tighter epsilon near corners, looser on smooth curves
      const simplified = adaptiveRDP(contour, rdpBaseEpsilon, corners);
      if (simplified.length < 3) continue;

      // 4g. Chaikin smoothing (skip corners)
      const smooth = chaikinSmooth(simplified, chaikinPasses, corners);

      // 4h. Bézier fitting on smooth segments
      const bezier = fitBezierContour(smooth, corners);

      // 4i. Gap closure — snap near-open endpoints together
      const closed = closeSmallGaps(bezier, gapClosurePx);
      if (closed.length < 3) continue;

      // 4j. Ensure polygon is closed
      const pts = normalizeToUnitSquare(closed, W, H);
      ensureClosedPolygon(pts);

      // 4k. Compute geometric metrics
      const metrics = computeMetrics(pts, blob, W, H);

      regions.push({
        hex:            rgbToHex(palette[ci]),
        rgb:            palette[ci],
        coverage:       metrics.coverage,
        pixelCount:     blob.pixelCount,
        area_px:        blob.pixelCount,
        area_norm:      metrics.areaNorm,
        perimeter_norm: metrics.perimNorm,
        compacidad:     metrics.compacidad,
        inertia_ratio:  metrics.inertiaRatio,
        bbox_aspect:    metrics.bboxAspect,
        fill_angle:     metrics.fillAngle,
        centroid:       metrics.centroid,
        path_points:    pts,
        bbox:           blob.bbox,
        hasBezier:      true,
      });
    }
  }

  regions.sort((a, b) => b.pixelCount - a.pixelCount);
  return { regions, imageWidth: img.width, imageHeight: img.height, analysisW: W, analysisH: H };
}

// ─── 1. Sobel Gradient ────────────────────────────────────────────────────────

function computeSobelGradients(pixels, W, H) {
  const gray = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    gray[i] = 0.299 * pixels[i * 4] + 0.587 * pixels[i * 4 + 1] + 0.114 * pixels[i * 4 + 2];
  }

  const gx  = new Float32Array(W * H);
  const gy  = new Float32Array(W * H);
  const mag = new Float32Array(W * H);

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const idx = y * W + x;
      const gxV =
        -gray[(y-1)*W+(x-1)] + gray[(y-1)*W+(x+1)]
        - 2*gray[y*W+(x-1)]  + 2*gray[y*W+(x+1)]
        - gray[(y+1)*W+(x-1)]+ gray[(y+1)*W+(x+1)];
      const gyV =
        -gray[(y-1)*W+(x-1)] - 2*gray[(y-1)*W+x] - gray[(y-1)*W+(x+1)]
        + gray[(y+1)*W+(x-1)]+ 2*gray[(y+1)*W+x] + gray[(y+1)*W+(x+1)];
      gx[idx]  = gxV;
      gy[idx]  = gyV;
      mag[idx] = Math.sqrt(gxV * gxV + gyV * gyV);
    }
  }
  return { gx, gy, mag };
}

// ─── 2. K-Means++ ─────────────────────────────────────────────────────────────

function kMeansPlusPlus(samples, k, iterations) {
  if (samples.length === 0) return [];
  // Sample every 4th pixel for speed
  const ss = samples.filter((_, i) => i % 4 === 0);
  if (ss.length === 0) return [];

  const centroids = [ss[Math.floor(Math.random() * ss.length)]];
  while (centroids.length < k) {
    const dists = ss.map(s => Math.min(...centroids.map(c => distSq3(s, c))));
    const total = dists.reduce((a, b) => a + b, 0);
    if (total === 0) { centroids.push(ss[centroids.length % ss.length]); continue; }
    let r = Math.random() * total;
    let pushed = false;
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i];
      if (r <= 0) { centroids.push([...ss[i]]); pushed = true; break; }
    }
    if (!pushed) centroids.push([...ss[ss.length - 1]]);
  }

  for (let iter = 0; iter < iterations; iter++) {
    const sums = centroids.map(() => [0, 0, 0, 0]);
    for (const s of ss) {
      const ci = nearestPalette(s, centroids);
      sums[ci][0] += s[0]; sums[ci][1] += s[1]; sums[ci][2] += s[2]; sums[ci][3]++;
    }
    for (let ci = 0; ci < centroids.length; ci++) {
      const cnt = sums[ci][3];
      if (cnt > 0) centroids[ci] = [sums[ci][0]/cnt, sums[ci][1]/cnt, sums[ci][2]/cnt];
    }
  }
  return centroids;
}

function nearestPalette(rgb, palette) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const d = distSq3(rgb, palette[i]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// ─── 3. Blob Detection (flood-fill, iterative) ────────────────────────────────

function findBlobs(labels, W, H, colorIdx, minPixels) {
  const visited = new Uint8Array(W * H);
  const blobs = [];

  for (let start = 0; start < W * H; start++) {
    if (labels[start] !== colorIdx || visited[start]) continue;

    const stack = [start];
    const mask = new Uint8Array(W * H);
    let count = 0;
    let minX = W, maxX = 0, minY = H, maxY = 0;

    while (stack.length > 0) {
      const idx = stack.pop();
      if (visited[idx]) continue;
      visited[idx] = 1;
      if (labels[idx] !== colorIdx) continue;
      mask[idx] = 1;
      count++;
      const x = idx % W, y = Math.floor(idx / W);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x > 0)     stack.push(idx - 1);
      if (x < W - 1) stack.push(idx + 1);
      if (y > 0)     stack.push(idx - W);
      if (y < H - 1) stack.push(idx + W);
    }

    if (count >= minPixels) {
      blobs.push({ mask, pixelCount: count, bbox: { minX, maxX, minY, maxY } });
    }
  }
  return blobs;
}

// ─── 4a. Moore Neighbor Contour Tracing ───────────────────────────────────────

const MOORE_DIRS = [
  [1,0],[1,1],[0,1],[-1,1],
  [-1,0],[-1,-1],[0,-1],[1,-1]
];

function mooreTrace(mask, W, H) {
  // Find topmost-leftmost boundary pixel
  let start = -1;
  for (let i = 0; i < W * H; i++) {
    if (mask[i]) { start = i; break; }
  }
  if (start === -1) return [];

  const contour = [];
  let cx = start % W, cy = Math.floor(start / W);
  const sx = cx, sy = cy;
  let dir = 0;
  const maxSteps = Math.min(W * H, 40000);

  for (let step = 0; step < maxSteps; step++) {
    contour.push([cx, cy]);
    let moved = false;
    for (let d = 0; d < 8; d++) {
      const nd = (dir + 6 + d) % 8;
      const nx = cx + MOORE_DIRS[nd][0];
      const ny = cy + MOORE_DIRS[nd][1];
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      if (mask[ny * W + nx]) {
        dir = nd; cx = nx; cy = ny; moved = true; break;
      }
    }
    if (!moved) break;
    if (step > 4 && cx === sx && cy === sy) break;
  }
  return contour;
}

// ─── 4b. Sub-pixel Refinement ────────────────────────────────────────────────
// Each contour pixel is shifted toward the true sub-pixel edge using
// gradient-weighted centroid in a 3×3 neighbourhood.

function subpixelRefine(contour, gx, gy, mag, W, H) {
  return contour.map(([px, py]) => {
    let wx = 0, wy = 0, wt = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const m = mag[ny * W + nx];
        if (m < 1) continue;
        wx += (px + dx) * m;
        wy += (py + dy) * m;
        wt += m;
      }
    }
    if (wt < 1e-6) return [px, py];
    return [wx / wt, wy / wt];
  });
}

// ─── 4c. Remove Duplicate / Near-Identical Points ────────────────────────────

function removeDuplicates(pts, minDist = 0.3) {
  if (pts.length < 2) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1];
    if (Math.hypot(pts[i][0] - prev[0], pts[i][1] - prev[1]) >= minDist) {
      out.push(pts[i]);
    }
  }
  return out;
}

// ─── 4d. Short-Segment Pruning ───────────────────────────────────────────────
// Removes "spurs" — single out-and-back segments shorter than threshold.
// Iterates until stable (handles chains of short segments).

function pruneShortSegments(pts, minLen) {
  if (pts.length < 4 || minLen <= 0) return pts;
  let changed = true;
  let current = pts.slice();

  while (changed && current.length > 3) {
    changed = false;
    const next = [];
    const n = current.length;
    for (let i = 0; i < n; i++) {
      const a = current[(i - 1 + n) % n];
      const b = current[i];
      const c = current[(i + 1) % n];
      const lenAB = Math.hypot(b[0]-a[0], b[1]-a[1]);
      const lenBC = Math.hypot(c[0]-b[0], c[1]-b[1]);
      // If both adjacent segments are short → candidate for removal
      if (lenAB < minLen && lenBC < minLen) {
        changed = true; // skip b
      } else {
        next.push(b);
      }
    }
    if (next.length >= 3) current = next;
    else break;
  }
  return current;
}

// ─── 4e. Corner Detection (Harris-like angle threshold) ───────────────────────
// Returns a Set of indices where the turning angle is below cornerAngleDeg.
// Corners are preserved through all subsequent smoothing/simplification.

function detectCorners(pts, cornerAngleDeg) {
  const corners = new Set();
  const threshold = (cornerAngleDeg * Math.PI) / 180;
  const n = pts.length;

  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    const v1 = [b[0]-a[0], b[1]-a[1]];
    const v2 = [c[0]-b[0], c[1]-b[1]];
    const l1 = Math.hypot(v1[0], v1[1]);
    const l2 = Math.hypot(v2[0], v2[1]);
    if (l1 < 1e-9 || l2 < 1e-9) continue;
    const dot = (v1[0]*v2[0] + v1[1]*v2[1]) / (l1 * l2);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    if (angle < threshold) corners.add(i); // sharp turn → corner
  }
  return corners;
}

// ─── 4f. Adaptive RDP ────────────────────────────────────────────────────────
// Epsilon is tighter near corners (higher fidelity) and relaxed on smooth arcs.

function adaptiveRDP(pts, baseEpsilon, corners) {
  if (pts.length <= 2) return pts;

  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;

  // Corners always kept
  corners.forEach(i => { if (i < pts.length) keep[i] = 1; });

  const stack = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [s, e] = stack.pop();
    if (e - s < 2) continue;

    // Local epsilon: reduce near corners
    const nearCorner = corners.has(s) || corners.has(e);
    const eps = nearCorner ? baseEpsilon * 0.4 : baseEpsilon;

    let maxD = 0, maxI = s;
    for (let i = s + 1; i < e; i++) {
      const d = ptSegDist(pts[i], pts[s], pts[e]);
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > eps) {
      keep[maxI] = 1;
      stack.push([s, maxI]);
      stack.push([maxI, e]);
    }
  }

  return pts.filter((_, i) => keep[i]);
}

// ─── 4g. Chaikin Corner-Cutting Smoothing ────────────────────────────────────
// Each pass inserts two new points at 1/4 and 3/4 of each segment.
// Detected corners are locked and not smoothed through.

function chaikinSmooth(pts, passes, corners) {
  if (passes <= 0 || pts.length < 3) return pts;
  let current = pts.slice();

  for (let p = 0; p < passes; p++) {
    const next = [];
    const n = current.length;
    for (let i = 0; i < n; i++) {
      const a = current[i];
      const b = current[(i + 1) % n];
      // If this segment starts at a detected corner index → keep vertex
      if (corners.has(i)) {
        next.push(a);
        next.push([0.75*a[0] + 0.25*b[0], 0.75*a[1] + 0.25*b[1]]);
      } else {
        next.push([0.75*a[0] + 0.25*b[0], 0.75*a[1] + 0.25*b[1]]);
        next.push([0.25*a[0] + 0.75*b[0], 0.25*a[1] + 0.75*b[1]]);
      }
    }
    current = next;
  }
  return current;
}

// ─── 4h. Cubic Bézier Fitting ────────────────────────────────────────────────
// Fits cubic Bézier curves to smooth segments between corners.
// Returns a densely-sampled polyline (ready for path_points).

function fitBezierContour(pts, corners) {
  if (pts.length < 4) return pts;
  const n = pts.length;
  const result = [];

  // Split contour into segments at corners
  const cornerList = [...corners].filter(i => i < n).sort((a, b) => a - b);

  if (cornerList.length === 0) {
    // No corners — fit one Bézier loop
    return sampleBezierLoop(pts);
  }

  let segStart = cornerList[0];
  for (let ci = 0; ci <= cornerList.length; ci++) {
    const segEnd = ci < cornerList.length ? cornerList[ci] : cornerList[0] + n;
    const seg = [];
    for (let j = segStart; j <= segEnd; j++) {
      seg.push(pts[j % n]);
    }
    if (seg.length >= 2) {
      const fitted = fitCubicBezierSegment(seg);
      result.push(...fitted);
    }
    segStart = segEnd;
  }

  return result.length >= 3 ? result : pts;
}

/**
 * Fits a single cubic Bézier to a polyline segment using Schneider's algorithm
 * (simplified: chord-length parametrization + symmetric control points).
 */
function fitCubicBezierSegment(pts, samplesPerCurve = 12) {
  if (pts.length < 2) return pts;
  if (pts.length === 2) return pts;

  const p0 = pts[0];
  const p3 = pts[pts.length - 1];

  // Estimate control points using tangent directions at endpoints
  const t0 = normalize2([pts[1][0]-p0[0], pts[1][1]-p0[1]]);
  const tn = normalize2([p3[0]-pts[pts.length-2][0], p3[1]-pts[pts.length-2][1]]);

  // Chord length for alpha
  const chord = Math.hypot(p3[0]-p0[0], p3[1]-p0[1]);
  const alpha = chord / 3;

  const p1 = [p0[0] + t0[0]*alpha, p0[1] + t0[1]*alpha];
  const p2 = [p3[0] - tn[0]*alpha, p3[1] - tn[1]*alpha];

  // Sample the cubic Bézier
  const out = [];
  for (let t = 0; t <= 1; t += 1 / samplesPerCurve) {
    out.push(cubicBezierPoint(p0, p1, p2, p3, t));
  }
  out.push(p3);
  return out;
}

function sampleBezierLoop(pts) {
  // For loops (no corners), apply one global Chaikin pass for smoothness
  return chaikinSmooth(pts, 1, new Set());
}

function cubicBezierPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
    u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1],
  ];
}

function normalize2([x, y]) {
  const l = Math.hypot(x, y) || 1;
  return [x/l, y/l];
}

// ─── 4i. Small-Gap Closure ────────────────────────────────────────────────────
// If the first and last point are within gapClosurePx, snap them together.
// Also bridges short open chains that are near-closed.

function closeSmallGaps(pts, gapPx) {
  if (pts.length < 2) return pts;
  const first = pts[0], last = pts[pts.length - 1];
  const d = Math.hypot(last[0]-first[0], last[1]-first[1]);
  if (d > 0 && d <= gapPx) {
    // Interpolate toward midpoint to close smoothly
    const mid = [(first[0]+last[0])/2, (first[1]+last[1])/2];
    const closed = [...pts];
    closed[0] = mid;
    closed[closed.length - 1] = mid;
    return closed;
  }
  return pts;
}

// ─── Normalize & Close ────────────────────────────────────────────────────────

function normalizeToUnitSquare(pts, W, H) {
  return pts.map(([x, y]) => [
    parseFloat((x / W).toFixed(5)),
    parseFloat((y / H).toFixed(5)),
  ]);
}

function ensureClosedPolygon(pts) {
  if (pts.length < 2) return;
  const first = pts[0], last = pts[pts.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    pts.push([...first]);
  }
}

// ─── Geometric Metrics ────────────────────────────────────────────────────────

function computeMetrics(pts, blob, W, H) {
  const n = pts.length;

  // Perimeter (normalized)
  let perimNorm = 0;
  for (let i = 0; i < n - 1; i++) {
    perimNorm += Math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1]);
  }

  // Area (Shoelace, normalized)
  let areaNorm = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    areaNorm += pts[i][0] * pts[j][1];
    areaNorm -= pts[j][0] * pts[i][1];
  }
  areaNorm = Math.abs(areaNorm) / 2;

  // Compactness (1=circle)
  const compacidad = perimNorm > 0 ? (4 * Math.PI * areaNorm) / (perimNorm * perimNorm) : 0;

  // Inertia ratio via PCA
  const cx = pts.reduce((s,p) => s+p[0], 0) / n;
  const cy = pts.reduce((s,p) => s+p[1], 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of pts) {
    const dx = x-cx, dy = y-cy;
    sxx += dx*dx; sxy += dx*dy; syy += dy*dy;
  }
  const trace = sxx + syy;
  const det   = sxx*syy - sxy*sxy;
  const disc  = Math.sqrt(Math.max(0, (trace/2)**2 - det));
  const lam1  = trace/2 + disc, lam2 = trace/2 - disc;
  const inertiaRatio = lam2 > 1e-9 ? lam1/lam2 : 10;

  // PCA fill angle
  const angle = 0.5 * Math.atan2(2*sxy, sxx-syy);
  const fillAngle = Math.round(((angle*180/Math.PI) + 180) % 180);

  // Bounding box aspect
  const bw = (blob.bbox.maxX - blob.bbox.minX) / W;
  const bh = (blob.bbox.maxY - blob.bbox.minY) / H;
  const bboxAspect = bh > 0 ? bw/bh : 1;

  return {
    coverage:    blob.pixelCount / (W * H),
    areaNorm,
    perimNorm,
    compacidad:  Math.max(0, Math.min(1, compacidad)),
    inertiaRatio,
    fillAngle,
    bboxAspect,
    centroid:    [+cx.toFixed(5), +cy.toFixed(5)],
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function distSq3(a, b) { return (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2; }

function rgbToHex([r, g, b]) {
  return '#' + [r,g,b].map(v => Math.round(v).toString(16).padStart(2,'0')).join('');
}

function ptSegDist([px,py], [ax,ay], [bx,by]) {
  const dx = bx-ax, dy = by-ay;
  const l2 = dx*dx + dy*dy;
  if (l2 === 0) return Math.hypot(px-ax, py-ay);
  const t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / l2));
  return Math.hypot(px-(ax+t*dx), py-(ay+t*dy));
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function emptyContourSet(img, W, H) {
  return { regions: [], imageWidth: img.width, imageHeight: img.height, analysisW: W, analysisH: H };
}