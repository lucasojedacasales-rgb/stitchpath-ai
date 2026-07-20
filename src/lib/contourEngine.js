/**
 * Professional Contour Engine — Wilcom-equivalent quality
 *
 * Pipeline per blob:
 *  1. K-means++ color quantization
 *  2. Connected-component blob detection
 *  3. Moore-neighbor integer boundary tracing
 *  4. Sub-pixel boundary refinement (midpoint interpolation at color boundaries)
 *  5. Corner detection (angle-based, auto-preserves sharp features)
 *  6. Chaikin smoothing (corner-preserving subdivision)
 *  7. Adaptive Douglas-Peucker (tight near corners, loose elsewhere)
 *  8. Short segment removal (configurable threshold)
 *  9. Cubic Bézier handle computation (for smooth sections between corners)
 * 10. Auto gap closing (merge nearby contour endpoints)
 * 11. Noise removal (minimum area threshold)
 * 12. Geometric metrics (area, perimeter, compactness, PCA angle, inertia ratio)
 */

const DEFAULTS = {
  analysisSize:       1024,   // px — higher = more sub-pixel accuracy
  minSegmentPx:       4.0,    // px — remove segments shorter than this
  cornerAngleDeg:     150,    // deg — angle below this threshold = corner
  rdpBaseEpsilon:     1.2,    // px — base RDP simplification tolerance (raised: was 0.9, caused micro-fragments)
  rdpCornerFactor:    0.3,    // multiplier — tighter epsilon near corners
  chaikinPasses:      2,      // iterations of Chaikin subdivision
  gapCloseThreshold:  8.0,    // px — auto-close gaps smaller than this
  minAreaPx:          120,    // px² — minimum blob area (raised from 48: filters JPEG noise blobs)
  maxBgCoverage:      0.40,   // fraction — blob touching all 4 borders + covering >40% = background → drop
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Traces professional-quality contours from an image URL.
 * Returns the same format as contourTracer.traceImageContours for compatibility.
 */
export async function traceContoursProf(imageUrl, maxColors = 8, options = {}) {
  const cfg = { ...DEFAULTS, ...options };

  const img = await loadImage(imageUrl);
  const scale = Math.min(cfg.analysisSize / img.width, cfg.analysisSize / img.height);
  const W = Math.round(img.width * scale);
  const H = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const cx = canvas.getContext('2d');
  cx.drawImage(img, 0, 0, W, H);
  const { data: pixels } = cx.getImageData(0, 0, W, H);

  // 1. K-means++ quantization
  const samples = [];
  for (let i = 0; i < W * H; i++) {
    if (pixels[i * 4 + 3] < 128) continue;
    samples.push([pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]]);
  }
  const k = Math.min(maxColors, Math.max(1, samples.length));
  const palette = kMeansPP(samples, k, 24);

  // 2. Label map (pixel → palette index, -1 = transparent)
  const labels = new Int32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (pixels[i * 4 + 3] < 128) { labels[i] = -1; continue; }
    labels[i] = nearestIdx([pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]], palette);
  }

  // Relative floor raised to 0.0003 (was 0.00005) — prevents micro-blobs from JPEG artifacts
  const minPixels = Math.max(cfg.minAreaPx, Math.floor(W * H * 0.0003));
  const regions = [];

  for (let ci = 0; ci < palette.length; ci++) {
    const blobs = findBlobs(labels, W, H, ci, minPixels);

    for (const blob of blobs) {
      // Drop background blobs: k-means merges a near-black outline with the dark
      // image background into one giant blob covering the whole frame. Detect by
      // bbox touching all 4 borders + high coverage, and skip it — otherwise it
      // renders as a huge dashed rectangle that obscures the real design.
      if (isBackgroundBlob(blob, W, H, cfg.maxBgCoverage)) continue;

      // 3. Moore-neighbor integer trace
      let pts = mooreTrace(blob.mask, W, H);
      if (pts.length < 6) continue;

      // 4. Sub-pixel refinement — moves each point to exact color boundary midpoint
      pts = subPixelRefine(pts, labels, W, H, ci);

      // 5. Corner detection
      const corners = detectCorners(pts, cfg.cornerAngleDeg);

      // 6. Chaikin smoothing (splits at corners, smooths between them)
      pts = chaikinSmooth(pts, corners, cfg.chaikinPasses);

      // 7. Adaptive RDP — re-detects corners on smoothed pts
      pts = rdpAdaptive(pts, cfg.rdpBaseEpsilon, cfg.rdpCornerFactor);
      if (pts.length < 3) continue;

      // 8. Remove short segments
      pts = removeShortSegments(pts, cfg.minSegmentPx);
      if (pts.length < 3) continue;

      // 9. Cubic Bézier handles for smooth sections
      const smoothCorners = detectCorners(pts, cfg.cornerAngleDeg);
      const bezierHandles = computeBezierHandles(pts, smoothCorners);

      // Normalize to [0, 1] — 5 decimal places for sub-pixel precision
      const normalized = pts.map(([x, y]) => [
        parseFloat((x / W).toFixed(5)),
        parseFloat((y / H).toFixed(5)),
      ]);

      // Ensure closed polygon
      const first = normalized[0], last = normalized[normalized.length - 1];
      if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 0.0001) {
        normalized.push([...first]);
      }

      // 12. Geometric metrics
      const areaNorm    = shoelaceArea(normalized);
      let   perimNorm   = 0;
      for (let i = 0; i < normalized.length - 1; i++) {
        perimNorm += Math.hypot(
          normalized[i+1][0] - normalized[i][0],
          normalized[i+1][1] - normalized[i][1],
        );
      }
      const compacidad    = perimNorm > 0 ? (4 * Math.PI * areaNorm) / (perimNorm ** 2) : 0;
      const inertia_ratio = computeInertiaRatio(normalized);
      const fill_angle    = computePCAAngle(normalized);
      const bw            = (blob.bbox.maxX - blob.bbox.minX) / W;
      const bh            = (blob.bbox.maxY - blob.bbox.minY) / H;
      const centroidX     = normalized.reduce((s, p) => s + p[0], 0) / normalized.length;
      const centroidY     = normalized.reduce((s, p) => s + p[1], 0) / normalized.length;

      regions.push({
        hex:            rgbToHex(palette[ci]),
        rgb:            palette[ci],
        coverage:       blob.pixelCount / (W * H),
        pixelCount:     blob.pixelCount,
        area_px:        blob.pixelCount,
        area_norm:      areaNorm,
        perimeter_norm: perimNorm,
        compacidad,
        inertia_ratio,
        bbox_aspect:    bh > 0 ? bw / bh : 1,
        fill_angle,
        centroid:       [centroidX, centroidY],
        path_points:    normalized,
        bezier_handles: bezierHandles,
        corner_count:   smoothCorners.size,
        bbox:           blob.bbox,
      });
    }
  }

  // 10. Auto gap closing across same-color regions
  autoCloseGaps(regions, cfg.gapCloseThreshold / Math.max(W, H));

  // Sort largest first
  regions.sort((a, b) => b.pixelCount - a.pixelCount);

  return { regions, imageWidth: img.width, imageHeight: img.height, analysisW: W, analysisH: H };
}

// ─── Step 4: Sub-pixel refinement ────────────────────────────────────────────

/**
 * For each boundary pixel, moves it to the average midpoint between itself
 * and all 4-connected neighbours of a different color. This gives sub-pixel
 * accuracy on the exact color boundary crossing.
 */
function subPixelRefine(pts, labels, W, H, colorIdx) {
  const dirs4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  return pts.map(([x, y]) => {
    const ix = Math.round(x), iy = Math.round(y);
    const crossings = [];
    for (const [dx, dy] of dirs4) {
      const nx = ix + dx, ny = iy + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      if (labels[ny * W + nx] !== colorIdx) {
        crossings.push([ix + dx * 0.5, iy + dy * 0.5]);
      }
    }
    if (crossings.length === 0) return [x, y];
    return [
      crossings.reduce((s, p) => s + p[0], 0) / crossings.length,
      crossings.reduce((s, p) => s + p[1], 0) / crossings.length,
    ];
  });
}

// ─── Step 5: Corner detection ─────────────────────────────────────────────────

/**
 * Detects sharp corners in a polygon by computing the interior angle at each
 * vertex. Vertices with angle below thresholdDeg are marked as corners.
 */
function detectCorners(pts, thresholdDeg = 150) {
  const corners = new Set();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const ax = prev[0] - curr[0], ay = prev[1] - curr[1];
    const bx = next[0] - curr[0], by = next[1] - curr[1];
    const lenA = Math.hypot(ax, ay), lenB = Math.hypot(bx, by);
    if (lenA < 1e-9 || lenB < 1e-9) continue;
    const dot = (ax * bx + ay * by) / (lenA * lenB);
    const angleDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
    if (angleDeg < thresholdDeg) corners.add(i);
  }
  return corners;
}

// ─── Step 6: Chaikin smoothing (corner-preserving) ────────────────────────────

function chaikinSmooth(pts, corners, passes = 2) {
  if (passes === 0 || pts.length < 4) return pts;
  if (corners.size === 0) return chaikinClosed(pts, passes);

  // Split polygon at corners → smooth each open segment → rejoin
  const cornerIdxs = [...corners].sort((a, b) => a - b);
  const n = pts.length;
  const segments = [];

  for (let si = 0; si < cornerIdxs.length; si++) {
    const start = cornerIdxs[si];
    const end   = cornerIdxs[(si + 1) % cornerIdxs.length];
    const seg   = end > start
      ? pts.slice(start, end + 1)
      : [...pts.slice(start), ...pts.slice(0, end + 1)];
    segments.push(chaikinOpen(seg, passes));
  }

  const result = [];
  for (const seg of segments) result.push(...seg.slice(0, -1));
  return result;
}

function chaikinOpen(pts, passes) {
  let cur = pts;
  for (let p = 0; p < passes; p++) {
    const res = [cur[0]]; // preserve first (corner)
    for (let i = 0; i < cur.length - 1; i++) {
      const [x0, y0] = cur[i], [x1, y1] = cur[i + 1];
      if (i > 0) res.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1]);
      res.push([0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
    }
    res.push(cur[cur.length - 1]); // preserve last (corner)
    cur = res;
  }
  return cur;
}

function chaikinClosed(pts, passes) {
  let cur = pts;
  for (let p = 0; p < passes; p++) {
    const res = [], n = cur.length;
    for (let i = 0; i < n; i++) {
      const [x0, y0] = cur[i], [x1, y1] = cur[(i + 1) % n];
      res.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1]);
      res.push([0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
    }
    cur = res;
  }
  return cur;
}

// ─── Step 7: Adaptive RDP ─────────────────────────────────────────────────────

/**
 * Douglas-Peucker with adaptive epsilon: tighter near corners (preserves detail),
 * looser on smooth sections (reduces point count).
 */
function rdpAdaptive(pts, baseEps, cornerFactor) {
  if (pts.length <= 2) return pts;

  // Re-detect corners on (possibly smoothed) point set for adaptive epsilon
  const corners = detectCorners(pts, 150);

  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];

  while (stack.length > 0) {
    const [s, e] = stack.pop();
    let maxDist = 0, maxIdx = s;
    for (let i = s + 1; i < e; i++) {
      const d = ptSegDist(pts[i], pts[s], pts[e]);
      if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    const nearCorner = corners.has(maxIdx) || corners.has(s) || corners.has(e);
    const eps = nearCorner ? baseEps * cornerFactor : baseEps;
    if (maxDist > eps) {
      keep[maxIdx] = 1;
      stack.push([s, maxIdx]);
      stack.push([maxIdx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

// ─── Step 8: Short segment removal ───────────────────────────────────────────

function removeShortSegments(pts, minPx) {
  if (pts.length < 4) return pts;
  const result = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = result[result.length - 1];
    if (Math.hypot(pts[i][0] - prev[0], pts[i][1] - prev[1]) >= minPx) {
      result.push(pts[i]);
    }
  }
  // Always ensure last point is included
  const last = pts[pts.length - 1];
  const rl   = result[result.length - 1];
  if (rl[0] !== last[0] || rl[1] !== last[1]) result.push(last);
  return result.length >= 3 ? result : pts;
}

// ─── Step 9: Cubic Bézier handles ─────────────────────────────────────────────

/**
 * Computes smooth cubic Bézier control points using the Catmull-Rom tangent
 * method. Returns null for corner vertices (no smoothing).
 */
function computeBezierHandles(pts, corners) {
  const n = pts.length;
  const tension = 0.3;
  return pts.map((pt, i) => {
    if (corners.has(i)) return null;
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const tx = (next[0] - prev[0]) * tension;
    const ty = (next[1] - prev[1]) * tension;
    return {
      cpIn:  [pt[0] - tx, pt[1] - ty],
      cpOut: [pt[0] + tx, pt[1] + ty],
    };
  });
}

// ─── Step 10: Auto gap closing ────────────────────────────────────────────────

/**
 * Snaps nearby contour endpoints of same-color regions to their midpoint,
 * closing small gaps that result from quantization or rounding.
 */
function autoCloseGaps(regions, maxGapNorm) {
  for (let i = 0; i < regions.length; i++) {
    const pi = regions[i].path_points;
    if (pi.length < 3) continue;

    // Self-close check
    const selfD = Math.hypot(pi[0][0] - pi[pi.length-1][0], pi[0][1] - pi[pi.length-1][1]);
    if (selfD < maxGapNorm && selfD > 0) {
      pi[pi.length - 1] = [...pi[0]];
      continue;
    }

    // Cross-region gap closing (same color only)
    for (let j = i + 1; j < regions.length; j++) {
      if (regions[j].hex !== regions[i].hex) continue;
      const pj = regions[j].path_points;
      if (pj.length < 3) continue;

      const endI   = pi[pi.length - 1], startI = pi[0];
      const endJ   = pj[pj.length - 1], startJ = pj[0];
      const pairs  = [[endI, startJ, 0], [endI, endJ, 1], [startI, startJ, 2], [startI, endJ, 3]];

      for (const [p1, p2, mode] of pairs) {
        if (Math.hypot(p1[0] - p2[0], p1[1] - p2[1]) < maxGapNorm) {
          const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
          if (mode === 0) { pi[pi.length - 1] = mid; pj[0] = mid; }
          if (mode === 1) { pi[pi.length - 1] = mid; pj[pj.length - 1] = mid; }
          if (mode === 2) { pi[0] = mid; pj[0] = mid; }
          if (mode === 3) { pi[0] = mid; pj[pj.length - 1] = mid; }
          break;
        }
      }
    }
  }
}

// ─── Moore-neighbor contour tracer ────────────────────────────────────────────

function mooreTrace(mask, W, H) {
  let start = -1;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) { start = i; break; }
  }
  if (start === -1) return [];

  const dirs = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const contour = [];
  let cx = start % W, cy = Math.floor(start / W);
  const sx = cx, sy = cy;
  let dir = 0;

  for (let step = 0; step < W * H; step++) {
    contour.push([cx, cy]);
    let moved = false;
    for (let d = 0; d < 8; d++) {
      const nd = (dir + 6 + d) % 8;
      const nx = cx + dirs[nd][0], ny = cy + dirs[nd][1];
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      if (mask[ny * W + nx]) {
        dir = nd; cx = nx; cy = ny; moved = true; break;
      }
    }
    if (!moved) break;
    if (step > 3 && cx === sx && cy === sy) break;
  }
  return contour;
}

// ─── Connected-component blob detection ───────────────────────────────────────

/**
 * A background blob: its bbox touches all 4 image borders AND it covers a large
 * fraction of the frame. This catches the k-means artifact where a near-black
 * outline merges with the dark background into one frame-spanning mega-blob.
 */
function isBackgroundBlob(blob, W, H, maxCoverage) {
  const coverage = blob.pixelCount / (W * H);
  // Any single blob covering >55% of the frame is background, regardless of
  // border contact (a hoop-filling color is never a real design region).
  if (coverage > 0.55) return true;
  const touchesAllBorders =
    blob.bbox.minX <= 1 && blob.bbox.maxX >= W - 2 &&
    blob.bbox.minY <= 1 && blob.bbox.maxY >= H - 2;
  return touchesAllBorders && coverage > maxCoverage;
}

function findBlobs(labels, W, H, colorIdx, minPixels) {
  const visited = new Uint8Array(W * H);
  const blobs   = [];

  for (let start = 0; start < W * H; start++) {
    if (labels[start] !== colorIdx || visited[start]) continue;

    const stack = [start], mask = new Uint8Array(W * H);
    let count = 0, minX = W, maxX = 0, minY = H, maxY = 0;

    while (stack.length) {
      const idx = stack.pop();
      if (visited[idx]) continue;
      visited[idx] = 1;
      if (labels[idx] !== colorIdx) continue;
      mask[idx] = 1; count++;
      const x = idx % W, y = Math.floor(idx / W);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x > 0)     stack.push(idx - 1);
      if (x < W - 1) stack.push(idx + 1);
      if (y > 0)     stack.push(idx - W);
      if (y < H - 1) stack.push(idx + W);
    }

    if (count >= minPixels) blobs.push({ mask, pixelCount: count, bbox: { minX, maxX, minY, maxY } });
  }
  return blobs;
}

// ─── K-means++ quantization ───────────────────────────────────────────────────

function kMeansPP(samples, k, iterations) {
  if (!samples.length) return [];
  const centroids = [samples[Math.floor(Math.random() * samples.length)]];
  while (centroids.length < k) {
    const dists = samples.map(s => Math.min(...centroids.map(c => distSq3(s, c))));
    const total = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i];
      if (r <= 0) { centroids.push([...samples[i]]); break; }
    }
    if (centroids.length < k) centroids.push([...samples[samples.length - 1]]);
  }
  for (let iter = 0; iter < iterations; iter++) {
    const sums = centroids.map(() => [0, 0, 0, 0]);
    for (const s of samples) {
      const ci = nearestIdx(s, centroids);
      sums[ci][0] += s[0]; sums[ci][1] += s[1]; sums[ci][2] += s[2]; sums[ci][3]++;
    }
    for (let ci = 0; ci < centroids.length; ci++) {
      const cnt = sums[ci][3];
      if (cnt > 0) centroids[ci] = [sums[ci][0]/cnt, sums[ci][1]/cnt, sums[ci][2]/cnt];
    }
  }
  return centroids;
}

function nearestIdx(rgb, palette) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const d = distSq3(rgb, palette[i]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// ─── Geometric metrics ────────────────────────────────────────────────────────

function shoelaceArea(pts) {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return Math.abs(area) / 2;
}

function computePCAAngle(pts) {
  const n = pts.length;
  if (n < 3) return 45;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of pts) {
    const dx = x - mx, dy = y - my;
    sxx += dx*dx; sxy += dx*dy; syy += dy*dy;
  }
  return Math.round(((Math.atan2(2*sxy, sxx-syy) * 90 / Math.PI) + 180) % 180);
}

function computeInertiaRatio(pts) {
  const n = pts.length;
  if (n < 3) return 1;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of pts) {
    const dx = x - mx, dy = y - my;
    sxx += dx*dx; sxy += dx*dy; syy += dy*dy;
  }
  const trace = sxx + syy;
  const det   = sxx*syy - sxy*sxy;
  const disc  = Math.sqrt(Math.max(0, (trace/2)**2 - det));
  const lam2  = trace/2 - disc;
  return lam2 > 1e-9 ? (trace/2 + disc) / lam2 : 10;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function ptSegDist([px, py], [ax, ay], [bx, by]) {
  const dx = bx-ax, dy = by-ay, l2 = dx*dx+dy*dy;
  if (l2 === 0) return Math.hypot(px-ax, py-ay);
  const t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / l2));
  return Math.hypot(px-(ax+t*dx), py-(ay+t*dy));
}

function distSq3(a, b) { return (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2; }

function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}