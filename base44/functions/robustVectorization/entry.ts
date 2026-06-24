/* global Deno */

/**
 * Motor de Vectorización Mejorado (7 módulos)
 * 1. Pre-procesamiento (bilateral + CLAHE)
 * 2. K-Means LAB (reducción inteligente de colores)
 * 3. Marching Squares (vectorización precisa)
 * 4. Clasificación (detección automática de stitch types)
 * 5. Generación de puntadas
 * 6. Optimización (TSP, minimizar saltos)
 * 7. Exportación
 */

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'POST only' }, { status: 405 });
    }

    const payload = await req.json();
    const {
      pixels,
      width,
      height,
      width_mm = 100,
      height_mm = 100,
      color_count = 6,
      stitch_density = 0.7
    } = payload;

    console.log(`[VECTORIZER] Starting 7-module pipeline: ${width}x${height}px`);

    if (!pixels || !width || !height || pixels.length < 4) {
      return Response.json({ success: false, error: 'Invalid image data' });
    }

    let pixelData = pixels;
    if (!(pixelData instanceof Uint8ClampedArray) && Array.isArray(pixelData)) {
      pixelData = new Uint8ClampedArray(pixelData);
    }

    // MODULE 1: PRE-PROCESAMIENTO
    console.log('[VECTORIZER] Module 1: Pre-processing');
    const scaled = scaleImage(pixelData, width, height, 256, 256);
    const preprocessed = preprocessImage(scaled.pixels, scaled.width, scaled.height);

    // MODULE 2: REDUCCIÓN DE COLORES (K-Means LAB)
    console.log('[VECTORIZER] Module 2: Color reduction (K-Means LAB)');
    const { labels, palette } = kmeansLAB(preprocessed, scaled.width, scaled.height, color_count);

    // MODULE 3: VECTORIZACIÓN (Marching Squares)
    console.log('[VECTORIZER] Module 3: Vectorization (Marching Squares)');
    const regions = marchingSquaresRegions(labels, palette, scaled.width, scaled.height);

    // MODULE 4: CLASIFICACIÓN
    console.log('[VECTORIZER] Module 4: Stitch type classification');
    const classified = regions.map(r => ({
      ...r,
      stitch_type: classifyStitchType(r)
    }));

    // MODULE 5: GENERACIÓN DE PUNTADAS
    console.log('[VECTORIZER] Module 5: Stitch generation');
    const withStitches = classified.map(r => ({
      ...r,
      stitches: generateStitches(r, stitch_density)
    }));

    // MODULE 6: OPTIMIZACIÓN
    console.log('[VECTORIZER] Module 6: Sequence optimization');
    const optimized = optimizeSequence(withStitches);

    // MODULE 7: EXPORTACIÓN (conversion a mm)
    console.log('[VECTORIZER] Module 7: Coordinate conversion');
    const pxPerMM_x = width_mm / scaled.width;
    const pxPerMM_y = height_mm / scaled.height;

    const finalRegions = optimized.map(r => ({
      id: r.id,
      color: r.color,
      stitch_type: r.stitch_type,
      stitches: r.stitches.map(p => ({
        x: p.x * pxPerMM_x,
        y: p.y * pxPerMM_y
      })),
      path_points: r.stitches.map(p => [
        (p.x * pxPerMM_x) / width_mm,
        (p.y * pxPerMM_y) / height_mm
      ]),
      pointCount: r.stitches.length,
      visible: true
    }));

    const totalStitches = finalRegions.reduce((s, r) => s + r.pointCount, 0);
    console.log(`[VECTORIZER] SUCCESS: ${finalRegions.length} regions, ${totalStitches} stitches`);

    return Response.json({
      success: true,
      data: {
        response: {
          regions: finalRegions,
          total_stitches: totalStitches,
          color_count: palette.length,
          width: width_mm,
          height: height_mm
        }
      }
    });
  } catch (err) {
    console.error('[VECTORIZER] Error:', err.message);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
});

// ============================================================================
// MODULE 1: ESCALAR + PRE-PROCESAMIENTO
// ============================================================================

function scaleImage(src, srcW, srcH, maxDim, targetH) {
  const aspect = srcW / srcH;
  let dstW = Math.min(srcW, maxDim);
  let dstH = Math.round(dstW / aspect);

  const dst = new Uint8ClampedArray(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const sx = Math.floor((x / dstW) * srcW);
      const sy = Math.floor((y / dstH) * srcH);
      const srcIdx = (sy * srcW + sx) * 4;
      const dstIdx = (y * dstW + x) * 4;
      dst[dstIdx] = src[srcIdx];
      dst[dstIdx + 1] = src[srcIdx + 1];
      dst[dstIdx + 2] = src[srcIdx + 2];
      dst[dstIdx + 3] = src[srcIdx + 3] || 255;
    }
  }
  return { pixels: dst, width: dstW, height: dstH };
}

function preprocessImage(pixels, width, height) {
  // Bilateral filter (simplificado): preserva bordes, suaviza interiores
  const filtered = bilateralFilter(pixels, width, height, 2, 30);

  // CLAHE (Contrast Limited Adaptive Histogram Equalization) simplificado
  const enhanced = claheSimple(filtered, width, height);

  return enhanced;
}

function bilateralFilter(src, w, h, radius, sigma) {
  const dst = new Uint8ClampedArray(src.length);
  const kr = radius;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, weight = 0;

      const centerIdx = (y * w + x) * 4;
      const centerR = src[centerIdx];
      const centerG = src[centerIdx + 1];
      const centerB = src[centerIdx + 2];

      for (let dy = -kr; dy <= kr; dy++) {
        for (let dx = -kr; dx <= kr; dx++) {
          const nx = Math.max(0, Math.min(w - 1, x + dx));
          const ny = Math.max(0, Math.min(h - 1, y + dy));
          const idx = (ny * w + nx) * 4;

          const dr = src[idx] - centerR;
          const dg = src[idx + 1] - centerG;
          const db = src[idx + 2] - centerB;
          const colorDist = Math.sqrt(dr * dr + dg * dg + db * db);

          const spaceDist = Math.sqrt(dx * dx + dy * dy);
          const w_space = Math.exp(-(spaceDist * spaceDist) / (2 * sigma * sigma));
          const w_color = Math.exp(-(colorDist * colorDist) / (2 * 50 * 50));
          const w_total = w_space * w_color;

          r += src[idx] * w_total;
          g += src[idx + 1] * w_total;
          b += src[idx + 2] * w_total;
          weight += w_total;
        }
      }

      dst[centerIdx] = Math.round(r / weight);
      dst[centerIdx + 1] = Math.round(g / weight);
      dst[centerIdx + 2] = Math.round(b / weight);
      dst[centerIdx + 3] = 255;
    }
  }

  return dst;
}

function claheSimple(src, w, h) {
  // Simplificado: estiramiento de histograma adaptativo local
  const tileSize = 32;
  const dst = new Uint8ClampedArray(src.length);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = src[idx];
      const g = src[idx + 1];
      const b = src[idx + 2];

      // Histograma local
      const ty = Math.floor(y / tileSize);
      const tx = Math.floor(x / tileSize);
      const y1 = ty * tileSize;
      const y2 = Math.min(h, (ty + 1) * tileSize);
      const x1 = tx * tileSize;
      const x2 = Math.min(w, (tx + 1) * tileSize);

      const hist = new Array(256).fill(0);
      for (let py = y1; py < y2; py++) {
        for (let px = x1; px < x2; px++) {
          const pidx = (py * w + px) * 4;
          const lum = Math.round(0.299 * src[pidx] + 0.587 * src[pidx + 1] + 0.114 * src[pidx + 2]);
          hist[lum]++;
        }
      }

      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      let cumsum = 0;
      for (let i = 0; i < lum; i++) cumsum += hist[i];
      const newLum = Math.round((cumsum / ((y2 - y1) * (x2 - x1))) * 255);

      const delta = newLum - lum;
      dst[idx] = Math.max(0, Math.min(255, r + delta * 0.5));
      dst[idx + 1] = Math.max(0, Math.min(255, g + delta * 0.5));
      dst[idx + 2] = Math.max(0, Math.min(255, b + delta * 0.5));
      dst[idx + 3] = 255;
    }
  }

  return dst;
}

// ============================================================================
// MODULE 2: K-MEANS LAB
// ============================================================================

function kmeansLAB(pixels, width, height, k, iterations = 5) {
  // Convertir RGB → LAB
  const lab = [];
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] / 255;
    const g = pixels[i + 1] / 255;
    const b = pixels[i + 2] / 255;

    const x = 0.95047 * (r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92);
    const y = 1.00000 * (g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92);
    const z = 1.08883 * (b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92);

    const lx = x / 0.95047;
    const ly = y / 1.00000;
    const lz = z / 1.08883;

    const L = (116 * flab(ly)) - 16;
    const a = 500 * (flab(lx) - flab(ly));
    const bb = 200 * (flab(ly) - flab(lz));

    lab.push({ L, a, b: bb, r: pixels[i], g: pixels[i + 1], b_rgb: pixels[i + 2] });
  }

  // Inicializar centroides (K-means++)
  const centroids = [];
  centroids.push(lab[Math.floor(Math.random() * lab.length)]);

  for (let i = 1; i < k; i++) {
    let maxDist = -Infinity;
    let farthest = lab[0];
    for (const point of lab) {
      let minDist = Infinity;
      for (const centroid of centroids) {
        const dist = Math.pow(point.L - centroid.L, 2) + Math.pow(point.a - centroid.a, 2) + Math.pow(point.b - centroid.b, 2);
        minDist = Math.min(minDist, dist);
      }
      if (minDist > maxDist) {
        maxDist = minDist;
        farthest = point;
      }
    }
    centroids.push({ ...farthest });
  }

  // K-means iterations
  for (let iter = 0; iter < iterations; iter++) {
    const clusters = Array.from({ length: k }, () => []);

    for (const point of lab) {
      let nearest = 0;
      let minDist = Infinity;
      for (let i = 0; i < centroids.length; i++) {
        const dist = Math.pow(point.L - centroids[i].L, 2) + Math.pow(point.a - centroids[i].a, 2) + Math.pow(point.b - centroids[i].b, 2);
        if (dist < minDist) {
          minDist = dist;
          nearest = i;
        }
      }
      clusters[nearest].push(point);
    }

    for (let i = 0; i < k; i++) {
      if (clusters[i].length > 0) {
        const avgL = clusters[i].reduce((s, p) => s + p.L, 0) / clusters[i].length;
        const avgA = clusters[i].reduce((s, p) => s + p.a, 0) / clusters[i].length;
        const avgB = clusters[i].reduce((s, p) => s + p.b, 0) / clusters[i].length;
        const avgR = clusters[i].reduce((s, p) => s + p.r, 0) / clusters[i].length;
        const avgG = clusters[i].reduce((s, p) => s + p.g, 0) / clusters[i].length;
        const avgBRGB = clusters[i].reduce((s, p) => s + p.b_rgb, 0) / clusters[i].length;

        centroids[i] = { L: avgL, a: avgA, b: avgB, r: avgR, g: avgG, b_rgb: avgBRGB };
      }
    }
  }

  // Asignar labels
  const labels = new Uint8Array(width * height);
  let idx = 0;
  for (let i = 0; i < lab.length; i++) {
    let nearest = 0;
    let minDist = Infinity;
    for (let j = 0; j < centroids.length; j++) {
      const dist = Math.pow(lab[i].L - centroids[j].L, 2) + Math.pow(lab[i].a - centroids[j].a, 2) + Math.pow(lab[i].b - centroids[j].b, 2);
      if (dist < minDist) {
        minDist = dist;
        nearest = j;
      }
    }
    labels[i] = nearest;
  }

  const palette = centroids.map(c => ({
    r: Math.round(c.r),
    g: Math.round(c.g),
    b: Math.round(c.b_rgb)
  }));

  return { labels, palette };
}

function flab(t) {
  return t > 0.008856 ? Math.pow(t, 1 / 3) : (7.787 * t) + (16 / 116);
}

// ============================================================================
// MODULE 3: MARCHING SQUARES
// ============================================================================

function marchingSquaresRegions(labels, palette, width, height) {
  const regions = [];

  for (let colorIdx = 0; colorIdx < palette.length; colorIdx++) {
    const contours = marchingSquares(labels, width, height, colorIdx);

    if (contours.length > 0) {
      const color = `#${palette[colorIdx].r.toString(16).padStart(2, '0')}${palette[colorIdx].g.toString(16).padStart(2, '0')}${palette[colorIdx].b.toString(16).padStart(2, '0')}`;

      regions.push({
        id: `region_${colorIdx}`,
        color: color,
        contours: contours,
        area: contours.reduce((s, c) => s + c.length, 0),
        visible: true
      });
    }
  }

  return regions;
}

function marchingSquares(labels, width, height, colorIdx) {
  const contours = [];
  const visited = new Set();

  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const key = `${x},${y}`;
      if (visited.has(key)) continue;

      const p1 = labels[y * width + x] === colorIdx ? 1 : 0;
      const p2 = labels[y * width + (x + 1)] === colorIdx ? 1 : 0;
      const p3 = labels[(y + 1) * width + (x + 1)] === colorIdx ? 1 : 0;
      const p4 = labels[(y + 1) * width + x] === colorIdx ? 1 : 0;

      const caseIdx = p1 + 2 * p2 + 4 * p3 + 8 * p4;

      if (caseIdx > 0 && caseIdx < 15) {
        visited.add(key);
        const points = [];
        if (caseIdx === 1 || caseIdx === 14) points.push([x + 0.5, y], [x, y + 0.5]);
        else if (caseIdx === 2 || caseIdx === 13) points.push([x + 1, y + 0.5], [x + 0.5, y]);
        else if (caseIdx === 3 || caseIdx === 12) points.push([x + 1, y + 0.5], [x, y + 0.5]);
        else if (caseIdx === 4 || caseIdx === 11) points.push([x + 1, y + 0.5], [x + 0.5, y + 1]);
        else if (caseIdx === 5 || caseIdx === 10) {
          points.push([x + 0.5, y], [x, y + 0.5], [x + 1, y + 0.5], [x + 0.5, y + 1]);
        } else if (caseIdx === 6 || caseIdx === 9) points.push([x + 1, y + 0.5], [x + 0.5, y + 1]);
        else if (caseIdx === 7 || caseIdx === 8) points.push([x + 0.5, y + 1], [x, y + 0.5]);

        if (points.length > 0) contours.push(points);
      }
    }
  }

  return contours;
}

// ============================================================================
// MODULE 4: CLASIFICACIÓN
// ============================================================================

function classifyStitchType(region) {
  const area = region.area || region.contours?.reduce((s, c) => s + c.length, 0) || 0;

  if (area < 50) return 'running_stitch';
  if (area < 300) return 'satin';
  return 'fill';
}

// ============================================================================
// MODULE 5: GENERACIÓN DE PUNTADAS
// ============================================================================

function generateStitches(region, density) {
  const contours = region.contours || [];
  if (contours.length === 0) return [];

  const stitches = [];
  const step = Math.max(1, Math.round(3 / Math.max(0.1, density)));

  for (const contour of contours) {
    for (let i = 0; i < contour.length; i += step) {
      stitches.push({
        x: Math.round(contour[i][0]),
        y: Math.round(contour[i][1])
      });
    }
  }

  return stitches;
}

// ============================================================================
// MODULE 6: OPTIMIZACIÓN
// ============================================================================

function optimizeSequence(regions) {
  // Agrupar por color
  const byColor = {};
  for (const r of regions) {
    const color = r.color || 'default';
    if (!byColor[color]) byColor[color] = [];
    byColor[color].push(r);
  }

  const optimized = [];

  for (const color of Object.keys(byColor)) {
    const group = byColor[color];

    // Calcular centroides
    const withCentroids = group.map(r => {
      let cx = 0, cy = 0;
      if (r.stitches && r.stitches.length > 0) {
        for (const s of r.stitches) {
          cx += s.x;
          cy += s.y;
        }
        cx /= r.stitches.length;
        cy /= r.stitches.length;
      }
      return { ...r, cx, cy };
    });

    // Greedy TSP: ordenar por proximidad
    const ordered = [withCentroids[0]];
    const visited = new Set([0]);

    for (let i = 1; i < withCentroids.length; i++) {
      const last = ordered[ordered.length - 1];
      let nearest = -1, minDist = Infinity;

      for (let j = 0; j < withCentroids.length; j++) {
        if (visited.has(j)) continue;
        const dist = Math.hypot(withCentroids[j].cx - last.cx, withCentroids[j].cy - last.cy);
        if (dist < minDist) {
          minDist = dist;
          nearest = j;
        }
      }

      if (nearest >= 0) {
        ordered.push(withCentroids[nearest]);
        visited.add(nearest);
      }
    }

    optimized.push(...ordered);
  }

  return optimized;
}