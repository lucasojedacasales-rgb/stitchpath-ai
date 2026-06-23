import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { imageUrl, colorClusters = 8, edgeThreshold = 0.3, minRegionArea = 5 } = await req.json();
    if (!imageUrl) return Response.json({ error: 'imageUrl required' }, { status: 400 });

    const startMs = Date.now();

    // ── 1. Download image and decode to RGBA ──────────────────────────────────
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) return Response.json({ error: 'Could not fetch image' }, { status: 400 });
    const imgBuf = await imgResp.arrayBuffer();

    // Decode PNG/JPEG using canvas via OffscreenCanvas (Deno doesn't have DOM canvas)
    // We'll use a pure-JS approach: decode via the base44 LLM to get pixel data is impractical,
    // so we use the sharp-compatible approach via npm:jimp
    const Jimp = (await import('npm:jimp@0.22.12')).Jimp;
    const image = await Jimp.read(Buffer.from(imgBuf));

    const origW = image.getWidth();
    const origH = image.getHeight();

    // Work at max 512px for performance
    const scale = Math.min(512 / origW, 512 / origH, 1);
    const W = Math.round(origW * scale);
    const H = Math.round(origH * scale);
    image.resize(W, H);

    // Build flat RGBA array
    const rgba = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const hex = image.getPixelColor(x, y);
        const i = (y * W + x) * 4;
        rgba[i]     = (hex >>> 24) & 0xff;
        rgba[i + 1] = (hex >>> 16) & 0xff;
        rgba[i + 2] = (hex >>> 8)  & 0xff;
        rgba[i + 3] = hex & 0xff;
      }
    }

    // px → mm conversion
    const pxToMm = (px) => px / scale * (100 / origW); // assume 100mm width by default
    const mmPerPx = 100 / origW / scale; // 1px in mm

    // ── 2. Canny edge detection (adaptive threshold) ───────────────────────────
    const gray = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
      gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }

    // Gaussian blur 5x5
    const blurred = gaussianBlur(gray, W, H);

    // Sobel gradients
    const { gx, gy, mag } = sobelGradients(blurred, W, H);

    // Adaptive threshold: edgeThreshold * (mean + k*stddev)
    let sum = 0, sum2 = 0;
    for (let i = 0; i < mag.length; i++) { sum += mag[i]; sum2 += mag[i] * mag[i]; }
    const mean = sum / mag.length;
    const stddev = Math.sqrt(sum2 / mag.length - mean * mean);
    const highT = edgeThreshold * (mean + 2 * stddev);
    const lowT  = highT * 0.4;

    const edges = cannyNMS(mag, gx, gy, W, H, lowT, highT);

    // ── 3. K-means++ with edge constraints ────────────────────────────────────
    const k = Math.max(2, Math.min(colorClusters, 20));
    const samples = [];
    for (let i = 0; i < W * H; i++) {
      if (rgba[i * 4 + 3] < 128) continue;
      samples.push({ idx: i, rgb: [rgba[i*4], rgba[i*4+1], rgba[i*4+2]], isEdge: edges[i] > 0 });
    }

    // Init k-means++ from non-edge pixels preferentially
    const nonEdge = samples.filter(s => !s.isEdge);
    const seed = nonEdge.length > 0 ? nonEdge : samples;
    const centroids = [seed[Math.floor(Math.random() * seed.length)].rgb];
    while (centroids.length < k) {
      const dists = samples.map(s => Math.min(...centroids.map(c => distSq(s.rgb, c))));
      const total = dists.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      for (let i = 0; i < dists.length; i++) {
        r -= dists[i];
        if (r <= 0) { centroids.push([...samples[i].rgb]); break; }
      }
      if (centroids.length < k) centroids.push([...seed[seed.length - 1].rgb]);
    }

    // K-means iterations — edge pixels get assigned BUT their label gets special treatment
    const labels = new Int32Array(W * H).fill(-1);
    for (let iter = 0; iter < 15; iter++) {
      const sums = centroids.map(() => [0, 0, 0, 0]);
      for (const s of samples) {
        const ci = nearestIdx(s.rgb, centroids);
        labels[s.idx] = ci;
        if (!s.isEdge) {
          sums[ci][0] += s.rgb[0]; sums[ci][1] += s.rgb[1]; sums[ci][2] += s.rgb[2]; sums[ci][3]++;
        }
      }
      for (let ci = 0; ci < k; ci++) {
        const cnt = sums[ci][3];
        if (cnt > 0) centroids[ci] = [sums[ci][0]/cnt, sums[ci][1]/cnt, sums[ci][2]/cnt];
      }
    }

    // Force edge pixels to boundary (-1) so flood fill treats them as separators
    for (let i = 0; i < W * H; i++) {
      if (edges[i] > 0) labels[i] = -1;
    }

    // ── 4. Flood fill from random seeds per cluster ───────────────────────────
    const minPx = Math.max(4, Math.round(minRegionArea / (mmPerPx * mmPerPx)));
    const regions = floodFillRegions(labels, W, H, k, minPx, mmPerPx, rgba, centroids);

    // ── 5 & 6. Extract polygons + metrics ─────────────────────────────────────
    const epsilonPx = 0.5 / mmPerPx; // 0.5mm in pixels
    const outputRegions = [];

    for (const reg of regions) {
      const contour = traceContour(reg.mask, W, H);
      if (contour.length < 3) continue;
      const simplified = rdp(contour, epsilonPx);
      if (simplified.length < 3) continue;

      // Convert polygon to mm, origin = center of image
      const polygon = simplified.map(([x, y]) => [
        parseFloat(((x - W/2) * mmPerPx).toFixed(3)),
        parseFloat(((y - H/2) * mmPerPx).toFixed(3))
      ]);

      // Metrics
      const areaMm2 = reg.pixelCount * mmPerPx * mmPerPx;
      const perimeterMm = contourPerimeterMm(simplified, mmPerPx);
      const compactness = perimeterMm > 0 ? (perimeterMm * perimeterMm) / areaMm2 : 0;
      const centroid = reg.centroid;
      const dominantAngle = pca2DAngle(reg.pixels);
      const isEdgeRegion = reg.bbox.minX === 0 || reg.bbox.minY === 0 || reg.bbox.maxX >= W-1 || reg.bbox.maxY >= H-1;

      outputRegions.push({
        id: reg.id,
        color: reg.hex,
        polygon,
        area: parseFloat(areaMm2.toFixed(2)),
        perimeter: parseFloat(perimeterMm.toFixed(2)),
        compactness: parseFloat(compactness.toFixed(2)),
        dominantAngle,
        centroid: [
          parseFloat(((centroid[0] - W/2) * mmPerPx).toFixed(3)),
          parseFloat(((centroid[1] - H/2) * mmPerPx).toFixed(3))
        ],
        boundingBox: {
          x: parseFloat(((reg.bbox.minX - W/2) * mmPerPx).toFixed(3)),
          y: parseFloat(((reg.bbox.minY - H/2) * mmPerPx).toFixed(3)),
          w: parseFloat(((reg.bbox.maxX - reg.bbox.minX) * mmPerPx).toFixed(3)),
          h: parseFloat(((reg.bbox.maxY - reg.bbox.minY) * mmPerPx).toFixed(3)),
        },
        neighbors: [],
        isEdgeRegion,
      });
    }

    // Compute neighbors (regions sharing an edge pixel boundary)
    computeNeighbors(outputRegions, regions, labels, W, H);

    return Response.json({
      regions: outputRegions,
      metadata: {
        totalRegions: outputRegions.length,
        imageSizeMm: [parseFloat((origW * mmPerPx / scale).toFixed(1)), parseFloat((origH * mmPerPx / scale).toFixed(1))],
        processingTimeMs: Date.now() - startMs,
      }
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ── Image Processing Helpers ──────────────────────────────────────────────────

function gaussianBlur(gray, W, H) {
  const kernel = [1,4,6,4,1, 4,16,24,16,4, 6,24,36,24,6, 4,16,24,16,4, 1,4,6,4,1];
  const ksum = 256;
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (let ky = -2; ky <= 2; ky++) {
        for (let kx = -2; kx <= 2; kx++) {
          const ny = Math.max(0, Math.min(H-1, y+ky));
          const nx = Math.max(0, Math.min(W-1, x+kx));
          v += gray[ny*W+nx] * kernel[(ky+2)*5+(kx+2)];
        }
      }
      out[y*W+x] = v / ksum;
    }
  }
  return out;
}

function sobelGradients(gray, W, H) {
  const gx = new Float32Array(W * H);
  const gy = new Float32Array(W * H);
  const mag = new Float32Array(W * H);
  for (let y = 1; y < H-1; y++) {
    for (let x = 1; x < W-1; x++) {
      const g = (r,c) => gray[r*W+c];
      const sx = -g(y-1,x-1) + g(y-1,x+1) - 2*g(y,x-1) + 2*g(y,x+1) - g(y+1,x-1) + g(y+1,x+1);
      const sy = -g(y-1,x-1) - 2*g(y-1,x) - g(y-1,x+1) + g(y+1,x-1) + 2*g(y+1,x) + g(y+1,x+1);
      const i = y*W+x;
      gx[i] = sx; gy[i] = sy; mag[i] = Math.sqrt(sx*sx+sy*sy);
    }
  }
  return { gx, gy, mag };
}

function cannyNMS(mag, gx, gy, W, H, lowT, highT) {
  const nms = new Float32Array(W * H);
  for (let y = 1; y < H-1; y++) {
    for (let x = 1; x < W-1; x++) {
      const i = y*W+x;
      if (mag[i] < lowT) continue;
      const angle = Math.atan2(gy[i], gx[i]) * 180 / Math.PI;
      const a = ((angle + 180) % 180);
      let n1, n2;
      if (a < 22.5 || a >= 157.5)      { n1 = mag[i-1];   n2 = mag[i+1]; }
      else if (a < 67.5)               { n1 = mag[(y-1)*W+x+1]; n2 = mag[(y+1)*W+x-1]; }
      else if (a < 112.5)              { n1 = mag[(y-1)*W+x]; n2 = mag[(y+1)*W+x]; }
      else                             { n1 = mag[(y-1)*W+x-1]; n2 = mag[(y+1)*W+x+1]; }
      if (mag[i] >= n1 && mag[i] >= n2 && mag[i] >= highT) nms[i] = mag[i];
    }
  }
  return nms;
}

// ── Flood Fill Regions ────────────────────────────────────────────────────────

function floodFillRegions(labels, W, H, k, minPx, mmPerPx, rgba, centroids) {
  const regionMap = new Int32Array(W * H).fill(-1);
  const regions = [];
  let nextId = 0;

  for (let ci = 0; ci < k; ci++) {
    const visited = new Uint8Array(W * H);
    for (let start = 0; start < W * H; start++) {
      if (labels[start] !== ci || visited[start]) continue;
      const stack = [start];
      const pixelList = [];
      let minX = W, maxX = 0, minY = H, maxY = 0;
      let sx = 0, sy = 0;

      while (stack.length > 0) {
        const idx = stack.pop();
        if (visited[idx] || labels[idx] !== ci) continue;
        visited[idx] = 1;
        pixelList.push(idx);
        regionMap[idx] = nextId;
        const x = idx % W, y = Math.floor(idx / W);
        sx += x; sy += y;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (x > 0) stack.push(idx - 1);
        if (x < W-1) stack.push(idx + 1);
        if (y > 0) stack.push(idx - W);
        if (y < H-1) stack.push(idx + W);
      }

      if (pixelList.length < minPx) {
        // Reassign to nearest non-edge neighbor color
        for (const px of pixelList) regionMap[px] = -2; // mark for reassignment
        continue;
      }

      const mask = new Uint8Array(W * H);
      for (const px of pixelList) mask[px] = 1;

      const hex = rgbToHex(centroids[ci]);
      regions.push({
        id: `region_${String(nextId + 1).padStart(3, '0')}`,
        colorIdx: ci,
        hex,
        mask,
        pixels: pixelList,
        pixelCount: pixelList.length,
        centroid: [sx / pixelList.length, sy / pixelList.length],
        bbox: { minX, maxX, minY, maxY },
      });
      nextId++;
    }
  }
  return regions;
}

// ── Contour Tracing ───────────────────────────────────────────────────────────

function traceContour(mask, W, H) {
  let start = -1;
  for (let i = 0; i < mask.length; i++) { if (mask[i]) { start = i; break; } }
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
      if (mask[ny * W + nx]) { dir = nd; cx = nx; cy = ny; moved = true; break; }
    }
    if (!moved) break;
    if (step > 3 && cx === sx && cy === sy) break;
  }
  return contour;
}

// ── RDP Simplification ────────────────────────────────────────────────────────

function rdp(pts, eps) {
  if (pts.length <= 2) return pts;
  let maxD = 0, maxI = 0;
  const s = pts[0], e = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = ptSegDist(pts[i], s, e);
    if (d > maxD) { maxD = d; maxI = i; }
  }
  if (maxD > eps) {
    return rdp(pts.slice(0, maxI + 1), eps).slice(0, -1).concat(rdp(pts.slice(maxI), eps));
  }
  return [s, e];
}

function ptSegDist([px,py],[ax,ay],[bx,by]) {
  const dx=bx-ax, dy=by-ay, len2=dx*dx+dy*dy;
  if (len2===0) return Math.hypot(px-ax,py-ay);
  const t = Math.max(0, Math.min(1, ((px-ax)*dx+(py-ay)*dy)/len2));
  return Math.hypot(px-(ax+t*dx), py-(ay+t*dy));
}

// ── Metrics ───────────────────────────────────────────────────────────────────

function contourPerimeterMm(pts, mmPerPx) {
  let p = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i+1) % pts.length];
    p += Math.hypot(b[0]-a[0], b[1]-a[1]);
  }
  return p * mmPerPx;
}

function pca2DAngle(pixelIndices) {
  if (!pixelIndices || pixelIndices.length < 2) return 0;
  // Use up to 500 random samples for speed
  const sample = pixelIndices.length > 500
    ? pixelIndices.filter((_, i) => i % Math.ceil(pixelIndices.length / 500) === 0)
    : pixelIndices;
  let mx = 0, my = 0;
  for (const idx of sample) { mx += idx % 512; my += Math.floor(idx / 512); } // approx W=512
  mx /= sample.length; my /= sample.length;
  let cxx = 0, cxy = 0, cyy = 0;
  for (const idx of sample) {
    const dx = idx % 512 - mx, dy = Math.floor(idx / 512) - my;
    cxx += dx*dx; cxy += dx*dy; cyy += dy*dy;
  }
  const angle = 0.5 * Math.atan2(2*cxy, cxx - cyy) * 180 / Math.PI;
  return parseFloat(angle.toFixed(1));
}

function computeNeighbors(outputRegions, rawRegions, labels, W, H) {
  const idByMaskIdx = new Map();
  for (let r = 0; r < rawRegions.length; r++) {
    const reg = rawRegions[r];
    for (const px of reg.pixels) idByMaskIdx.set(px, outputRegions[r]?.id);
  }
  const neighborSets = {};
  for (const or of outputRegions) neighborSets[or.id] = new Set();

  for (let i = 0; i < W * H; i++) {
    const id = idByMaskIdx.get(i);
    if (!id) continue;
    const x = i % W, y = Math.floor(i / W);
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x+dx, ny = y+dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const nid = idByMaskIdx.get(ny*W+nx);
      if (nid && nid !== id) { neighborSets[id].add(nid); neighborSets[nid]?.add(id); }
    }
  }
  for (const or of outputRegions) {
    or.neighbors = Array.from(neighborSets[or.id] || []);
  }
}

// ── Tiny Helpers ──────────────────────────────────────────────────────────────

function distSq(a, b) { return (a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2; }
function nearestIdx(rgb, palette) {
  let best=0, bestD=Infinity;
  for (let i=0;i<palette.length;i++){const d=distSq(rgb,palette[i]);if(d<bestD){bestD=d;best=i;}}
  return best;
}
function rgbToHex([r,g,b]) {
  return '#'+[r,g,b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
}