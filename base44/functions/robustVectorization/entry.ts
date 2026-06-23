import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * ROBUST VECTORIZATION ENGINE
 * Expects pre-extracted pixel data from client
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { pixels, width, height, width_mm = 100, height_mm = 100, color_count = 6 } = await req.json();

    if (!pixels || !width || !height) {
      return Response.json({ error: 'pixels, width, height required' }, { status: 400 });
    }

    console.log(`Vectorizing ${width}x${height} image (${pixels.length} values)`);

    const pixelArray = new Uint8ClampedArray(pixels);

    // Step 1: Color quantization
    const quantized = quantizeColors(pixelArray, width, height, Math.min(color_count, 8));
    console.log(`Quantized to ${quantized.length} colors`);

    // Step 2: Find contours for each color
    const regions = [];

    for (const colorData of quantized) {
      const contours = traceAllContours(colorData.mask, width, height);

      for (const contour of contours) {
        if (contour.length < 10) continue;

        // Simplify contour
        const simplified = simplify(contour, 1.0);
        if (simplified.length < 3) continue;

        // Normalize to [0, 1]
        const normalized = simplified.map(([x, y]) => [x / width, y / height]);

        // Ensure closed
        const first = normalized[0];
        const last = normalized[normalized.length - 1];
        if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 0.003) {
          normalized.push([first[0], first[1]]);
        }

        if (normalized.length < 3) continue;

        const geo = computeGeometry(normalized);
        if (geo.area < 0.0001) continue;

        const type = classifyType(geo);
        const count = estimateStitches(type, geo);

        regions.push({
          id: `r${regions.length}`,
          name: `${type}_${colorData.hex.slice(1)}`,
          color: colorData.hex,
          stitch_type: type,
          density: 0.7,
          angle: 45,
          path_points: normalized,
          area_mm2: geo.area * width_mm * height_mm,
          perimeter_mm: geo.perimeter * Math.sqrt(width_mm * height_mm),
          stitch_count: count,
          visible: true,
          generated_from: 'real_vectorization'
        });
      }
    }

    console.log(`Extracted ${regions.length} valid regions`);

    if (regions.length === 0) {
      return Response.json({
        success: false,
        error: 'No regions detected',
        data: { regions: [], total_stitches: 0 }
      }, { status: 422 });
    }

    const totalStitches = regions.reduce((s, r) => s + (r.stitch_count || 0), 0);

    return Response.json({
      success: true,
      data: {
        regions: regions.slice(0, 50),
        total_stitches: totalStitches,
        colors_used: new Set(regions.map(r => r.color)).size,
        total_regions: regions.length
      }
    });

  } catch (error) {
    console.error('Vectorization error:', error.message);
    return Response.json({
      success: false,
      error: error.message,
      data: { regions: [], total_stitches: 0 }
    }, { status: 422 });
  }
});

// ─── COLOR QUANTIZATION ───────────────────────────────────────

function quantizeColors(pixels, w, h, k) {
  const n = w * h;
  const centroids = [];

  // Random init
  for (let i = 0; i < k; i++) {
    const idx = Math.floor(Math.random() * n) * 4;
    centroids.push([
      pixels[idx] || 128,
      pixels[idx + 1] || 128,
      pixels[idx + 2] || 128
    ]);
  }

  // K-means (5 iterations)
  for (let iter = 0; iter < 5; iter++) {
    const clusters = Array(k)
      .fill(null)
      .map(() => []);

    for (let i = 0; i < n; i++) {
      const r = pixels[i * 4];
      const g = pixels[i * 4 + 1];
      const b = pixels[i * 4 + 2];

      let minDist = Infinity;
      let bestCluster = 0;

      for (let c = 0; c < k; c++) {
        const dist =
          Math.pow(r - centroids[c][0], 2) +
          Math.pow(g - centroids[c][1], 2) +
          Math.pow(b - centroids[c][2], 2);

        if (dist < minDist) {
          minDist = dist;
          bestCluster = c;
        }
      }

      clusters[bestCluster].push([r, g, b]);
    }

    // Update centroids
    for (let c = 0; c < k; c++) {
      if (clusters[c].length > 0) {
        const [sr, sg, sb] = clusters[c].reduce(
          (sum, [r, g, b]) => [sum[0] + r, sum[1] + g, sum[2] + b],
          [0, 0, 0]
        );
        centroids[c] = [
          sr / clusters[c].length,
          sg / clusters[c].length,
          sb / clusters[c].length
        ];
      }
    }
  }

  // Create binary masks
  const result = [];
  for (let c = 0; c < k; c++) {
    const mask = new Uint8Array(n);

    for (let i = 0; i < n; i++) {
      const r = pixels[i * 4];
      const g = pixels[i * 4 + 1];
      const b = pixels[i * 4 + 2];

      let minDist = Infinity;
      for (let j = 0; j < k; j++) {
        const d =
          Math.pow(r - centroids[j][0], 2) +
          Math.pow(g - centroids[j][1], 2) +
          Math.pow(b - centroids[j][2], 2);
        if (d < minDist) minDist = d;
      }

      const d =
        Math.pow(r - centroids[c][0], 2) +
        Math.pow(g - centroids[c][1], 2) +
        Math.pow(b - centroids[c][2], 2);

      mask[i] = d <= minDist * 1.12 ? 255 : 0;
    }

    const hex =
      '#' +
      centroids[c]
        .map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
        .join('');

    result.push({ mask, hex });
  }

  return result;
}

// ─── CONTOUR TRACING ──────────────────────────────────────────

function traceAllContours(mask, w, h) {
  const visited = new Set();
  const contours = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const key = `${x},${y}`;
      if (mask[y * w + x] > 128 && !visited.has(key)) {
        const contour = mooreBoundaryTrace(mask, visited, x, y, w, h);
        if (contour.length >= 10) {
          contours.push(contour);
        }
      }
    }
  }

  return contours;
}

function mooreBoundaryTrace(mask, visited, sx, sy, w, h) {
  const contour = [];
  const dirs = [
    [0, -1],  // N
    [1, -1],  // NE
    [1, 0],   // E
    [1, 1],   // SE
    [0, 1],   // S
    [-1, 1],  // SW
    [-1, 0],  // W
    [-1, -1]  // NW
  ];

  let x = sx;
  let y = sy;
  let dir = 0;
  const maxIter = w * h * 2;
  let iter = 0;

  do {
    const key = `${x},${y}`;
    visited.add(key);
    contour.push([x, y]);

    let found = false;
    for (let i = 0; i < 8; i++) {
      const d = (dir + i) % 8;
      const [dx, dy] = dirs[d];
      const nx = x + dx;
      const ny = y + dy;

      if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[ny * w + nx] > 128) {
        x = nx;
        y = ny;
        dir = d;
        found = true;
        break;
      }
    }

    if (!found || (x === sx && y === sy && contour.length > 20)) break;
    iter++;
  } while (iter < maxIter);

  return contour;
}

// ─── CURVE SIMPLIFICATION ─────────────────────────────────────

function simplify(points, tolerance) {
  if (points.length < 4) return points;

  const first = points[0];
  const last = points[points.length - 1];

  let maxDist = 0;
  let maxIdx = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplify(points.slice(0, maxIdx + 1), tolerance);
    const right = simplify(points.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

function perpendicularDistance(point, lineStart, lineEnd) {
  const [px, py] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const denom = dx * dx + dy * dy;

  if (denom === 0) {
    return Math.hypot(px - x1, py - y1);
  }

  let t = ((px - x1) * dx + (py - y1) * dy) / denom;
  t = Math.max(0, Math.min(1, t));

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  return Math.hypot(px - projX, py - projY);
}

// ─── GEOMETRY COMPUTATION ─────────────────────────────────────

function computeGeometry(polygon) {
  let area = 0;
  let perimeter = 0;

  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];

    area += x1 * y2 - x2 * y1;
    perimeter += Math.hypot(x2 - x1, y2 - y1);
  }

  return {
    area: Math.abs(area) / 2,
    perimeter
  };
}

// ─── STITCH TYPE CLASSIFICATION ───────────────────────────────

function classifyType(geo) {
  const { area, perimeter } = geo;

  if (area < 0.001) return 'running_stitch';

  const circularity = (4 * Math.PI * area) / (perimeter * perimeter || 1);
  if (area > 0.04 && circularity > 0.55) return 'fill';

  const width = perimeter > 0 ? area / perimeter : 0;
  if (width < 0.015) return 'satin';

  return 'fill';
}

// ─── STITCH ESTIMATION ────────────────────────────────────────

function estimateStitches(type, geo) {
  const { area, perimeter } = geo;
  const density = 0.7;

  if (type === 'fill') {
    return Math.round(area * density * 2.5);
  } else if (type === 'satin') {
    const width = Math.max(0.01, area / perimeter);
    return Math.round((perimeter / 2.5) * (width / Math.max(0.4, density)));
  } else {
    return Math.round(perimeter / 1.5);
  }
}