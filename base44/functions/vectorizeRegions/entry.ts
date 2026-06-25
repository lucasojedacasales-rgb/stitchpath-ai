import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { 
      imageUrl, 
      colorClusters = 8, 
      edgeThreshold = 0.3, 
      minRegionArea = 2,
      tatamiDensity = 0.4,
      tatamiStitchLength = 2.5,
      tatamiAngle = 45,
      contourSatinWidth = 0.8,
      rdpEpsilon = 0.2
    } = await req.json();
    
    if (!imageUrl) return Response.json({ error: 'imageUrl required' }, { status: 400 });

    const startMs = Date.now();

    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) return Response.json({ error: 'Could not fetch image' }, { status: 400 });
    
    const arrayBuffer = await imgResp.arrayBuffer();
    const { Jimp } = await import('npm:jimp@1.6.0');
    const image = await Jimp.fromBuffer(Buffer.from(arrayBuffer));

    const origW = image.width;
    const origH = image.height;

    const scale = Math.min(512 / origW, 512 / origH, 1);
    const W = Math.round(origW * scale);
    const H = Math.round(origH * scale);
    
    image.resize({ w: W, h: H });

    const rgba = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const pixelData = image.getPixelColor(x, y);
        const i = (y * W + x) * 4;
        rgba[i]     = (pixelData >>> 24) & 0xff;
        rgba[i + 1] = (pixelData >>> 16) & 0xff;
        rgba[i + 2] = (pixelData >>> 8)  & 0xff;
        rgba[i + 3] = pixelData & 0xff;
      }
    }

    const mmPerPx = 100 / origW / scale;

    // ── 2. Edge detection with adaptive thresholds ─────────────────────────────
    const gray = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const r = rgba[i*4], g = rgba[i*4+1], b = rgba[i*4+2];
      gray[i] = 0.299*r + 0.587*g + 0.114*b;
    }

    const blurred = gaussianBlur(gray, W, H);
    const { gx, gy, mag } = sobelGradients(blurred, W, H);

    let sum = 0, sum2 = 0;
    for (let i = 0; i < mag.length; i++) { sum += mag[i]; sum2 += mag[i]*mag[i]; }
    const mean = sum / mag.length;
    const stddev = Math.sqrt(sum2 / mag.length - mean * mean);
    const highT = edgeThreshold * (mean + 2 * stddev);
    const lowT  = highT * 0.4;
    const edges = cannyNMS(mag, gx, gy, W, H, lowT, highT);

    // ── 3. K-means++ clustering en espacio LAB ─────────────────────────────────
    const k = Math.max(3, Math.min(colorClusters, 20));
    const samples = [];
    for (let i = 0; i < W * H; i++) {
      if (rgba[i*4+3] < 128) continue;
      const r = rgba[i*4], g = rgba[i*4+1], b = rgba[i*4+2];
      const lab = rgbToLab(r, g, b);
      samples.push({ 
        idx: i, 
        rgb: [r, g, b], 
        lab: lab,
        isEdge: edges[i] > 0 
      });
    }

    const nonEdge = samples.filter(s => !s.isEdge);
    const seed = nonEdge.length > 0 ? nonEdge : samples;
    if (seed.length === 0) return Response.json({ error: 'No foreground pixels' }, { status: 400 });
    
    // Centroides en LAB para clustering
    let centroidsLab = [seed[Math.floor(Math.random() * seed.length)].lab];
    let centroidsRgb = [seed[Math.floor(Math.random() * seed.length)].rgb];
    
    while (centroidsLab.length < k) {
      const dists = samples.map(s => Math.min(...centroidsLab.map(c => distSqLab(s.lab, c))));
      const total = dists.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      for (let i = 0; i < dists.length; i++) {
        r -= dists[i];
        if (r <= 0) { 
          centroidsLab.push([...samples[i].lab]); 
          centroidsRgb.push([...samples[i].rgb]);
          break; 
        }
      }
      if (centroidsLab.length < k) {
        centroidsLab.push([...seed[seed.length - 1].lab]);
        centroidsRgb.push([...seed[seed.length - 1].rgb]);
      }
    }

    const labels = new Int32Array(W * H).fill(-1);
    for (let iter = 0; iter < 20; iter++) {
      const sums = centroidsLab.map(() => [0, 0, 0, 0]);
      for (const s of samples) {
        const ci = nearestIdxLab(s.lab, centroidsLab);
        labels[s.idx] = ci;
        if (!s.isEdge) {
          sums[ci][0] += s.rgb[0]; sums[ci][1] += s.rgb[1]; sums[ci][2] += s.rgb[2]; sums[ci][3]++;
        }
      }
      for (let ci = 0; ci < k; ci++) {
        const cnt = sums[ci][3];
        if (cnt > 0) {
          centroidsRgb[ci] = [sums[ci][0]/cnt, sums[ci][1]/cnt, sums[ci][2]/cnt];
          centroidsLab[ci] = rgbToLab(sums[ci][0]/cnt, sums[ci][1]/cnt, sums[ci][2]/cnt);
        }
      }
    }

    for (let i = 0; i < W * H; i++) {
      if (edges[i] > 0) labels[i] = -1;
    }

    // ── 4. Flood fill regions ───────────────────────────────────────────────────
    const minPx = Math.max(2, Math.round(minRegionArea / (mmPerPx * mmPerPx)));
    const regions = floodFillRegions(labels, W, H, k, minPx, mmPerPx, rgba, centroidsRgb);

    // ── 5. Detectar contorno externo del diseño completo ────────────────────────
    const designContour = traceDesignContour(labels, W, H);

    // ── 6. Procesar cada región ─────────────────────────────────────────────────
    const outputRegions = [];

    for (const reg of regions) {
      const contour = traceContour(reg.mask, W, H);
      if (contour.length < 3) continue;

      const bbox = reg.bbox;
      const bboxW = bbox.maxX - bbox.minX;
      const bboxH = bbox.maxY - bbox.minY;
      const regionAspect = bboxW / Math.max(1, bboxH);
      const isValidShape = regionAspect >= 0.2 && regionAspect <= 5.0;
      if (!isValidShape) continue;

      let epsilon = rdpEpsilon / mmPerPx;
      let simplified = rdp(contour, epsilon);
      
      if (simplified.length < 10 && contour.length > 20) {
        epsilon = (rdpEpsilon * 0.5) / mmPerPx;
        simplified = rdp(contour, epsilon);
      }

      if (simplified.length < 4) continue;

      const polygon = simplified.map(([x, y]) => [
        parseFloat(((x - W/2) * mmPerPx).toFixed(4)),
        parseFloat(((y - H/2) * mmPerPx).toFixed(4)),
      ]);

      const areaMm2 = reg.pixelCount * mmPerPx * mmPerPx;
      const perimeterMm = contourPerimeterMm(simplified, mmPerPx);

      const isExternalBorder = isRegionOnDesignBorder(reg, designContour, W, H);

      const isLargeRegion = areaMm2 > 25;
      const isThinRegion = (bboxW < 15 || bboxH < 15) && perimeterMm > 20;
      
      let type;
      let stitches = [];
      let contourStitches = [];
      
      if (isLargeRegion && !isThinRegion) {
        type = 'fill';
        const regionAngle = computeOptimalFillAngle(reg.mask, W, H);
        stitches = generateTatamiFill(polygon, tatamiDensity, tatamiStitchLength, regionAngle);
        
        if (isExternalBorder) {
          contourStitches = generateSatinContour(polygon, contourSatinWidth, mmPerPx);
        } else {
          contourStitches = generateRunContour(polygon, 0.5, mmPerPx);
        }
      } else if (isThinRegion || (perimeterMm > 30 && areaMm2 < 50)) {
        type = 'satin';
        stitches = generateSatinStitches(polygon, 0.3, mmPerPx);
        contourStitches = stitches;
      } else {
        type = 'run';
        stitches = polygon.map(p => [p[0], p[1]]);
        contourStitches = stitches;
      }

      outputRegions.push({
        id: reg.id,
        color: reg.hex,
        type: type,
        path_points: polygon,
        stitches: stitches,
        contour_stitches: contourStitches,
        is_external_border: isExternalBorder,
        stitch_count: stitches.length,
        area_mm2: parseFloat(areaMm2.toFixed(2)),
        perimeter_mm: parseFloat(perimeterMm.toFixed(2)),
        centroid: [
          parseFloat(((reg.centroid[0] - W/2) * mmPerPx).toFixed(4)),
          parseFloat(((reg.centroid[1] - H/2) * mmPerPx).toFixed(4)),
        ],
        coverage: areaMm2 / (100 * 100),
      });
    }

    if (designContour && designContour.length > 3) {
      const designPolygon = designContour.map(([x, y]) => [
        parseFloat(((x - W/2) * mmPerPx).toFixed(4)),
        parseFloat(((y - H/2) * mmPerPx).toFixed(4)),
      ]);
      
      outputRegions.unshift({
        id: 'design_border',
        color: '#000000',
        type: 'border',
        path_points: designPolygon,
        stitches: generateSatinContour(designPolygon, contourSatinWidth, mmPerPx),
        contour_stitches: generateSatinContour(designPolygon, contourSatinWidth, mmPerPx),
        is_external_border: true,
        stitch_count: 0,
        area_mm2: 0,
        perimeter_mm: contourPerimeterMm(designContour, mmPerPx),
        centroid: [0, 0],
        coverage: 0,
      });
    }

    return Response.json({
      regions: outputRegions,
      metadata: {
        totalRegions: outputRegions.length,
        processingTimeMs: Date.now() - startMs,
      }
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// NUEVAS FUNCIONES DE CONTORNO
// ═══════════════════════════════════════════════════════════════════════════

function traceDesignContour(labels, W, H) {
  const visited = new Uint8Array(W * H);
  const contour = [];
  
  let start = -1;
  for (let i = 0; i < W * H; i++) {
    if (labels[i] !== -1) { start = i; break; }
  }
  if (start === -1) return [];
  
  const stack = [start];
  const designPixels = new Set();
  
  while (stack.length > 0) {
    const idx = stack.pop();
    if (visited[idx] || labels[idx] === -1) continue;
    visited[idx] = 1;
    designPixels.add(idx);
    
    const x = idx % W, y = Math.floor(idx / W);
    const neighbors = [
      idx - 1, idx + 1, idx - W, idx + W,
      idx - W - 1, idx - W + 1, idx + W - 1, idx + W + 1
    ];
    
    for (const n of neighbors) {
      const nx = n % W, ny = Math.floor(n / W);
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && !visited[n]) {
        stack.push(n);
      }
    }
  }
  
  const borderPixels = [];
  for (const idx of designPixels) {
    const x = idx % W, y = Math.floor(idx / W);
    const neighbors = [idx - 1, idx + 1, idx - W, idx + W];
    let isBorder = false;
    
    for (const n of neighbors) {
      const nx = n % W, ny = Math.floor(n / W);
      if (nx < 0 || nx >= W || ny < 0 || ny >= H || labels[n] === -1) {
        isBorder = true;
        break;
      }
    }
    
    if (isBorder) borderPixels.push([x, y]);
  }
  
  if (borderPixels.length === 0) return [];
  return rdp(borderPixels, 1.0);
}

function isRegionOnDesignBorder(region, designContour, W, H) {
  if (!designContour || designContour.length === 0) return false;
  
  const { bbox } = region;
  const margin = 5;
  
  const touchesLeft = bbox.minX <= margin;
  const touchesRight = bbox.maxX >= W - margin;
  const touchesTop = bbox.minY <= margin;
  const touchesBottom = bbox.maxY >= H - margin;
  
  return touchesLeft || touchesRight || touchesTop || touchesBottom;
}

function generateSatinContour(polygon, width, mmPerPx) {
  const stitches = [];
  const baseHalfWidth = width / 2;
  
  let totalLength = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    totalLength += Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  }
  
  const density = Math.max(0.15, Math.min(0.4, totalLength / 200));
  let previousSide = 1;
  
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const segLen = Math.hypot(dx, dy);
    
    if (segLen < 0.01) continue;
    
    const perpX = -dy / segLen;
    const perpY = dx / segLen;
    
    const curvature = estimateCurvature(polygon, i);
    const adaptiveWidth = baseHalfWidth * (0.6 + 0.4 * (1 - curvature));
    
    const steps = Math.max(4, Math.floor(segLen / density));
    
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      const baseX = p1[0] + dx * t;
      const baseY = p1[1] + dy * t;
      
      const side = (j % 2 === 0) ? 1 : -1;
      const smoothSide = side * previousSide;
      
      stitches.push([
        baseX + perpX * adaptiveWidth * smoothSide,
        baseY + perpY * adaptiveWidth * smoothSide
      ]);
    }
    
    previousSide *= -1;
  }
  
  return stitches;
}

function estimateCurvature(polygon, idx) {
  const n = polygon.length;
  const prev = polygon[(idx - 1 + n) % n];
  const curr = polygon[idx];
  const next = polygon[(idx + 1) % n];
  
  const dx1 = curr[0] - prev[0];
  const dy1 = curr[1] - prev[1];
  const len1 = Math.hypot(dx1, dy1);
  
  const dx2 = next[0] - curr[0];
  const dy2 = next[1] - curr[1];
  const len2 = Math.hypot(dx2, dy2);
  
  if (len1 < 0.001 || len2 < 0.001) return 0;
  
  const cross = Math.abs(dx1 * dy2 - dy1 * dx2) / (len1 * len2);
  
  return Math.min(1, cross);
}

function generateRunContour(polygon, spacing, mmPerPx) {
  const stitches = [];
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const len = Math.sqrt(dx*dx + dy*dy);
    const steps = Math.max(1, Math.floor(len / spacing));
    
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      stitches.push([p1[0] + dx * t, p1[1] + dy * t]);
    }
  }
  return stitches;
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES TATAMI
// ═══════════════════════════════════════════════════════════════════════════

function generateTatamiFill(polygon, density = 0.4, stitchLength = 2.5, angleDeg = 45) {
  if (!polygon || polygon.length < 3) return [];
  
  const angle = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  
  const rotate = (p) => [p[0] * cos + p[1] * sin, -p[0] * sin + p[1] * cos];
  const unrotate = (p) => [p[0] * cos - p[1] * sin, p[0] * sin + p[1] * cos];
  
  const rotatedPolygon = polygon.map(rotate);
  
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  
  for (const p of rotatedPolygon) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  
  const stitches = [];
  const offsets = [0, 0.25, 0.5, 0.75];
  let rowIndex = 0;
  
  for (let y = minY; y <= maxY; y += density) {
    const intersections = [];
    
    for (let i = 0; i < rotatedPolygon.length; i++) {
      const p1 = rotatedPolygon[i];
      const p2 = rotatedPolygon[(i + 1) % rotatedPolygon.length];
      
      if ((p1[1] <= y && p2[1] > y) || (p2[1] <= y && p1[1] > y)) {
        const t = (y - p1[1]) / (p2[1] - p1[1]);
        const x = p1[0] + t * (p2[0] - p1[0]);
        intersections.push(x);
      }
    }
    
    intersections.sort((a, b) => a - b);
    
    const offset = offsets[rowIndex % 4] * stitchLength;
    const reverse = (rowIndex % 2 === 1);
    
    for (let i = 0; i < intersections.length - 1; i += 2) {
      let xStart = intersections[i] + offset;
      let xEnd = intersections[i + 1];
      
      if (xStart >= xEnd) continue;
      
      const segmentLength = xEnd - xStart;
      const numStitches = Math.max(1, Math.floor(segmentLength / stitchLength));
      
      if (reverse) {
        for (let j = numStitches; j >= 0; j--) {
          const x = Math.min(xStart + j * stitchLength, xEnd);
          stitches.push(unrotate([x, y]));
        }
      } else {
        for (let j = 0; j <= numStitches; j++) {
          const x = Math.min(xStart + j * stitchLength, xEnd);
          stitches.push(unrotate([x, y]));
        }
      }
    }
    
    rowIndex++;
  }
  
  return stitches;
}

function generateSatinStitches(polygon, density = 0.3, mmPerPx) {
  const stitches = [];
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const len = Math.sqrt(dx*dx + dy*dy);
    const steps = Math.max(1, Math.floor(len / density));
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      stitches.push([p1[0] + dx * t, p1[1] + dy * t]);
    }
  }
  return stitches;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS ORIGINALES
// ═══════════════════════════════════════════════════════════════════════════

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
      if (a < 22.5 || a >= 157.5)  { n1 = mag[i-1]; n2 = mag[i+1]; }
      else if (a < 67.5)           { n1 = mag[(y-1)*W+x+1]; n2 = mag[(y+1)*W+x-1]; }
      else if (a < 112.5)          { n1 = mag[(y-1)*W+x]; n2 = mag[(y+1)*W+x]; }
      else                         { n1 = mag[(y-1)*W+x-1]; n2 = mag[(y+1)*W+x+1]; }
      if (mag[i] >= n1 && mag[i] >= n2 && mag[i] >= highT) nms[i] = mag[i];
    }
  }
  return nms;
}

function floodFillRegions(labels, W, H, k, minPx, mmPerPx, rgba, centroids) {
  const regions = [];
  let nextId = 0;
  for (let ci = 0; ci < k; ci++) {
    const visited = new Uint8Array(W * H);
    for (let start = 0; start < W * H; start++) {
      if (labels[start] !== ci || visited[start]) continue;
      const stack = [start];
      const pixelList = [];
      let minX = W, maxX = 0, minY = H, maxY = 0, sx = 0, sy = 0;
      while (stack.length > 0) {
        const idx = stack.pop();
        if (visited[idx] || labels[idx] !== ci) continue;
        visited[idx] = 1;
        pixelList.push(idx);
        const x = idx % W, y = Math.floor(idx / W);
        sx += x; sy += y;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (x > 0) stack.push(idx - 1);
        if (x < W-1) stack.push(idx + 1);
        if (y > 0) stack.push(idx - W);
        if (y < H-1) stack.push(idx + W);
      }
      if (pixelList.length < minPx) continue;
      const mask = new Uint8Array(W * H);
      for (const px of pixelList) mask[px] = 1;
      regions.push({
        id: `region_${String(nextId + 1).padStart(3, '0')}`,
        colorIdx: ci, hex: rgbToHex(centroids[ci]),
        mask, pixels: pixelList, pixelCount: pixelList.length,
        centroid: [sx / pixelList.length, sy / pixelList.length],
        bbox: { minX, maxX, minY, maxY },
      });
      nextId++;
    }
  }
  return regions;
}

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

function rdp(pts, eps) {
  if (pts.length <= 2) return pts;
  const result = new Uint8Array(pts.length);
  result[0] = 1;
  result[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop();
    let maxD = 0, maxI = start;
    for (let i = start + 1; i < end; i++) {
      const d = ptSegDist(pts[i], pts[start], pts[end]);
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > eps) {
      result[maxI] = 1;
      stack.push([start, maxI]);
      stack.push([maxI, end]);
    }
  }
  return pts.filter((_, i) => result[i]);
}

function ptSegDist([px,py],[ax,ay],[bx,by]) {
  const dx=bx-ax, dy=by-ay, len2=dx*dx+dy*dy;
  if (len2===0) return Math.hypot(px-ax,py-ay);
  const t = Math.max(0, Math.min(1, ((px-ax)*dx+(py-ay)*dy)/len2));
  return Math.hypot(px-(ax+t*dx), py-(ay+t*dy));
}

function contourPerimeterMm(pts, mmPerPx) {
  let p = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i+1) % pts.length];
    p += Math.hypot(b[0]-a[0], b[1]-a[1]);
  }
  return p * mmPerPx;
}

function distSq(a, b) { return (a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2; }
function nearestIdx(rgb, palette) {
  let best=0, bestD=Infinity;
  for (let i=0;i<palette.length;i++){const d=distSq(rgb,palette[i]);if(d<bestD){bestD=d;best=i;}}
  return best;
}

function rgbToHex([r,g,b]) {
  return '#'+[r,g,b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
}

function computeOptimalFillAngle(mask, W, H) {
  const pixels = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) {
      pixels.push({ x: i % W, y: Math.floor(i / W) });
    }
  }
  
  if (pixels.length < 2) return 45;
  
  let cx = 0, cy = 0;
  for (const p of pixels) { cx += p.x; cy += p.y; }
  cx /= pixels.length;
  cy /= pixels.length;
  
  let mu20 = 0, mu02 = 0, mu11 = 0;
  for (const p of pixels) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    mu20 += dx * dx;
    mu02 += dy * dy;
    mu11 += dx * dy;
  }
  
  const theta = 0.5 * Math.atan2(2 * mu11, mu20 - mu02);
  
  let fillAngle = (theta * 180 / Math.PI) + 90;
  
  fillAngle = fillAngle % 180;
  if (fillAngle < 0) fillAngle += 180;
  
  const snapped = Math.round(fillAngle / 15) * 15;
  
  return snapped;
}

function rgbToLab(r, g, b) {
  let rNorm = r / 255;
  let gNorm = g / 255;
  let bNorm = b / 255;

  rNorm = rNorm > 0.04045 ? Math.pow((rNorm + 0.055) / 1.055, 2.4) : rNorm / 12.92;
  gNorm = gNorm > 0.04045 ? Math.pow((gNorm + 0.055) / 1.055, 2.4) : gNorm / 12.92;
  bNorm = bNorm > 0.04045 ? Math.pow((bNorm + 0.055) / 1.055, 2.4) : bNorm / 12.92;

  let x = (rNorm * 0.4124564 + gNorm * 0.3575761 + bNorm * 0.1804375) / 0.95047;
  let y = (rNorm * 0.2126729 + gNorm * 0.7151522 + bNorm * 0.0721750) / 1.00000;
  let z = (rNorm * 0.0193339 + gNorm * 0.1191920 + bNorm * 0.9503041) / 1.08883;

  x = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x + 16/116);
  y = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y + 16/116);
  z = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z + 16/116);

  return [(116 * y) - 16, 500 * (x - y), 200 * (y - z)];
}

function distSqLab(a, b) {
  const dL = (a[0]-b[0]) * 1.5;
  const da = a[1]-b[1];
  const db = a[2]-b[2];
  return dL*dL + da*da + db*db;
}

function nearestIdxLab(lab, palette) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const d = distSqLab(lab, palette[i]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
