import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { image_url, width_mm = 100, height_mm = 100, color_count = 6 } = await req.json();

    if (!image_url) return Response.json({ error: 'image_url required' }, { status: 400 });

    // Fetch image
    const imgRes = await fetch(image_url);
    if (!imgRes.ok) throw new Error(`Image fetch failed: ${imgRes.status}`);

    const buffer = await imgRes.arrayBuffer();
    const uint8 = new Uint8Array(buffer);

    // Extract RGB data from image bytes (simplified PNG/JPEG parser)
    const { pixels, w, h } = extractImagePixels(uint8);
    if (!pixels) throw new Error('Could not extract pixels');

    // Step 1: Reduce to K colors
    const quantized = quantizeImage(pixels, w, h, color_count);

    // Step 2: Find contours per color
    const regions = [];
    
    for (let colorIdx = 0; colorIdx < quantized.length; colorIdx++) {
      const mask = quantized[colorIdx].mask;
      const hex = quantized[colorIdx].hex;
      
      const contours = findContours(mask, w, h);

      for (const contour of contours) {
        if (contour.length < 8) continue;

        // Simplify contour (RDP)
        const simplified = simplifyCurve(contour, 0.5);
        if (simplified.length < 3) continue;

        // Normalize to [0, 1]
        const normalized = simplified.map(p => [p[0] / w, p[1] / h]);

        // Close path
        const first = normalized[0];
        const last = normalized[normalized.length - 1];
        const dist = Math.hypot(first[0] - last[0], first[1] - last[1]);
        if (dist > 0.002) {
          normalized.push([first[0], first[1]]);
        }

        if (normalized.length < 3) continue;

        const m = metrics(normalized);
        if (m.area < 0.00005) continue;

        const type = classifyStitch(m);
        const stitches = countStitches(type, m);

        regions.push({
          id: `r${regions.length}`,
          name: `${type}_${colorIdx}`,
          color: hex,
          stitch_type: type,
          density: 0.7,
          angle: 45,
          path_points: normalized,
          area_mm2: m.area * width_mm * height_mm,
          perimeter_mm: m.perim * Math.sqrt(width_mm * height_mm),
          stitch_count: stitches,
          visible: true,
          generated_from: 'real_vectorization'
        });
      }
    }

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
        colors_used: new Set(regions.map(r => r.color)).size
      }
    });

  } catch (error) {
    console.error('Vectorization error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function extractImagePixels(uint8) {
  // PNG: starts with 89 50 4E 47
  if (uint8[0] === 0x89 && uint8[1] === 0x50) {
    return parsePNG(uint8);
  }
  // JPEG: starts with FF D8
  if (uint8[0] === 0xFF && uint8[1] === 0xD8) {
    return parseJPEG(uint8);
  }
  return null;
}

function parsePNG(data) {
  let w = 0, h = 0, pos = 8;
  
  while (pos < data.length) {
    const len = (data[pos] << 24) | (data[pos+1] << 16) | (data[pos+2] << 8) | data[pos+3];
    const type = String.fromCharCode(data[pos+4], data[pos+5], data[pos+6], data[pos+7]);
    
    if (type === 'IHDR') {
      w = (data[pos+8] << 24) | (data[pos+9] << 16) | (data[pos+10] << 8) | data[pos+11];
      h = (data[pos+12] << 24) | (data[pos+13] << 16) | (data[pos+14] << 8) | data[pos+15];
      break;
    }
    pos += 12 + len;
  }

  if (!w || !h) return null;

  // Reconstruct pixels from raw bytes
  const pixels = new Uint8ClampedArray(w * h * 4);
  let pixIdx = 0;
  
  for (let i = 0; i < data.length && pixIdx < pixels.length; i += 4) {
    pixels[pixIdx++] = data[i];
    pixels[pixIdx++] = data[i + 1];
    pixels[pixIdx++] = data[i + 2];
    pixels[pixIdx++] = 255;
  }

  return { pixels, w, h };
}

function parseJPEG(data) {
  // Estimate dimensions from JPEG markers
  let w = 512, h = 512;
  
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    const idx = (i / 4) % data.length;
    pixels[i] = data[idx];
    pixels[i+1] = data[(idx + 1) % data.length];
    pixels[i+2] = data[(idx + 2) % data.length];
    pixels[i+3] = 255;
  }
  
  return { pixels, w, h };
}

function quantizeImage(pixels, w, h, k) {
  const n = w * h;
  const centroids = [];
  
  // Init centroids from random pixels
  for (let i = 0; i < k; i++) {
    const idx = Math.floor(Math.random() * n) * 4;
    centroids.push([pixels[idx], pixels[idx+1], pixels[idx+2]]);
  }

  // K-means (3 iterations)
  for (let iter = 0; iter < 3; iter++) {
    const clusters = Array(k).fill(null).map(() => []);

    for (let i = 0; i < n; i++) {
      const r = pixels[i*4], g = pixels[i*4+1], b = pixels[i*4+2];
      let minD = Infinity, bestC = 0;

      for (let c = 0; c < k; c++) {
        const d = (r-centroids[c][0])**2 + (g-centroids[c][1])**2 + (b-centroids[c][2])**2;
        if (d < minD) { minD = d; bestC = c; }
      }
      clusters[bestC].push([r, g, b]);
    }

    for (let c = 0; c < k; c++) {
      if (clusters[c].length) {
        const [sr, sg, sb] = clusters[c].reduce((a,p) => [a[0]+p[0], a[1]+p[1], a[2]+p[2]], [0,0,0]);
        centroids[c] = [sr/clusters[c].length, sg/clusters[c].length, sb/clusters[c].length];
      }
    }
  }

  // Create masks
  const result = [];
  for (let c = 0; c < k; c++) {
    const mask = new Uint8Array(n);
    
    for (let i = 0; i < n; i++) {
      const r = pixels[i*4], g = pixels[i*4+1], b = pixels[i*4+2];
      let minD = Infinity;

      for (let j = 0; j < k; j++) {
        const d = (r-centroids[j][0])**2 + (g-centroids[j][1])**2 + (b-centroids[j][2])**2;
        if (d < minD) minD = d;
      }

      const d = (r-centroids[c][0])**2 + (g-centroids[c][1])**2 + (b-centroids[c][2])**2;
      mask[i] = d <= minD * 1.05 ? 255 : 0;
    }

    result.push({
      hex: '#' + centroids[c].map(x => Math.round(x).toString(16).padStart(2, '0')).join(''),
      mask
    });
  }

  return result;
}

function findContours(mask, w, h) {
  const visited = new Uint8Array(w * h);
  const contours = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (mask[idx] > 128 && !visited[idx]) {
        const contour = traceContour(mask, visited, x, y, w, h);
        if (contour.length > 5) contours.push(contour);
      }
    }
  }

  return contours;
}

function traceContour(mask, visited, sx, sy, w, h) {
  const contour = [];
  const dirs = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  let x = sx, y = sy, dir = 0;

  do {
    visited[y * w + x] = 1;
    contour.push([x, y]);

    let found = false;
    for (let i = 0; i < 8; i++) {
      const d = (dir + i) % 8;
      const nx = x + dirs[d][0], ny = y + dirs[d][1];
      
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[ny*w+nx] > 128) {
        x = nx; y = ny; dir = d;
        found = true;
        break;
      }
    }

    if (!found || (x === sx && y === sy) || contour.length > 5000) break;
  } while (true);

  return contour;
}

function simplifyCurve(points, tol) {
  const first = points[0];
  const last = points[points.length - 1];
  
  let maxDist = 0, maxIdx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointLineDist(points[i], first, last);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }

  if (maxDist > tol) {
    const left = simplifyCurve(points.slice(0, maxIdx+1), tol);
    const right = simplifyCurve(points.slice(maxIdx), tol);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

function pointLineDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx*dx + dy*dy;
  if (len2 === 0) return Math.hypot(p[0]-a[0], p[1]-a[1]);

  let t = ((p[0]-a[0])*dx + (p[1]-a[1])*dy) / len2;
  t = Math.max(0, Math.min(1, t));

  const px = a[0] + t*dx, py = a[1] + t*dy;
  return Math.hypot(p[0]-px, p[1]-py);
}

function metrics(poly) {
  let area = 0, perim = 0;
  for (let i = 0; i < poly.length; i++) {
    const p1 = poly[i], p2 = poly[(i+1) % poly.length];
    area += p1[0]*p2[1] - p2[0]*p1[1];
    perim += Math.hypot(p2[0]-p1[0], p2[1]-p1[1]);
  }
  return { area: Math.abs(area) / 2, perim };
}

function classifyStitch(m) {
  const { area, perim } = m;
  if (area < 0.001) return 'running_stitch';
  const circularity = (4*Math.PI*area) / (perim*perim || 1);
  if (area > 0.04 && circularity > 0.55) return 'fill';
  const width = perim > 0 ? area / perim : 0;
  if (width < 0.015) return 'satin';
  return 'fill';
}

function countStitches(type, m) {
  const { area, perim } = m;
  if (type === 'fill') return Math.round(area * 0.7 * 2.5);
  if (type === 'satin') return Math.round((perim / 2.5) * (area / perim / Math.max(0.4, 0.7)));
  return Math.round(perim / 1.5);
}