/**
 * Client-side contour tracer.
 * 1. K-means color quantization
 * 2. Connected-component blob detection per color
 * 3. Moore-neighbor contour tracing
 * 4. RDP simplification
 * Returns regions with real path_points normalized 0–1
 */

const ANALYSIS_SIZE = 512;

export async function traceImageContours(imageUrl, maxColors = 8) {
  const img = await loadImage(imageUrl);

  const scale = Math.min(ANALYSIS_SIZE / img.width, ANALYSIS_SIZE / img.height);
  const W = Math.round(img.width * scale);
  const H = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);

  const imageData = ctx.getImageData(0, 0, W, H);
  const pixels = imageData.data; // RGBA flat array, length = W*H*4

  // 1. Build opaque pixel list for k-means sampling
  const samples = [];
  for (let i = 0; i < W * H; i++) {
    if (pixels[i * 4 + 3] < 128) continue;
    samples.push([pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]]);
  }

  const k = Math.min(maxColors, samples.length);
  const palette = kMeans(samples, k, 20);

  // 2. Build label map (each pixel → palette index, -1 = transparent)
  const labels = new Int32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (pixels[i * 4 + 3] < 128) { labels[i] = -1; continue; }
    labels[i] = nearestColor([pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]], palette);
  }

  // 3. For each color, find connected blobs
  // minPixels = 0.05% of image (catches eyes, small details)
  const minPixels = Math.max(20, Math.floor(W * H * 0.0005));
  const regions = [];

  for (let ci = 0; ci < palette.length; ci++) {
    const blobs = findBlobs(labels, W, H, ci, minPixels);
    for (const blob of blobs) {
      // RDP tolerance in pixel space (scale with image size, ~1px)
      const rdpEps = Math.max(1.0, Math.min(W, H) * 0.005);
      const contour = traceContour(blob.mask, W, H);
      if (contour.length < 4) continue;
      const simplified = rdpSimplify(contour, rdpEps);
      if (simplified.length < 3) continue;

      // Normalize to 0–1
      const pts = simplified.map(([x, y]) => [
        parseFloat((x / W).toFixed(4)),
        parseFloat((y / H).toFixed(4))
      ]);
      // Ensure closed polygon
      if (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1]) {
        pts.push([...pts[0]]);
      }

      regions.push({
        hex: rgbToHex(palette[ci]),
        rgb: palette[ci],
        coverage: blob.pixelCount / (W * H),
        pixelCount: blob.pixelCount,
        area_px: blob.pixelCount,
        path_points: pts,
        bbox: blob.bbox,
      });
    }
  }

  // Sort largest first (fills before contours/details)
  regions.sort((a, b) => b.pixelCount - a.pixelCount);

  return { regions, imageWidth: img.width, imageHeight: img.height, analysisW: W, analysisH: H };
}

// ─── K-Means ──────────────────────────────────────────────────────────────────

function kMeans(samples, k, iterations) {
  if (samples.length === 0) return [];

  // k-means++ initialization
  const centroids = [samples[Math.floor(Math.random() * samples.length)]];
  while (centroids.length < k) {
    const dists = samples.map(s => Math.min(...centroids.map(c => distSq(s, c))));
    const total = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i];
      if (r <= 0) { centroids.push([...samples[i]]); break; }
    }
    if (centroids.length < k) centroids.push([...samples[samples.length - 1]]);
  }

  for (let iter = 0; iter < iterations; iter++) {
    const sums = centroids.map(() => [0, 0, 0, 0]); // r,g,b,count
    for (const s of samples) {
      const ci = nearestColor(s, centroids);
      sums[ci][0] += s[0]; sums[ci][1] += s[1]; sums[ci][2] += s[2]; sums[ci][3]++;
    }
    for (let ci = 0; ci < centroids.length; ci++) {
      const cnt = sums[ci][3];
      if (cnt > 0) centroids[ci] = [sums[ci][0] / cnt, sums[ci][1] / cnt, sums[ci][2] / cnt];
    }
  }
  return centroids;
}

function nearestColor(rgb, palette) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const d = distSq(rgb, palette[i]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// ─── Blob Detection ───────────────────────────────────────────────────────────

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
      if (x > 0) stack.push(idx - 1);
      if (x < W - 1) stack.push(idx + 1);
      if (y > 0) stack.push(idx - W);
      if (y < H - 1) stack.push(idx + W);
    }

    if (count >= minPixels) {
      blobs.push({ mask, pixelCount: count, bbox: { minX, maxX, minY, maxY } });
    }
  }

  return blobs;
}

// ─── Contour Tracing (Moore neighborhood) ─────────────────────────────────────

function traceContour(mask, W, H) {
  let start = -1;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) { start = i; break; }
  }
  if (start === -1) return [];

  const dirs = [
    [1, 0], [1, 1], [0, 1], [-1, 1],
    [-1, 0], [-1, -1], [0, -1], [1, -1]
  ];
  const contour = [];
  let cx = start % W, cy = Math.floor(start / W);
  const sx = cx, sy = cy;
  let dir = 0;
  const maxSteps = W * H;

  for (let step = 0; step < maxSteps; step++) {
    contour.push([cx, cy]);
    // Search clockwise from back-left of current direction
    let moved = false;
    for (let d = 0; d < 8; d++) {
      const nd = (dir + 6 + d) % 8;
      const nx = cx + dirs[nd][0], ny = cy + dirs[nd][1];
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      if (mask[ny * W + nx]) {
        dir = nd;
        cx = nx; cy = ny;
        moved = true;
        break;
      }
    }
    if (!moved) break;
    if (step > 3 && cx === sx && cy === sy) break;
  }

  return contour;
}

// ─── Ramer-Douglas-Peucker ────────────────────────────────────────────────────

function rdpSimplify(points, epsilon) {
  if (points.length <= 2) return points;
  let maxDist = 0, maxIdx = 0;
  const s = points[0], e = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointToSegDist(points[i], s, e);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist > epsilon) {
    const l = rdpSimplify(points.slice(0, maxIdx + 1), epsilon);
    const r = rdpSimplify(points.slice(maxIdx), epsilon);
    return l.slice(0, -1).concat(r);
  }
  return [s, e];
}

function pointToSegDist([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function distSq(a, b) { return (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2; }

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