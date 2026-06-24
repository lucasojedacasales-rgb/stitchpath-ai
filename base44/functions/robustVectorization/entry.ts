/* global Deno */

/**
 * MOTOR DE VECTORIZACIÓN v3 - ROBUSTO
 * Approach:
 * 1. Escalar imagen inteligentemente
 * 2. Aplicar filtro bilateral para suavizar manteniendo bordes
 * 3. Cuantizar a K colores usando K-means++
 * 4. Para cada color: detectar píxeles conectados (8-conectividad)
 * 5. Para cada región: generar scanlines densos que respeten límites
 * 6. Clasificar stitch types
 * 7. Convertir a unidades físicas
 */

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });

    const payload = await req.json();
    const { pixels, width, height, width_mm = 100, height_mm = 100, color_count = 6, stitch_density = 0.7 } = payload;

    console.log(`[ROBUST_VECTORIZER] Input: ${width}x${height}px, ${color_count} colors, density=${stitch_density}`);

    if (!pixels || width < 2 || height < 2) {
      return Response.json({ success: false, error: 'Invalid image dimensions' });
    }

    let data = pixels;
    if (!(data instanceof Uint8ClampedArray) && Array.isArray(data)) {
      data = new Uint8ClampedArray(data);
    }

    // ────────────────────────────────────────────────────────────────
    // FASE 1: ESCALAR inteligentemente (max 512px)
    // ────────────────────────────────────────────────────────────────
    const scaled = smartScale(data, width, height, 512);
    console.log(`[ROBUST_VECTORIZER] Phase 1: Scaled to ${scaled.w}x${scaled.h}`);

    // ────────────────────────────────────────────────────────────────
    // FASE 2: FILTRO BILATERAL (suaviza sin destruir bordes)
    // ────────────────────────────────────────────────────────────────
    const bilateral = applyBilateralFilter(scaled.data, scaled.w, scaled.h);
    console.log('[ROBUST_VECTORIZER] Phase 2: Bilateral filter applied');

    // ────────────────────────────────────────────────────────────────
    // FASE 3: K-MEANS CLUSTERING
    // ────────────────────────────────────────────────────────────────
    const { quantized, palette } = kmeansClustering(bilateral, scaled.w, scaled.h, Math.min(color_count, 12));
    console.log(`[ROBUST_VECTORIZER] Phase 3: Quantized to ${palette.length} colors`);

    // ────────────────────────────────────────────────────────────────
    // FASE 4: DETECTAR COMPONENTES CONECTADAS (Union-Find)
    // ────────────────────────────────────────────────────────────────
    const components = findConnectedComponents(quantized, scaled.w, scaled.h);
    console.log(`[ROBUST_VECTORIZER] Phase 4: Found ${components.length} connected components`);

    // ────────────────────────────────────────────────────────────────
    // FASE 5: GENERAR SCANLINES POR COMPONENTE
    // ────────────────────────────────────────────────────────────────
    const regions = [];

    for (const comp of components) {
      if (comp.pixels.length < 10) continue; // Ignorar regiones muy pequeñas

      const colorIdx = comp.colorIdx;
      const color = palette[colorIdx];
      const hexColor = `#${Math.round(color.r).toString(16).padStart(2, '0')}${Math.round(color.g).toString(16).padStart(2, '0')}${Math.round(color.b).toString(16).padStart(2, '0')}`;

      // Generar scanlines dentro de esta componente
      const stitches = generateScanlines(comp.pixels, scaled.w, scaled.h, stitch_density);

      if (stitches.length > 3) {
        regions.push({
          id: `region_${regions.length}`,
          color: hexColor,
          stitch_type: classifyStitch(stitches.length),
          stitches: stitches,
          pointCount: stitches.length
        });
      }
    }

    console.log(`[ROBUST_VECTORIZER] Phase 5: Generated ${regions.length} regions with stitches`);

    if (regions.length === 0) {
      throw new Error('No valid regions generated');
    }

    // ────────────────────────────────────────────────────────────────
    // FASE 6: CONVERTIR A UNIDADES FÍSICAS
    // ────────────────────────────────────────────────────────────────
    const pxPerMM_x = width_mm / scaled.w;
    const pxPerMM_y = height_mm / scaled.h;

    const finalRegions = regions.map(r => ({
      id: r.id,
      color: r.color,
      stitch_type: r.stitch_type,
      stitches: r.stitches.map(p => ({ x: p.x * pxPerMM_x, y: p.y * pxPerMM_y })),
      path_points: r.stitches.map(p => [p.x * pxPerMM_x / width_mm, p.y * pxPerMM_y / height_mm]),
      pointCount: r.pointCount,
      visible: true
    }));

    const totalStitches = finalRegions.reduce((s, r) => s + r.pointCount, 0);

    console.log(`[ROBUST_VECTORIZER] ✅ SUCCESS: ${finalRegions.length} regions, ${totalStitches} total stitches`);

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
    console.error('[ROBUST_VECTORIZER] ❌ ERROR:', err.message);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
});

// ============================================================================
// HELPERS
// ============================================================================

function smartScale(data, srcW, srcH, maxDim) {
  const aspect = srcW / srcH;
  let dstW, dstH;

  if (aspect > 1) {
    dstW = Math.min(srcW, maxDim);
    dstH = Math.round(dstW / aspect);
  } else {
    dstH = Math.min(srcH, maxDim);
    dstW = Math.round(dstH * aspect);
  }

  dstW = Math.max(16, dstW);
  dstH = Math.max(16, dstH);

  const dst = new Uint8ClampedArray(dstW * dstH * 4);

  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const sx = Math.floor((x / dstW) * srcW);
      const sy = Math.floor((y / dstH) * srcH);
      const srcIdx = (sy * srcW + sx) * 4;
      const dstIdx = (y * dstW + x) * 4;

      dst[dstIdx] = data[srcIdx];
      dst[dstIdx + 1] = data[srcIdx + 1];
      dst[dstIdx + 2] = data[srcIdx + 2];
      dst[dstIdx + 3] = 255;
    }
  }

  return { data: dst, w: dstW, h: dstH };
}

function applyBilateralFilter(src, w, h) {
  const dst = new Uint8ClampedArray(src.length);
  const sigma_s = 3; // spatial sigma
  const sigma_r = 30; // range sigma

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sumR = 0, sumG = 0, sumB = 0, sumW = 0;
      const centerIdx = (y * w + x) * 4;
      const cR = src[centerIdx];
      const cG = src[centerIdx + 1];
      const cB = src[centerIdx + 2];

      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = Math.max(0, Math.min(w - 1, x + dx));
          const ny = Math.max(0, Math.min(h - 1, y + dy));
          const idx = (ny * w + nx) * 4;

          const nR = src[idx];
          const nG = src[idx + 1];
          const nB = src[idx + 2];

          const dSq = dx * dx + dy * dy;
          const dColor = Math.sqrt((cR - nR) ** 2 + (cG - nG) ** 2 + (cB - nB) ** 2);

          const wS = Math.exp(-dSq / (2 * sigma_s * sigma_s));
          const wR = Math.exp(-dColor * dColor / (2 * sigma_r * sigma_r));
          const w_total = wS * wR;

          sumR += nR * w_total;
          sumG += nG * w_total;
          sumB += nB * w_total;
          sumW += w_total;
        }
      }

      dst[centerIdx] = Math.round(sumR / sumW);
      dst[centerIdx + 1] = Math.round(sumG / sumW);
      dst[centerIdx + 2] = Math.round(sumB / sumW);
      dst[centerIdx + 3] = 255;
    }
  }

  return dst;
}

function kmeansClustering(pixels, w, h, k, iters = 5) {
  // Extraer puntos RGB
  const points = [];
  for (let i = 0; i < pixels.length; i += 4) {
    points.push({
      r: pixels[i],
      g: pixels[i + 1],
      b: pixels[i + 2]
    });
  }

  // K-means++ initialization
  const centroids = [];
  const idx0 = Math.floor(Math.random() * points.length);
  centroids.push({ ...points[idx0] });

  for (let c = 1; c < k && c < points.length; c++) {
    let maxDist = -1, bestIdx = 0;

    for (let i = 0; i < points.length; i++) {
      let minDist = Infinity;

      for (const centroid of centroids) {
        const d = (points[i].r - centroid.r) ** 2 + (points[i].g - centroid.g) ** 2 + (points[i].b - centroid.b) ** 2;
        minDist = Math.min(minDist, d);
      }

      if (minDist > maxDist) {
        maxDist = minDist;
        bestIdx = i;
      }
    }

    centroids.push({ ...points[bestIdx] });
  }

  // K-means iterations
  for (let iter = 0; iter < iters; iter++) {
    const clusters = Array(centroids.length).fill(null).map(() => []);

    for (let i = 0; i < points.length; i++) {
      let best = 0, bestDist = Infinity;

      for (let j = 0; j < centroids.length; j++) {
        const d = (points[i].r - centroids[j].r) ** 2 + (points[i].g - centroids[j].g) ** 2 + (points[i].b - centroids[j].b) ** 2;
        if (d < bestDist) {
          best = j;
          bestDist = d;
        }
      }

      clusters[best].push(i);
    }

    for (let j = 0; j < centroids.length; j++) {
      if (clusters[j].length === 0) continue;

      let sumR = 0, sumG = 0, sumB = 0;
      for (const idx of clusters[j]) {
        sumR += points[idx].r;
        sumG += points[idx].g;
        sumB += points[idx].b;
      }

      centroids[j] = {
        r: sumR / clusters[j].length,
        g: sumG / clusters[j].length,
        b: sumB / clusters[j].length
      };
    }
  }

  // Asignar cada píxel al centroide más cercano
  const quantized = new Uint8Array(points.length);

  for (let i = 0; i < points.length; i++) {
    let best = 0, bestDist = Infinity;

    for (let j = 0; j < centroids.length; j++) {
      const d = (points[i].r - centroids[j].r) ** 2 + (points[i].g - centroids[j].g) ** 2 + (points[i].b - centroids[j].b) ** 2;
      if (d < bestDist) {
        best = j;
        bestDist = d;
      }
    }

    quantized[i] = best;
  }

  return { quantized, palette: centroids };
}

function findConnectedComponents(labels, w, h) {
  const visited = new Uint8Array(w * h);
  const components = [];

  for (let idx = 0; idx < w * h; idx++) {
    if (visited[idx]) continue;

    const colorIdx = labels[idx];
    const pixels = [];
    const stack = [idx];

    while (stack.length > 0) {
      const current = stack.pop();
      if (visited[current]) continue;

      visited[current] = 1;
      pixels.push(current);

      const x = current % w;
      const y = Math.floor(current / w);

      // 8-conectividad
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;

          const nx = x + dx;
          const ny = y + dy;

          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const nIdx = ny * w + nx;
            if (!visited[nIdx] && labels[nIdx] === colorIdx) {
              stack.push(nIdx);
            }
          }
        }
      }
    }

    components.push({
      colorIdx: colorIdx,
      pixels: pixels.map(idx => ({
        x: idx % w,
        y: Math.floor(idx / w)
      }))
    });
  }

  return components;
}

function generateScanlines(pixels, w, h, density) {
  if (pixels.length === 0) return [];

  const step = Math.max(1, Math.round(2.5 / Math.max(0.1, density)));
  const pixelSet = new Set(pixels.map(p => `${p.x},${p.y}`));

  // Bounding box
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (const p of pixels) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  const stitches = [];

  // Scanlines horizontales
  for (let y = minY; y <= maxY; y += step) {
    const scanXs = [];

    for (let x = minX; x <= maxX; x++) {
      if (pixelSet.has(`${x},${y}`)) {
        scanXs.push(x);
      }
    }

    // Extraer runs contiguos
    let i = 0;
    while (i < scanXs.length) {
      const start = scanXs[i];
      let end = start;

      while (i + 1 < scanXs.length && scanXs[i + 1] === scanXs[i] + 1) {
        i++;
        end = scanXs[i];
      }

      // Añadir puntos a lo largo de la run
      for (let x = start; x <= end; x += step) {
        stitches.push({ x, y });
      }

      i++;
    }
  }

  return stitches;
}

function classifyStitch(count) {
  if (count < 50) return 'running_stitch';
  if (count < 400) return 'satin';
  return 'fill';
}