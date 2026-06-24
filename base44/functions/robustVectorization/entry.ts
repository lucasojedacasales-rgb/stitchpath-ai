/* global Deno */

/**
 * Motor de Vectorización - SIMPLE + EFECTIVO
 * Scanlines + Cuantización por frecuencia
 * (Lo que funcionaba antes)
 */

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'POST only' }, { status: 405 });
    }

    const payload = await req.json();
    const { pixels, width, height, width_mm = 100, height_mm = 100, color_count = 6, stitch_density = 0.7 } = payload;

    console.log(`[VECTORIZER] Starting: ${width}x${height}px → ${color_count} colors, density=${stitch_density}`);

    if (!pixels || !width || !height || pixels.length < 4) {
      return Response.json({ success: false, error: 'Invalid image data' });
    }

    let pixelData = pixels;
    if (!(pixelData instanceof Uint8ClampedArray) && Array.isArray(pixelData)) {
      pixelData = new Uint8ClampedArray(pixelData);
    }

    // 1. ESCALAR
    const maxDim = 256;
    const scaled = scaleImage(pixelData, width, height, maxDim);
    console.log(`[VECTORIZER] Scaled to ${scaled.width}x${scaled.height}`);

    // 2. CUANTIZAR (simple por frecuencia)
    const { labels, palette } = quantizeColors(scaled.pixels, scaled.width, scaled.height, color_count);
    console.log(`[VECTORIZER] Quantized to ${palette.length} colors`);

    // 3. GENERAR REGIONES CON SCANLINES
    const regions = generateScanlineRegions(labels, palette, scaled.width, scaled.height, stitch_density);
    console.log(`[VECTORIZER] Generated ${regions.length} regions`);

    if (regions.length === 0) {
      throw new Error('No regions generated from image');
    }

    // 4. CONVERTIR A MM
    const pxPerMM_x = width_mm / scaled.width;
    const pxPerMM_y = height_mm / scaled.height;

    const finalRegions = regions.map(r => ({
      id: r.id,
      color: r.color,
      stitch_type: r.stitch_type,
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
// 2. CUANTIZAR (por frecuencia de colores)
// ============================================================================

function quantizeColors(pixels, width, height, k) {
  const colorFreq = new Map();

  // Contar frecuencias
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] & 0xE0;
    const g = pixels[i + 1] & 0xE0;
    const b = pixels[i + 2] & 0xE0;
    const key = `${r},${g},${b}`;
    colorFreq.set(key, (colorFreq.get(key) || 0) + 1);
  }

  // Top K por frecuencia
  const palette = Array.from(colorFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, k))
    .map(([key]) => {
      const [r, g, b] = key.split(',').map(Number);
      return { r, g, b };
    });

  // Asignar cada píxel al color más cercano
  const labels = new Uint8Array(width * height);

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

    labels[idx] = best;
  }

  return { labels, palette };
}

// ============================================================================
// 3. GENERAR REGIONES CON SCANLINES
// ============================================================================

function generateScanlineRegions(labels, palette, width, height, density) {
  const regions = [];
  const STEP = Math.max(1, Math.round(3 / Math.max(0.1, density)));

  // Para cada color
  for (let colorIdx = 0; colorIdx < palette.length; colorIdx++) {
    const stitches = [];

    // Scanlines horizontales
    for (let y = 0; y < height; y += STEP) {
      let inRun = false;
      let runStart = -1;

      for (let x = 0; x <= width; x++) {
        const isColor = x < width && labels[y * width + x] === colorIdx;
        const wasColor = x > 0 && labels[y * width + x - 1] === colorIdx;

        if (isColor && !wasColor) {
          inRun = true;
          runStart = x;
        }

        if (!isColor && wasColor) {
          for (let px = runStart; px < x; px += STEP) {
            stitches.push({ x: px, y });
          }
          inRun = false;
        }
      }
    }

    if (stitches.length > 5) {
      const color = `#${palette[colorIdx].r.toString(16).padStart(2, '0')}${palette[colorIdx].g.toString(16).padStart(2, '0')}${palette[colorIdx].b.toString(16).padStart(2, '0')}`;

      const stitch_type = stitches.length < 50 ? 'running_stitch' : stitches.length < 400 ? 'satin' : 'fill';

      regions.push({
        id: `region_${colorIdx}`,
        color: color,
        stitch_type: stitch_type,
        stitches: stitches,
        pointCount: stitches.length,
        visible: true
      });
    }
  }

  return regions;
}