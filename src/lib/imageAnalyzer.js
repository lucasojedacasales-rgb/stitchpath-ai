/**
 * Client-side image analyzer.
 * Extracts dominant colors, color zones bounding boxes, and edge map data
 * to feed the AI prompt with real image metadata for precise contour tracing.
 */

export async function analyzeImage(imageUrl, maxColors = 10, analysisSize = 512) {
  const img = await loadImage(imageUrl);

  // Clamp analysis size: min 256 for speed, max 1024 (beyond that k-means gets slow)
  const ANALYSIS_SIZE = Math.min(1024, Math.max(256, analysisSize));
  const scale = Math.min(ANALYSIS_SIZE / img.width, ANALYSIS_SIZE / img.height);
  const W = Math.round(img.width * scale);
  const H = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);

  const imageData = ctx.getImageData(0, 0, W, H);
  const pixels = imageData.data;

  // --- 1. Dominant colors via k-means++ ---
  const dominantColors = kMeansPlusPlus(pixels, W, H, maxColors);

  // --- 2. Per-color bounding boxes and region map ---
  const colorRegions = computeColorRegions(pixels, W, H, dominantColors);

  // --- 3. Edge map (Sobel) for contour hint data ---
  const edgeDensityMap = computeEdgeDensityGrid(pixels, W, H, 8); // 8x8 grid cells

  // --- 4. Aspect ratio ---
  const aspectRatio = img.width / img.height;

  return {
    imageWidth: img.width,
    imageHeight: img.height,
    aspectRatio,
    dominantColors,
    colorRegions,
    edgeDensityMap,
    analysisW: W,
    analysisH: H,
  };
}

// ─── K-Means++ ────────────────────────────────────────────────────────────────

function kMeansPlusPlus(pixels, W, H, k) {
  // Sample every 4th pixel for speed
  const samples = [];
  for (let i = 0; i < pixels.length; i += 16) {
    const a = pixels[i + 3];
    if (a < 128) continue; // skip transparent
    samples.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
  }
  if (samples.length === 0) return [];

  k = Math.min(k, samples.length);

  // Init centroids with k-means++
  const centroids = [samples[Math.floor(Math.random() * samples.length)]];
  while (centroids.length < k) {
    const dists = samples.map(s => Math.min(...centroids.map(c => colorDistSq(s, c))));
    const total = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i];
      if (r <= 0) { centroids.push(samples[i]); break; }
    }
    if (centroids.length < k) centroids.push(samples[samples.length - 1]);
  }

  // Iterate k-means (10 passes is enough for 256px image)
  for (let iter = 0; iter < 10; iter++) {
    const sums = centroids.map(() => [0, 0, 0, 0]); // r,g,b,count
    for (const s of samples) {
      let best = 0, bestD = Infinity;
      for (let ci = 0; ci < centroids.length; ci++) {
        const d = colorDistSq(s, centroids[ci]);
        if (d < bestD) { bestD = d; best = ci; }
      }
      sums[best][0] += s[0]; sums[best][1] += s[1]; sums[best][2] += s[2]; sums[best][3]++;
    }
    for (let ci = 0; ci < centroids.length; ci++) {
      const cnt = sums[ci][3];
      if (cnt > 0) centroids[ci] = [sums[ci][0] / cnt, sums[ci][1] / cnt, sums[ci][2] / cnt];
    }
  }

  // Count pixel membership and compute coverage %
  const counts = new Array(k).fill(0);
  for (const s of samples) {
    let best = 0, bestD = Infinity;
    for (let ci = 0; ci < centroids.length; ci++) {
      const d = colorDistSq(s, centroids[ci]);
      if (d < bestD) { bestD = d; best = ci; }
    }
    counts[best]++;
  }
  const total = samples.length;

  return centroids
    .map((c, i) => ({ hex: rgbToHex(c), rgb: c, coverage: counts[i] / total }))
    .filter(c => c.coverage > 0.001) // keep even tiny color zones (0.1%) — eyes, nose, etc.
    .sort((a, b) => b.coverage - a.coverage)
    .slice(0, k);
}

// ─── Color Region Bounding Boxes ─────────────────────────────────────────────

function computeColorRegions(pixels, W, H, dominantColors) {
  const regions = dominantColors.map(dc => ({
    hex: dc.hex,
    coverage: dc.coverage,
    minX: 1, maxX: 0, minY: 1, maxY: 0,
    pixelCount: 0,
  }));

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      const a = pixels[idx + 3];
      if (a < 128) continue;
      const rgb = [pixels[idx], pixels[idx + 1], pixels[idx + 2]];
      let best = 0, bestD = Infinity;
      for (let ci = 0; ci < dominantColors.length; ci++) {
        const d = colorDistSq(rgb, dominantColors[ci].rgb);
        if (d < bestD) { bestD = d; best = ci; }
      }
      const nx = x / W, ny = y / H;
      const r = regions[best];
      if (nx < r.minX) r.minX = nx;
      if (nx > r.maxX) r.maxX = nx;
      if (ny < r.minY) r.minY = ny;
      if (ny > r.maxY) r.maxY = ny;
      r.pixelCount++;
    }
  }

  return regions.filter(r => r.pixelCount > 0);
}

// ─── Edge Density Grid (Sobel) ───────────────────────────────────────────────

function computeEdgeDensityGrid(pixels, W, H, gridSize) {
  // Compute Sobel edge magnitude per pixel
  const gray = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    gray[i] = 0.299 * pixels[i * 4] + 0.587 * pixels[i * 4 + 1] + 0.114 * pixels[i * 4 + 2];
  }

  const sobelMag = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const gx =
        -gray[(y - 1) * W + (x - 1)] + gray[(y - 1) * W + (x + 1)]
        - 2 * gray[y * W + (x - 1)] + 2 * gray[y * W + (x + 1)]
        - gray[(y + 1) * W + (x - 1)] + gray[(y + 1) * W + (x + 1)];
      const gy =
        -gray[(y - 1) * W + (x - 1)] - 2 * gray[(y - 1) * W + x] - gray[(y - 1) * W + (x + 1)]
        + gray[(y + 1) * W + (x - 1)] + 2 * gray[(y + 1) * W + x] + gray[(y + 1) * W + (x + 1)];
      sobelMag[y * W + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  // Build NxN grid of average edge density (0-1)
  const cellW = W / gridSize, cellH = H / gridSize;
  const grid = [];
  for (let gy = 0; gy < gridSize; gy++) {
    const row = [];
    for (let gx = 0; gx < gridSize; gx++) {
      let sum = 0, count = 0;
      const x0 = Math.round(gx * cellW), x1 = Math.round((gx + 1) * cellW);
      const y0 = Math.round(gy * cellH), y1 = Math.round((gy + 1) * cellH);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          sum += sobelMag[y * W + x];
          count++;
        }
      }
      row.push(count > 0 ? Math.min(1, (sum / count) / 128) : 0);
    }
    grid.push(row);
  }
  return grid;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function colorDistSq(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

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