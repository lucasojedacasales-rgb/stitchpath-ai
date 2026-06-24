/* global Deno */

/**
 * MOTOR ULTIMATE v6 - OPTIMIZADO PARA PRODUCCIÓN
 * ===============================================
 * Límites estrictos para evitar CPU timeout:
 * - Imagen escalada máx 128x128
 * - Puntadas por región: máx 2000
 * - Step mínimo de relleno: 2px
 */

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });

    const { pixels, width, height, width_mm = 100, height_mm = 100, color_count = 8, stitch_density = 0.8 } = await req.json();

    console.log(`[ULTIMATE] Input: ${width}x${height}px → ${width_mm}x${height_mm}mm`);

    if (!pixels || width < 2 || height < 2) {
      return Response.json({ success: false, error: 'Invalid input' });
    }

    let data = pixels;
    if (!(data instanceof Uint8ClampedArray) && Array.isArray(data)) {
      data = new Uint8ClampedArray(data);
    }

    // FASE 1: ESCALAR A MÁXIMO 128x128 (crítico para rendimiento)
    const scaled = scaleToMax(data, width, height, 128);
    console.log(`[ULTIMATE] Scaled: ${scaled.w}x${scaled.h}`);

    // FASE 2: FILTRO SUAVIZADO LIGERO
    const smoothed = boxBlur(scaled.data, scaled.w, scaled.h);

    // FASE 3: K-MEANS (máx 8 iteraciones, máx 8 colores)
    const safeK = Math.min(color_count, 8, Math.floor(scaled.w * scaled.h / 4));
    const { quantized, palette } = kmeansCluster(smoothed, scaled.w, scaled.h, Math.max(2, safeK));
    console.log(`[ULTIMATE] Kmeans: ${palette.length} colors`);

    // FASE 4: COMPONENTES CONECTADAS
    const components = findComponents(quantized, scaled.w, scaled.h);
    console.log(`[ULTIMATE] Components: ${components.length}`);

    // FASE 5: GENERAR REGIONES CON LÍMITE ESTRICTO DE PUNTADAS
    const regions = [];
    const MIN_PIXELS = 6;
    const MAX_STITCHES_PER_REGION = 1500;

    for (const comp of components) {
      if (comp.pixels.length < MIN_PIXELS) continue;

      const color = palette[comp.color];
      const hexColor = rgbToHex(color);

      // Calcular bounding box del componente
      const bbox = getPixelBoundingBox(comp.pixels, scaled.w);

      // Generar puntadas de relleno con paso adaptativo
      const area = comp.pixels.length;
      const stitches = generateFillSafe(comp.pixels, scaled.w, scaled.h, bbox, area, MAX_STITCHES_PER_REGION);

      if (stitches.length > 2) {
        const stitch_type = area < 40 ? 'running_stitch' : area < 200 ? 'satin' : 'fill';
        regions.push({
          id: `r${regions.length}`,
          color: hexColor,
          type: stitch_type,
          stitches,
          area
        });
        console.log(`[ULTIMATE] Region ${regions.length}: color=${hexColor}, stitches=${stitches.length}, area=${area}`);
      }
    }

    console.log(`[ULTIMATE] Generated ${regions.length} regions`);

    if (regions.length === 0) {
      throw new Error('No regions generated');
    }

    // FASE 6: CONVERSIÓN A MM
    const pxPerMM_x = width_mm / scaled.w;
    const pxPerMM_y = height_mm / scaled.h;

    const finalRegions = regions.map(r => ({
      id: r.id,
      color: r.color,
      stitch_type: r.type,
      stitches: r.stitches.map(p => ({ x: p.x * pxPerMM_x, y: p.y * pxPerMM_y })),
      path_points: r.stitches.map(p => [p.x / scaled.w, p.y / scaled.h]),
      pointCount: r.stitches.length,
      stitch_count: r.stitches.length,
      visible: true
    }));

    const totalStitches = finalRegions.reduce((s, r) => s + r.pointCount, 0);
    console.log(`[ULTIMATE] ✅ SUCCESS: ${finalRegions.length} regions, ${totalStitches} stitches`);

    return Response.json({
      success: true,
      data: {
        blocks: finalRegions,
        stitches: totalStitches,
        color_count: palette.length,
        width: width_mm,
        height: height_mm
      }
    });
  } catch (err) {
    console.error('[ULTIMATE] Error:', err.message);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
});

// ============================================================================
// ESCALAR A MÁXIMO
// ============================================================================
function scaleToMax(src, srcW, srcH, maxDim) {
  const aspect = srcW / srcH;
  let dstW = Math.min(srcW, maxDim);
  let dstH = Math.round(dstW / aspect);
  if (dstH > maxDim) { dstH = maxDim; dstW = Math.round(dstH * aspect); }
  dstW = Math.max(8, dstW);
  dstH = Math.max(8, dstH);

  const dst = new Uint8ClampedArray(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const fx = (x / dstW) * srcW;
      const fy = (y / dstH) * srcH;
      const x0 = Math.min(Math.floor(fx), srcW - 1);
      const y0 = Math.min(Math.floor(fy), srcH - 1);
      const si = (y0 * srcW + x0) * 4;
      const di = (y * dstW + x) * 4;
      dst[di] = src[si]; dst[di+1] = src[si+1]; dst[di+2] = src[si+2]; dst[di+3] = 255;
    }
  }
  return { data: dst, w: dstW, h: dstH };
}

// ============================================================================
// BOX BLUR (más rápido que bilateral)
// ============================================================================
function boxBlur(src, w, h) {
  const dst = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = Math.max(0, Math.min(w-1, x+dx));
          const ny = Math.max(0, Math.min(h-1, y+dy));
          const i = (ny * w + nx) * 4;
          r += src[i]; g += src[i+1]; b += src[i+2]; count++;
        }
      }
      const i = (y * w + x) * 4;
      dst[i] = r/count; dst[i+1] = g/count; dst[i+2] = b/count; dst[i+3] = 255;
    }
  }
  return dst;
}

// ============================================================================
// K-MEANS CLUSTERING
// ============================================================================
function kmeansCluster(pixels, w, h, k) {
  const points = [];
  for (let i = 0; i < pixels.length; i += 4) {
    points.push([pixels[i], pixels[i+1], pixels[i+2]]);
  }

  // Inicializar centroides con k-means++
  const centroids = [points[Math.floor(Math.random() * points.length)]];
  for (let c = 1; c < k; c++) {
    let maxDist = -1, bestIdx = 0;
    for (let i = 0; i < points.length; i++) {
      let minDist = Infinity;
      for (const cent of centroids) {
        const d = (points[i][0]-cent[0])**2 + (points[i][1]-cent[1])**2 + (points[i][2]-cent[2])**2;
        if (d < minDist) minDist = d;
      }
      if (minDist > maxDist) { maxDist = minDist; bestIdx = i; }
    }
    centroids.push([...points[bestIdx]]);
  }

  // 8 iteraciones máximo
  for (let iter = 0; iter < 8; iter++) {
    const sums = centroids.map(() => [0,0,0,0]);
    for (const p of points) {
      let best = 0, bestDist = Infinity;
      for (let j = 0; j < centroids.length; j++) {
        const d = (p[0]-centroids[j][0])**2 + (p[1]-centroids[j][1])**2 + (p[2]-centroids[j][2])**2;
        if (d < bestDist) { best = j; bestDist = d; }
      }
      sums[best][0] += p[0]; sums[best][1] += p[1]; sums[best][2] += p[2]; sums[best][3]++;
    }
    for (let j = 0; j < centroids.length; j++) {
      if (sums[j][3] > 0) {
        centroids[j] = [sums[j][0]/sums[j][3], sums[j][1]/sums[j][3], sums[j][2]/sums[j][3]];
      }
    }
  }

  const quantized = new Uint8Array(points.length);
  for (let i = 0; i < points.length; i++) {
    let best = 0, bestDist = Infinity;
    for (let j = 0; j < centroids.length; j++) {
      const d = (points[i][0]-centroids[j][0])**2 + (points[i][1]-centroids[j][1])**2 + (points[i][2]-centroids[j][2])**2;
      if (d < bestDist) { best = j; bestDist = d; }
    }
    quantized[i] = best;
  }

  const palette = centroids.map(c => ({ r: c[0], g: c[1], b: c[2] }));
  return { quantized, palette };
}

// ============================================================================
// COMPONENTES CONECTADAS (4-conectividad para ser más rápido)
// ============================================================================
function findComponents(labels, w, h) {
  const visited = new Uint8Array(w * h);
  const components = [];

  for (let idx = 0; idx < w * h; idx++) {
    if (visited[idx]) continue;
    const color = labels[idx];
    const pixels = [];
    const stack = [idx];

    while (stack.length > 0) {
      const cur = stack.pop();
      if (visited[cur]) continue;
      visited[cur] = 1;
      pixels.push(cur);
      const x = cur % w, y = Math.floor(cur / w);
      // Solo 4-conectividad (más rápido y menos componentes)
      const neighbors = [
        x > 0 ? cur - 1 : -1,
        x < w-1 ? cur + 1 : -1,
        y > 0 ? cur - w : -1,
        y < h-1 ? cur + w : -1
      ];
      for (const n of neighbors) {
        if (n >= 0 && !visited[n] && labels[n] === color) stack.push(n);
      }
    }
    components.push({ color, pixels });
  }

  // Ordenar por tamaño descendente, tomar los 20 más grandes
  components.sort((a, b) => b.pixels.length - a.pixels.length);
  return components.slice(0, 20);
}

// ============================================================================
// BOUNDING BOX DE PÍXELES
// ============================================================================
function getPixelBoundingBox(pixelIndices, w) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const idx of pixelIndices) {
    const x = idx % w, y = Math.floor(idx / w);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// ============================================================================
// FILL SEGURO CON LÍMITE DE PUNTADAS
// ============================================================================
function generateFillSafe(pixelIndices, imgW, imgH, bbox, area, maxStitches) {
  // Calcular step adaptativo para no superar maxStitches
  // Con step S, número de puntadas ≈ area / (S*S)
  // S = sqrt(area / maxStitches)
  const minStep = Math.max(1, Math.ceil(Math.sqrt(area / maxStitches)));

  const pixelSet = new Set(pixelIndices);
  const stitches = [];
  let lineNum = 0;

  for (let y = bbox.minY; y <= bbox.maxY; y += minStep) {
    const row = [];
    for (let x = bbox.minX; x <= bbox.maxX; x += minStep) {
      const idx = y * imgW + x;
      if (pixelSet.has(idx)) row.push({ x, y });
    }
    // Alternar dirección (zigzag)
    if (lineNum % 2 === 1) row.reverse();
    stitches.push(...row);
    lineNum++;

    if (stitches.length >= maxStitches) break;
  }

  return stitches.slice(0, maxStitches);
}

// ============================================================================
// HELPERS
// ============================================================================
function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}