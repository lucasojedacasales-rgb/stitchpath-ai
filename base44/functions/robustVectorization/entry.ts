/* global Deno */

/**
 * Motor de Vectorización - FLOOD FILL + SCANLINES
 * Detecta regiones cerradas y genera scanlines densos
 */

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'POST only' }, { status: 405 });
    }

    const payload = await req.json();
    const { pixels, width, height, width_mm = 100, height_mm = 100, color_count = 6, stitch_density = 0.7 } = payload;

    console.log(`[VECTORIZER] Starting: ${width}x${height}px → ${color_count} colors`);

    if (!pixels || !width || !height || pixels.length < 4) {
      return Response.json({ success: false, error: 'Invalid image data' });
    }

    let pixelData = pixels;
    if (!(pixelData instanceof Uint8ClampedArray) && Array.isArray(pixelData)) {
      pixelData = new Uint8ClampedArray(pixelData);
    }

    // 1. ESCALAR
    const scaled = scaleImage(pixelData, width, height, 256);
    console.log(`[VECTORIZER] Scaled to ${scaled.width}x${scaled.height}`);

    // 2. CUANTIZAR COLORES
    const { quantized, palette } = quantizeImage(scaled.pixels, scaled.width, scaled.height, color_count);
    console.log(`[VECTORIZER] Quantized to ${palette.length} colors`);

    // 3. DETECTAR REGIONES POR FLOOD FILL
    const regions = detectRegionsByFloodFill(quantized, palette, scaled.width, scaled.height);
    console.log(`[VECTORIZER] Detected ${regions.length} regions via flood fill`);

    if (regions.length === 0) {
      throw new Error('No regions detected');
    }

    // 4. GENERAR SCANLINES PARA CADA REGIÓN
    const scannedRegions = regions.map(region => ({
      ...region,
      stitches: generateRegionScanlines(region, scaled.width, scaled.height, stitch_density)
    })).filter(r => r.stitches.length > 5);

    console.log(`[VECTORIZER] Generated scanlines for ${scannedRegions.length} regions`);

    // 5. CONVERTIR A MM
    const pxPerMM_x = width_mm / scaled.width;
    const pxPerMM_y = height_mm / scaled.height;

    const finalRegions = scannedRegions.map(r => ({
      id: r.id,
      color: r.color,
      stitch_type: r.stitches.length < 50 ? 'running_stitch' : r.stitches.length < 400 ? 'satin' : 'fill',
      stitches: r.stitches.map(p => ({ x: p.x * pxPerMM_x, y: p.y * pxPerMM_y })),
      path_points: r.stitches.map(p => [p.x * pxPerMM_x / width_mm, p.y * pxPerMM_y / height_mm]),
      pointCount: r.stitches.length,
      visible: true
    }));

    const totalStitches = finalRegions.reduce((s, r) => s + r.pointCount, 0);
    console.log(`[VECTORIZER] ✅ SUCCESS: ${finalRegions.length} regions, ${totalStitches} stitches`);

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
    console.error('[VECTORIZER] ❌ Error:', err.message);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
});

// ============================================================================
// 1. ESCALAR
// ============================================================================

function scaleImage(src, srcW, srcH, maxDim) {
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
      dst[dstIdx + 3] = 255;
    }
  }

  return { pixels: dst, width: dstW, height: dstH };
}

// ============================================================================
// 2. CUANTIZAR
// ============================================================================

function quantizeImage(pixels, width, height, k) {
  // Contar colores
  const colorMap = new Map();

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const key = `${r},${g},${b}`;
    colorMap.set(key, (colorMap.get(key) || 0) + 1);
  }

  // Top K colores
  const palette = Array.from(colorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(2, k))
    .map(([key]) => {
      const [r, g, b] = key.split(',').map(Number);
      return { r, g, b };
    });

  // Asignar a índices
  const quantized = new Uint8Array(width * height);

  for (let i = 0, idx = 0; i < pixels.length; i += 4, idx++) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    let best = 0, bestDist = Infinity;

    for (let j = 0; j < palette.length; j++) {
      const dr = r - palette[j].r;
      const dg = g - palette[j].g;
      const db = b - palette[j].b;
      const dist = dr * dr + dg * dg + db * db;

      if (dist < bestDist) {
        best = j;
        bestDist = dist;
      }
    }

    quantized[idx] = best;
  }

  return { quantized, palette };
}

// ============================================================================
// 3. DETECTAR REGIONES POR FLOOD FILL
// ============================================================================

function detectRegionsByFloodFill(quantized, palette, width, height) {
  const visited = new Set();
  const regions = [];
  let regionId = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (visited.has(idx)) continue;

      const colorIdx = quantized[idx];
      const pixels = floodFill(quantized, width, height, x, y, colorIdx, visited);

      if (pixels.length > 10) {
        regions.push({
          id: `region_${regionId++}`,
          colorIdx: colorIdx,
          color: rgbToHex(palette[colorIdx]),
          pixels: pixels
        });
      }
    }
  }

  return regions;
}

function floodFill(quantized, width, height, startX, startY, colorIdx, visited) {
  const stack = [[startX, startY]];
  const pixels = [];
  const localVisited = new Set();
  const idx = startY * width + startX;

  if (visited.has(idx)) return pixels;

  while (stack.length > 0) {
    const [x, y] = stack.pop();

    if (x < 0 || x >= width || y < 0 || y >= height) continue;

    const i = y * width + x;
    if (localVisited.has(i) || visited.has(i)) continue;
    if (quantized[i] !== colorIdx) continue;

    localVisited.add(i);
    visited.add(i);
    pixels.push([x, y]);

    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  return pixels;
}

// ============================================================================
// 4. GENERAR SCANLINES PARA REGIÓN
// ============================================================================

function generateRegionScanlines(region, width, height, density) {
  const step = Math.max(1, Math.round(3 / Math.max(0.1, density)));
  const pixelSet = new Set(region.pixels.map(([x, y]) => `${x},${y}`));

  // Bounding box
  let minX = width, maxX = 0, minY = height, maxY = 0;
  for (const [x, y] of region.pixels) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const stitches = [];

  // Scanlines horizontales dentro del bounding box
  for (let y = minY; y <= maxY; y += step) {
    const xValues = [];

    for (let x = minX; x <= maxX; x++) {
      if (pixelSet.has(`${x},${y}`)) {
        xValues.push(x);
      }
    }

    // Extraer runs
    for (let i = 0; i < xValues.length; i++) {
      const startX = xValues[i];
      let endX = startX;

      // Encontrar el final de la run
      while (i + 1 < xValues.length && xValues[i + 1] === xValues[i] + 1) {
        i++;
        endX = xValues[i];
      }

      // Añadir puntos a lo largo de la run
      for (let x = startX; x <= endX; x += step) {
        stitches.push({ x, y });
      }
    }
  }

  return stitches;
}

// ============================================================================
// HELPERS
// ============================================================================

function rgbToHex(color) {
  const r = Math.round(color.r).toString(16).padStart(2, '0');
  const g = Math.round(color.g).toString(16).padStart(2, '0');
  const b = Math.round(color.b).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}