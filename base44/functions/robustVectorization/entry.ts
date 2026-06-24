/* global Deno */

/**
 * Motor de Vectorización Robusto para Deno
 * Genera regiones rellenas a partir de imagen rasterizada
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

    console.log(`[ROBUST] Starting vectorization: ${width}x${height}px → ${width_mm}x${height_mm}mm`);

    // Validar entrada
    if (!pixels || !width || !height || pixels.length < 4) {
      return Response.json({ 
        success: false, 
        error: 'Invalid image data' 
      });
    }

    // Convertir a Uint8ClampedArray
    let pixelData = pixels;
    if (!(pixelData instanceof Uint8ClampedArray) && Array.isArray(pixelData)) {
      pixelData = new Uint8ClampedArray(pixelData);
    }

    // 1. ESCALAR imagen (máximo 256px para velocidad)
    const maxDim = 256;
    const aspect = width / height;
    let scaledW, scaledH;
    if (aspect > 1) {
      scaledW = Math.min(width, maxDim);
      scaledH = Math.round(scaledW / aspect);
    } else {
      scaledH = Math.min(height, maxDim);
      scaledW = Math.round(scaledH * aspect);
    }
    scaledW = Math.max(16, Math.min(256, scaledW));
    scaledH = Math.max(16, Math.min(256, scaledH));

    const { pixels: scaled, width: sW, height: sH } = scaleImage(pixelData, width, height, scaledW, scaledH);
    console.log(`[ROBUST] Scaled to ${sW}x${sH}px`);

    // 2. CUANTIZAR colores
    const { labels, palette } = quantizeImage(scaled, sW, sH, color_count);
    console.log(`[ROBUST] Palette: ${palette.length} colors`);

    // 3. GENERAR REGIONES con scanlines densas
    const regions = generateRegions(labels, palette, sW, sH, stitch_density);
    console.log(`[ROBUST] Generated ${regions.length} regions`);

    if (regions.length === 0) {
      throw new Error('No regions generated from image');
    }

    // 4. CONVERTIR a milímetros
    const pxPerMM_x = width_mm / sW;
    const pxPerMM_y = height_mm / sH;

    const finalRegions = regions.map(r => ({
      ...r,
      stitches: r.stitches.map(pt => ({
        x: Math.max(0, Math.min(width_mm, pt.x * pxPerMM_x)),
        y: Math.max(0, Math.min(height_mm, pt.y * pxPerMM_y))
      })),
      path_points: r.stitches.map(pt => [
        pt.x * pxPerMM_x / width_mm,
        pt.y * pxPerMM_y / height_mm
      ])
    }));

    const totalStitches = finalRegions.reduce((s, r) => s + r.pointCount, 0);

    console.log(`[ROBUST] SUCCESS: ${finalRegions.length} regions, ${totalStitches} stitches`);

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
    console.error('[ROBUST] Error:', err.message);
    return Response.json({
      success: false,
      error: err.message
    }, { status: 500 });
  }
});

// ============================================================================
// ESCALAR IMAGEN
// ============================================================================

function scaleImage(src, srcW, srcH, dstW, dstH) {
  const dst = new Uint8ClampedArray(dstW * dstH * 4);

  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const srcX = Math.floor((x / dstW) * srcW);
      const srcY = Math.floor((y / dstH) * srcH);
      const srcIdx = (srcY * srcW + srcX) * 4;
      const dstIdx = (y * dstW + x) * 4;

      dst[dstIdx]     = src[srcIdx];
      dst[dstIdx + 1] = src[srcIdx + 1];
      dst[dstIdx + 2] = src[srcIdx + 2];
      dst[dstIdx + 3] = src[srcIdx + 3] || 255;
    }
  }

  return { pixels: dst, width: dstW, height: dstH };
}

// ============================================================================
// CUANTIZAR IMAGEN
// ============================================================================

function quantizeImage(pixels, width, height, k) {
  const colorFreq = new Map();

  // Contar frecuencias
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3] || 255;

    // Ignorar píxeles muy transparentes
    if (a < 128) continue;

    // Cuantizar a 4 bits por canal para acelerar
    const qr = r & 0xF0;
    const qg = g & 0xF0;
    const qb = b & 0xF0;
    const key = `${qr},${qg},${qb}`;

    colorFreq.set(key, (colorFreq.get(key) || 0) + 1);
  }

  // Top K colores por frecuencia
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
    const a = pixels[i + 3] || 255;

    // Píxeles transparentes = fondo
    if (a < 128) {
      labels[idx] = 255; // "background"
      continue;
    }

    let best = 0, bestDist = Infinity;
    for (let j = 0; j < palette.length; j++) {
      const dr = r - palette[j].r;
      const dg = g - palette[j].g;
      const db = b - palette[j].b;
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) { best = j; bestDist = dist; }
    }
    labels[idx] = best;
  }

  return { labels, palette };
}

// ============================================================================
// GENERAR REGIONES CON SCANLINES
// ============================================================================

function generateRegions(labels, palette, width, height, density) {
  const regions = [];
  const STEP = Math.max(1, Math.round(3 / Math.max(0.1, density)));

  // Procesar cada color
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
          // Inicio de run
          inRun = true;
          runStart = x;
        }

        if (!isColor && wasColor) {
          // Fin de run: añadir puntos
          for (let px = runStart; px < x; px += STEP) {
            stitches.push({ x: px, y });
          }
          inRun = false;
        }
      }
    }

    if (stitches.length > 0) {
      // Zigzag para conectar líneas adyacentes
      const zigzagged = zigzagConnect(stitches, width, height, STEP);

      const color = `#${palette[colorIdx].r.toString(16).padStart(2, '0')}${palette[colorIdx].g.toString(16).padStart(2, '0')}${palette[colorIdx].b.toString(16).padStart(2, '0')}`;

      regions.push({
        id: `region_${colorIdx}`,
        name: `color_${colorIdx}`,
        color: color,
        type: classifyType(zigzagged.length),
        stitches: zigzagged,
        pointCount: zigzagged.length,
        visible: true
      });
    }
  }

  return regions;
}

function zigzagConnect(stitches, width, height, step) {
  if (stitches.length < 2) return stitches;

  // Agrupar por filas (y)
  const rows = new Map();
  for (const s of stitches) {
    const yKey = Math.round(s.y / step);
    if (!rows.has(yKey)) rows.set(yKey, []);
    rows.get(yKey).push(s);
  }

  // Ordenar filas por y
  const sorted = Array.from(rows.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([_, row]) => {
      row.sort((a, b) => a.x - b.x);
      return row;
    });

  // Conectar filas con zigzag
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    // Alternar dirección para minimizar saltos
    if (i % 2 === 1) row.reverse();
    result.push(...row);
  }

  return result;
}

function classifyType(count) {
  if (count < 50) return 'running_stitch';
  if (count < 500) return 'satin';
  return 'fill';
}