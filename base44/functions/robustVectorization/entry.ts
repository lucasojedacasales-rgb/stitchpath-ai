import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { image_url, width_mm = 100, height_mm = 100, color_count = 6 } = await req.json();

    if (!image_url) return Response.json({ error: 'image_url required' }, { status: 400 });

    console.log(`Starting vectorization: ${image_url}`);

    // Fetch the image
    const imgRes = await fetch(image_url);
    if (!imgRes.ok) throw new Error(`Image fetch failed: ${imgRes.status}`);

    const buffer = await imgRes.arrayBuffer();
    const uint8 = new Uint8Array(buffer);

    console.log(`Image buffer size: ${uint8.length} bytes`);

    // Simple approach: treat raw bytes as RGB/RGBA
    // Sample pixels from buffer directly
    const w = Math.sqrt(uint8.length / 4);
    const h = w;
    const pixels = new Uint8ClampedArray(uint8);

    console.log(`Estimated dimensions: ${w}x${h}`);

    // Step 1: Quantize colors
    const quantized = quantizeImage(pixels, w, h, color_count);
    console.log(`Quantized to ${quantized.length} colors`);

    // Step 2: Find contours
    const regions = [];

    for (let colorIdx = 0; colorIdx < quantized.length; colorIdx++) {
      const { mask, hex } = quantized[colorIdx];
      const contours = findContours(mask, w, h);

      console.log(`Color ${hex}: ${contours.length} contours found`);

      for (const contour of contours) {
        if (contour.length < 8) continue;

        const simplified = simplifyCurve(contour, 0.8);
        if (simplified.length < 3) continue;

        const normalized = simplified.map(p => [p[0] / w, p[1] / h]);

        // Close polygon
        const first = normalized[0];
        const last = normalized[normalized.length - 1];
        if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 0.002) {
          normalized.push([...first]);
        }

        if (normalized.length < 3) continue;

        const m = calculateMetrics(normalized);
        if (m.area < 0.00008) continue;

        const stitchType = classifyStitch(m);
        const stitchCount = countStitches(stitchType, m);

        regions.push({
          id: `r${regions.length}`,
          name: `${stitchType}_${colorIdx}`,
          color: hex,
          stitch_type: stitchType,
          density: 0.7,
          angle: 45,
          path_points: normalized,
          area_mm2: m.area * width_mm * height_mm,
          perimeter_mm: m.perim * Math.sqrt(width_mm * height_mm),
          stitch_count: stitchCount,
          visible: true,
          generated_from: 'buffer_vectorization'
        });
      }
    }

    console.log(`Extracted ${regions.length} regions`);

    if (regions.length === 0) {
      throw new Error('No valid regions detected');
    }

    const totalStitches = regions.reduce((s, r) => s + (r.stitch_count || 0), 0);
    const uniqueColors = new Set(regions.map(r => r.color)).size;

    return Response.json({
      success: true,
      data: {
        regions: regions.slice(0, 50),
        total_stitches: totalStitches,
        colors_used: uniqueColors,
        total_regions: regions.length,
        generation_method: 'buffer_vectorization'
      }
    });

  } catch (error) {
    console.error('Vectorization failed:', error.message);
    return Response.json({
      success: false,
      error: error.message,
      data: { regions: [], total_stitches: 0 }
    }, { status: 422 });
  }
});

// ─── COLOR QUANTIZATION ───────────────────────────────────────

function quantizeImage(pixels, w, h, k) {
  const n = Math.floor(w * h);
  const centroids = [];

  // Initialize with random sample
  for (let i = 0; i < k; i++) {
    const idx = Math.floor(Math.random() * n) * 4;
    centroids.push([pixels[idx], pixels[idx + 1], pixels[idx + 2]]);
  }

  // K-means
  for (let iter = 0; iter < 4; iter++) {
    const clusters = Array(k)
      .fill(null)
      .map(() => []);

    for (let i = 0; i < n; i++) {
      const r = pixels[i * 4] || 0;
      const g = pixels[i * 4 + 1] || 0;
      const b = pixels[i * 4 + 2] || 0;

      let minD = Infinity;
      let bestC = 0;

      for (let c = 0; c < k; c++) {
        const d = (r - centroids[c][0]) ** 2 + (g - centroids[c][1]) ** 2 + (b - centroids[c][2]) ** 2;
        if (d < minD) {
          minD = d;
          bestC = c;
        }
      }

      clusters[bestC].push([r, g, b]);
    }

    // Recompute centroids
    for (let c = 0; c < k; c++) {
      if (clusters[c].length > 0) {
        const sum = clusters[c].reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
        centroids[c] = [sum[0] / clusters[c].length, sum[1] / clusters[c].length, sum[2] / clusters[c].length];
      }
    }
  }

  // Create masks
  const result = [];
  for (let c = 0; c < k; c++) {
    const mask = new Uint8Array(n);

    for (let i = 0; i < n; i++) {
      const r = pixels[i * 4] || 0;
      const g = pixels[i * 4 + 1] || 0;
      const b = pixels[i * 4 + 2] || 0;

      let minD = Infinity;
      for (let j = 0; j < k; j++) {
        const d = (r - centroids[j][0]) ** 2 + (g - centroids[j][1]) ** 2 + (b - centroids[j][2]) ** 2;
        if (d < minD) minD = d;
      }

      const d = (r - centroids[c][0]) ** 2 + (g - centroids[c][1]) ** 2 + (b - centroids[c][2]) ** 2;
      mask[i] = d <= minD * 1.15 ? 255 : 0;
    }

    const hex = '#' + centroids[c].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
    result.push({ mask, hex });
  }

  return result;
}

// ─── CONTOUR DETECTION ────────────────────────────────────────

function findContours(mask, w, h) {
  const visited = new Uint8Array(w * h);
  const contours = [];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (mask[idx] > 128 && !visited[idx]) {
        const contour = traceContour(mask, visited, x, y, w, h);
        if (contour.length > 6) contours.push(contour);
      }
    }
  }

  return contours;
}

function traceContour(mask, visited, sx, sy, w, h) {
  const contour = [];
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  let x = sx;
  let y = sy;
  let dir = 0;

  do {
    const idx = y * w + x;
    visited[idx] = 1;
    contour.push([x, y]);

    let found = false;
    for (let i = 0; i < 8; i++) {
      const d = (dir + i) % 8;
      const nx = x + dirs[d][0];
      const ny = y + dirs[d][1];

      if (nx > 0 && nx < w - 1 && ny > 0 && ny < h - 1) {
        const nidx = ny * w + nx;
        if (mask[nidx] > 128) {
          x = nx;
          y = ny;
          dir = d;
          found = true;
          break;
        }
      }
    }

    if (!found || (x === sx && y === sy) || contour.length > 5000) break;
  } while (contour.length < 5000);

  return contour;
}

// ─── SIMPLIFICATION ───────────────────────────────────────────

function simplifyCurve(points, tol) {
  if (points.length < 4) return points;

  const first = points[0];
  const last = points[points.length - 1];

  let maxDist = 0;
  let maxIdx = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const d = pointLineDist(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > tol) {
    const left = simplifyCurve(points.slice(0, maxIdx + 1), tol);
    const right = simplifyCurve(points.slice(maxIdx), tol);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

function pointLineDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);

  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));

  const px = a[0] + t * dx;
  const py = a[1] + t * dy;
  return Math.hypot(p[0] - px, p[1] - py);
}

// ─── METRICS ──────────────────────────────────────────────────

function calculateMetrics(polygon) {
  let area = 0;
  let perim = 0;

  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    area += p1[0] * p2[1] - p2[0] * p1[1];
    perim += Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  }

  return { area: Math.abs(area) / 2, perim };
}

function classifyStitch(m) {
  const { area, perim } = m;
  if (area < 0.0008) return 'running_stitch';
  const circ = (4 * Math.PI * area) / (perim * perim || 1);
  if (area > 0.035 && circ > 0.5) return 'fill';
  if (area / perim < 0.012) return 'satin';
  return 'fill';
}

function countStitches(type, m) {
  const { area, perim } = m;
  if (type === 'fill') return Math.round(area * 0.7 * 2.5);
  if (type === 'satin') return Math.round((perim / 2.5) * (area / perim / 0.7));
  return Math.round(perim / 1.5);
}