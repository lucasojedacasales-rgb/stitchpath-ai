/* global Deno */

/**
 * Motor de Vectorización Ultra-Ligero para Deno
 * Redimensiona a 128px, scanlines horizontales, sin k-means/contornos
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

    console.log(`[LITE] Starting: ${width}x${height}px → ${width_mm}x${height_mm}mm`);

    // Validar entrada mínima
    if (!pixels || !width || !height || pixels.length < 4) {
      return Response.json({ 
        success: false, 
        error: 'Invalid image data' 
      });
    }

    // Convertir pixels a Uint8ClampedArray si es necesario
    let pixelData = pixels;
    if (!(pixelData instanceof Uint8ClampedArray) && Array.isArray(pixelData)) {
      pixelData = new Uint8ClampedArray(pixelData);
    }

    // 1. ESCALAR a máximo 128px
    const scaled = scaleImage(pixelData, width, height, 128, 128);
    const { pixels: scaledPixels, width: scaledW, height: scaledH } = scaled;

    console.log(`[LITE] Scaled to ${scaledW}x${scaledH}px`);

    // 2. CUANTIZAR: truncar RGB a 3 bits
    const { labels, palette } = quantizeToFrequency(scaledPixels, scaledW, scaledH, color_count);

    console.log(`[LITE] Palette: ${palette.length} colors`);

    // 3. GENERAR PUNTADAS: scanlines horizontales
    let regions = generateScanlineStitches(labels, palette, scaledW, scaledH, stitch_density);

    // Fallback: si no hay regiones, crear una región default
    if (regions.length === 0) {
      console.log('[LITE] No regions found, generating default grayscale...');
      regions = [generateDefaultRegion(scaledPixels, scaledW, scaledH, stitch_density)];
    }

    // 4. LIMITAR: máx 20 regiones, máx 10k puntadas
    const filtered = regions.slice(0, 20).map(r => ({
      ...r,
      stitches: r.stitches.slice(0, Math.ceil(10000 / Math.max(1, regions.length)))
    }));

    const totalStitches = filtered.reduce((s, r) => s + r.pointCount, 0);

    // 5. CONVERTIR a milímetros
    const pxPerMM = width_mm / scaledW;
    const finalRegions = filtered.map(r => ({
      ...r,
      stitches: r.stitches.map(pt => ({
        x: Math.max(0, Math.min(width_mm, pt.x * pxPerMM)),
        y: Math.max(0, Math.min(height_mm, pt.y * pxPerMM))
      }))
    }));

    console.log(`[LITE] SUCCESS: ${finalRegions.length} regions, ${totalStitches} stitches`);

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
    console.error('[LITE] Error:', err.message);
    return Response.json({
      success: false,
      error: err.message
    }, { status: 500 });
  }
});

// ============================================================================
// ESCALAR IMAGEN
// ============================================================================

function scaleImage(pixels, srcW, srcH, maxW, maxH) {
  const aspect = srcW / srcH;
  let dstW, dstH;

  if (aspect > 1) {
    dstW = Math.min(srcW, maxW);
    dstH = Math.round(dstW / aspect);
  } else {
    dstH = Math.min(srcH, maxH);
    dstW = Math.round(dstH * aspect);
  }

  dstW = Math.max(8, Math.min(128, dstW));
  dstH = Math.max(8, Math.min(128, dstH));

  const dst = new Uint8ClampedArray(dstW * dstH * 4);

  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const srcX = Math.floor((x / dstW) * srcW);
      const srcY = Math.floor((y / dstH) * srcH);
      const srcIdx = (srcY * srcW + srcX) * 4;
      const dstIdx = (y * dstW + x) * 4;

      dst[dstIdx] = pixels[srcIdx];
      dst[dstIdx + 1] = pixels[srcIdx + 1];
      dst[dstIdx + 2] = pixels[srcIdx + 2];
      dst[dstIdx + 3] = pixels[srcIdx + 3] || 255;
    }
  }

  return { pixels: dst, width: dstW, height: dstH };
}

// ============================================================================
// CUANTIZAR: truncar RGB a 3 bits + frecuencias
// ============================================================================

function quantizeToFrequency(pixels, width, height, k) {
  const colorMap = new Map();

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] & 0xE0;
    const g = pixels[i + 1] & 0xE0;
    const b = pixels[i + 2] & 0xE0;
    const key = `${r},${g},${b}`;

    colorMap.set(key, (colorMap.get(key) || 0) + 1);
  }

  // K colores más frecuentes
  const palette = Array.from(colorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, k))
    .map(([key]) => {
      const [r, g, b] = key.split(',').map(Number);
      return { r, g, b };
    });

  // Asignar cada píxel
  const labels = new Uint8Array(width * height);

  for (let i = 0, idx = 0; i < pixels.length; i += 4, idx++) {
    const r = pixels[i] & 0xE0;
    const g = pixels[i + 1] & 0xE0;
    const b = pixels[i + 2] & 0xE0;

    let bestIdx = 0;
    let bestDist = Infinity;

    for (let j = 0; j < palette.length; j++) {
      const dr = r - palette[j].r;
      const dg = g - palette[j].g;
      const db = b - palette[j].b;
      const dist = dr * dr + dg * dg + db * db;

      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = j;
      }
    }

    labels[idx] = bestIdx;
  }

  return { labels, palette };
}

// ============================================================================
// GENERAR PUNTADAS: scanlines horizontales
// ============================================================================

function generateScanlineStitches(labels, palette, width, height, stitchDensity) {
  const STEP = Math.max(1, Math.round(5 / stitchDensity));
  const regions = [];

  for (let colorIdx = 0; colorIdx < palette.length; colorIdx++) {
    const stitches = [];

    for (let y = 0; y < height; y += STEP) {
      let inSegment = false;
      let segStart = -1;

      for (let x = 0; x < width; x++) {
        const current = labels[y * width + x];
        const prev = x > 0 ? labels[y * width + x - 1] : -1;

        if (current === colorIdx && prev !== colorIdx) {
          inSegment = true;
          segStart = x;
        }

        if (inSegment && (current !== colorIdx || x === width - 1)) {
          const segEnd = current === colorIdx ? x : x - 1;

          if (segEnd >= segStart) {
            for (let sx = segStart; sx <= segEnd; sx += STEP) {
              if (labels[y * width + sx] === colorIdx) {
                stitches.push({ x: sx, y });
              }
            }
          }

          inSegment = false;
        }
      }
    }

    if (stitches.length > 0) {
      const zigzagged = zigzagConnect(stitches, STEP);
      regions.push({
        id: `r${colorIdx}`,
        name: getColorName(palette[colorIdx], colorIdx),
        color: `#${palette[colorIdx].r.toString(16).padStart(2, '0')}${palette[colorIdx].g.toString(16).padStart(2, '0')}${palette[colorIdx].b.toString(16).padStart(2, '0')}`,
        type: classifyType(zigzagged.length),
        stitches: zigzagged,
        pointCount: zigzagged.length
      });
    }
  }

  return regions;
}

function zigzagConnect(stitches, step) {
  if (stitches.length < 2) return stitches;

  const rows = new Map();
  for (const s of stitches) {
    const yKey = Math.round(s.y / step);
    if (!rows.has(yKey)) rows.set(yKey, []);
    rows.get(yKey).push(s);
  }

  const sorted = Array.from(rows.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([_, row]) => {
      row.sort((a, b) => a.x - b.x);
      return row;
    });

  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    if (i % 2 === 1) row.reverse();
    result.push(...row);
  }

  return result;
}

function classifyType(count) {
  if (count < 100) return 'running_stitch';
  if (count < 1000) return 'satin';
  return 'fill';
}

function getColorName(color, idx) {
  const names = ['negro', 'rojo', 'verde', 'azul', 'amarillo', 'rosa'];
  return names[idx] || `color${idx}`;
}

// ============================================================================
// FALLBACK: región default si no se encuentran regiones
// ============================================================================

function generateDefaultRegion(pixels, width, height, stitchDensity) {
  const STEP = Math.max(1, Math.round(5 / stitchDensity));
  const stitches = [];

  // Scanlines simples de luminancia (grayscale)
  for (let y = 0; y < height; y += STEP) {
    for (let x = 0; x < width; x += STEP) {
      const idx = (y * width + x) * 4;
      const luma = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
      
      // Solo añadir si no es muy brillante (evitar fondo blanco)
      if (luma < 200) {
        stitches.push({ x, y });
      }
    }
  }

  // Si aún no hay stitches, generar grid mínimo
  if (stitches.length === 0) {
    for (let y = 5; y < height; y += 10) {
      for (let x = 5; x < width; x += 10) {
        stitches.push({ x, y });
      }
    }
  }

  return {
    id: 'r_default',
    name: 'default_run',
    color: '#4a4a4a',
    type: 'running_stitch',
    stitches,
    pointCount: stitches.length
  };
}