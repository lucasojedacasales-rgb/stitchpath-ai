/* global Deno */

/**
 * Motor de Vectorización - SCANLINES + K-MEANS LAB
 * Optimizado para generar regiones rellenas de alta calidad
 * Basado en lo que funcionaba: pre-procesamiento + cuantización + scanlines densas
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

    console.log(`[VECTORIZER] Starting: ${width}x${height}px → ${color_count} colors`);

    if (!pixels || !width || !height || pixels.length < 4) {
      return Response.json({ success: false, error: 'Invalid image data' });
    }

    let pixelData = pixels;
    if (!(pixelData instanceof Uint8ClampedArray) && Array.isArray(pixelData)) {
      pixelData = new Uint8ClampedArray(pixelData);
    }

    // 1. ESCALAR a máximo 256px para velocidad
    const scaled = scaleImage(pixelData, width, height, 256);
    console.log(`[VECTORIZER] Scaled to ${scaled.width}x${scaled.height}`);

    // 2. PRE-PROCESAMIENTO: bilateral + contraste
    const preprocessed = preprocessImage(scaled.pixels, scaled.width, scaled.height);
    console.log('[VECTORIZER] Pre-processing done');

    // 3. K-MEANS LAB para cuantización superior
    const { labels, palette } = kmeansLAB(preprocessed, scaled.width, scaled.height, Math.min(color_count, 12));
    console.log(`[VECTORIZER] Quantized to ${palette.length} colors`);

    // 4. GENERAR REGIONES CON SCANLINES DENSOS (lo que funciona)
    const regions = generateScannedRegions(labels, palette, scaled.width, scaled.height, stitch_density);
    console.log(`[VECTORIZER] Generated ${regions.length} regions with scanlines`);

    if (regions.length === 0) {
      throw new Error('No regions generated');
    }

    // 5. CLASIFICAR TIPOS DE STITCH
    const classified = regions.map(r => ({
      ...r,
      stitch_type: classifyStitchType(r)
    }));

    // 6. CONVERTIR A MILÍMETROS
    const pxPerMM_x = width_mm / scaled.width;
    const pxPerMM_y = height_mm / scaled.height;

    const finalRegions = classified.map(r => ({
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
// ESCALAR IMAGEN
// ============================================================================

function scaleImage(src, srcW, srcH, maxDim) {
  const aspect = srcW / srcH;
  let dstW, dstH;

  if (aspect > 1) {
    dstW = Math.min(srcW, maxDim);
    dstH = Math.round(dstW / aspect);
  } else {
    dstH = Math.min(srcH, maxDim);
    dstW = Math.round(dstH * aspect);
  }

  dstW = Math.max(16, Math.min(256, dstW));
  dstH = Math.max(16, Math.min(256, dstH));

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

// ============================================================================
// PRE-PROCESAMIENTO: BILATERAL + CONTRASTE
// ============================================================================

function preprocessImage(pixels, width, height) {
  // Bilateral filter: preserva bordes, suaviza interiores
  const bilateral = bilateralFilter(pixels, width, height);

  // Boost contraste local
  const enhanced = contrastBoost(bilateral, width, height);

  return enhanced;
}

function bilateralFilter(src, w, h) {
  const dst = new Uint8ClampedArray(src.length);
  const radius = 2;
  const sigma = 20;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sumR = 0, sumG = 0, sumB = 0, sumW = 0;

      const centerIdx = (y * w + x) * 4;
      const centerR = src[centerIdx];
      const centerG = src[centerIdx + 1];
      const centerB = src[centerIdx + 2];

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = Math.max(0, Math.min(w - 1, x + dx));
          const ny = Math.max(0, Math.min(h - 1, y + dy));
          const idx = (ny * w + nx) * 4;

          const dr = src[idx] - centerR;
          const dg = src[idx + 1] - centerG;
          const db = src[idx + 2] - centerB;

          const colorDist = Math.sqrt(dr * dr + dg * dg + db * db);
          const spaceDist = Math.sqrt(dx * dx + dy * dy);

          const wSpace = Math.exp(-(spaceDist * spaceDist) / (2 * sigma * sigma));
          const wColor = Math.exp(-(colorDist * colorDist) / (2 * 30 * 30));
          const w = wSpace * wColor;

          sumR += src[idx] * w;
          sumG += src[idx + 1] * w;
          sumB += src[idx + 2] * w;
          sumW += w;
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

function contrastBoost(src, w, h) {
  const dst = new Uint8ClampedArray(src.length);

  for (let i = 0; i < src.length; i += 4) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];

    // Contrast stretch
    const newR = Math.max(0, Math.min(255, r * 1.3 - 40));
    const newG = Math.max(0, Math.min(255, g * 1.3 - 40));
    const newB = Math.max(0, Math.min(255, b * 1.3 - 40));

    dst[i] = newR;
    dst[i + 1] = newG;
    dst[i + 2] = newB;
    dst[i + 3] = 255;
  }

  return dst;
}

// ============================================================================
// K-MEANS LAB
// ============================================================================

function kmeansLAB(pixels, width, height, k, iterations = 3) {
  const lab = [];

  // RGB → LAB
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] / 255;
    const g = pixels[i + 1] / 255;
    const b = pixels[i + 2] / 255;

    const x = 0.95047 * linearize(r);
    const y = 1.00000 * linearize(g);
    const z = 1.08883 * linearize(b);

    const fx = invF(x / 0.95047);
    const fy = invF(y / 1.00000);
    const fz = invF(z / 1.08883);

    const L = 116 * fy - 16;
    const a = 500 * (fx - fy);
    const bb = 200 * (fy - fz);

    lab.push({
      L: Math.max(-128, Math.min(127, L)),
      a: Math.max(-128, Math.min(127, a)),
      b: Math.max(-128, Math.min(127, bb)),
      r: pixels[i],
      g: pixels[i + 1],
      b_rgb: pixels[i + 2]
    });
  }

  // Inicializar centroides aleatorios
  const centroids = [];
  const indices = new Set();
  while (centroids.length < k && centroids.length < lab.length) {
    const idx = Math.floor(Math.random() * lab.length);
    if (!indices.has(idx)) {
      centroids.push({ ...lab[idx] });
      indices.add(idx);
    }
  }

  // K-means
  for (let iter = 0; iter < iterations; iter++) {
    const clusters = Array.from({ length: k }, () => []);

    for (const point of lab) {
      let best = 0, bestDist = Infinity;
      for (let i = 0; i < centroids.length; i++) {
        const dL = point.L - centroids[i].L;
        const da = point.a - centroids[i].a;
        const db = point.b - centroids[i].b;
        const dist = dL * dL + da * da + db * db;
        if (dist < bestDist) {
          best = i;
          bestDist = dist;
        }
      }
      clusters[best].push(point);
    }

    for (let i = 0; i < k; i++) {
      if (clusters[i].length > 0) {
        const sumL = clusters[i].reduce((s, p) => s + p.L, 0);
        const suma = clusters[i].reduce((s, p) => s + p.a, 0);
        const sumb = clusters[i].reduce((s, p) => s + p.b, 0);
        const sumR = clusters[i].reduce((s, p) => s + p.r, 0);
        const sumG = clusters[i].reduce((s, p) => s + p.g, 0);
        const sumBRGB = clusters[i].reduce((s, p) => s + p.b_rgb, 0);
        const n = clusters[i].length;

        centroids[i] = {
          L: sumL / n,
          a: suma / n,
          b: sumb / n,
          r: sumR / n,
          g: sumG / n,
          b_rgb: sumBRGB / n
        };
      }
    }
  }

  // Asignar labels
  const labels = new Uint8Array(lab.length);
  for (let i = 0; i < lab.length; i++) {
    let best = 0, bestDist = Infinity;
    for (let j = 0; j < centroids.length; j++) {
      const dL = lab[i].L - centroids[j].L;
      const da = lab[i].a - centroids[j].a;
      const db = lab[i].b - centroids[j].b;
      const dist = dL * dL + da * da + db * db;
      if (dist < bestDist) {
        best = j;
        bestDist = dist;
      }
    }
    labels[i] = best;
  }

  const palette = centroids.map(c => ({
    r: Math.round(Math.max(0, Math.min(255, c.r))),
    g: Math.round(Math.max(0, Math.min(255, c.g))),
    b: Math.round(Math.max(0, Math.min(255, c.b_rgb)))
  }));

  return { labels, palette };
}

function linearize(c) {
  return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
}

function invF(t) {
  const delta = 6 / 29;
  return t > delta ? t * t * t : (t - 4 / 29) * 3 * delta * delta;
}

// ============================================================================
// GENERAR REGIONES CON SCANLINES (LO QUE FUNCIONA)
// ============================================================================

function generateScannedRegions(labels, palette, width, height, density) {
  const regions = [];
  const STEP = Math.max(1, Math.round(3 / Math.max(0.1, density)));

  // Para cada color
  for (let colorIdx = 0; colorIdx < palette.length; colorIdx++) {
    const stitches = [];

    // SCANLINES HORIZONTALES
    for (let y = 0; y < height; y += STEP) {
      let inRun = false;
      let runStart = -1;

      for (let x = 0; x <= width; x++) {
        const isColor = x < width && labels[y * width + x] === colorIdx;
        const wasColor = x > 0 && labels[y * width + x - 1] === colorIdx;

        // Inicio de run
        if (isColor && !wasColor) {
          inRun = true;
          runStart = x;
        }

        // Fin de run
        if (!isColor && wasColor) {
          // Añadir puntos desde runStart hasta x
          for (let px = runStart; px < x; px += STEP) {
            stitches.push({ x: px, y });
          }
          inRun = false;
        }
      }
    }

    if (stitches.length > 0) {
      // ZIGZAG para conectar líneas adyacentes (minimizar saltos)
      const zigzagged = zigzagConnect(stitches, STEP);

      const color = `#${palette[colorIdx].r.toString(16).padStart(2, '0')}${palette[colorIdx].g.toString(16).padStart(2, '0')}${palette[colorIdx].b.toString(16).padStart(2, '0')}`;

      regions.push({
        id: `region_${colorIdx}`,
        color: color,
        stitches: zigzagged,
        pointCount: zigzagged.length,
        visible: true
      });
    }
  }

  return regions;
}

function zigzagConnect(stitches, step) {
  if (stitches.length < 2) return stitches;

  // Agrupar por Y
  const rowMap = new Map();
  for (const s of stitches) {
    const yKey = Math.round(s.y / step);
    if (!rowMap.has(yKey)) rowMap.set(yKey, []);
    rowMap.get(yKey).push(s);
  }

  // Ordenar filas
  const rows = Array.from(rowMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([_, row]) => {
      row.sort((a, b) => a.x - b.x);
      return row;
    });

  // Zigzag: alternar dirección para conexión
  const result = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (i % 2 === 1) row.reverse();
    result.push(...row);
  }

  return result;
}

function classifyStitchType(region) {
  const count = region.pointCount || 0;

  if (count < 50) return 'running_stitch';
  if (count < 400) return 'satin';
  return 'fill';
}