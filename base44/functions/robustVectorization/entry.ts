/* global Deno */

/**
 * Motor de Vectorización Ultra-Ligero para Deno
 * Redimensiona a 128px, scanlines horizontales, sin k-means/contornos/rotaciones
 */

export async function robustVectorization(imageData, options = {}) {
  const {
    colorCount = 6,
    widthMM = 100,
    heightMM = 100,
    stitchDensity = 0.7
  } = options;

  try {
    console.log(`[LITE] Starting: ${widthMM}x${heightMM}mm, colorCount=${colorCount}`);

    // 1. CARGAR y REDIMENSIONAR a 128px máximo
    const { pixels: origPixels, width: origW, height: origH } = await loadImage(imageData);
    
    // Escalar a máximo 128px manteniendo aspect ratio
    const scaled = scaleImage(origPixels, origW, origH, 128, 128);
    const { pixels, width, height } = scaled;

    console.log(`[LITE] Scaled to ${width}x${height}px`);

    // 2. REDUCIR COLORES: truncar RGB a 3 bits + frecuencias
    const { labels, palette } = quantizeToFrequency(pixels, width, height, colorCount);
    
    console.log(`[LITE] Palette: ${palette.length} colors`);

    // 3. GENERAR PUNTADAS: scanlines horizontales simples
    const regions = generateScanlineStitches(labels, palette, width, height, stitchDensity);

    // 4. LIMITAR: máx 20 regiones, máx 10k puntadas
    const filtered = regions.slice(0, 20).map(r => ({
      ...r,
      stitches: r.stitches.slice(0, Math.ceil(10000 / Math.max(1, regions.length)))
    }));

    const totalStitches = filtered.reduce((s, r) => s + r.pointCount, 0);

    // 5. CONVERTIR a milímetros
    const pxPerMM = widthMM / width;
    const finalRegions = filtered.map(r => ({
      ...r,
      stitches: r.stitches.map(pt => ({
        x: Math.max(0, Math.min(widthMM, pt.x * pxPerMM)),
        y: Math.max(0, Math.min(heightMM, pt.y * pxPerMM))
      }))
    }));

    console.log(`[LITE] SUCCESS: ${finalRegions.length} regions, ${totalStitches} stitches`);

    return {
      success: true,
      regions: finalRegions,
      totalStitches,
      colorCount: palette.length,
      width: widthMM,
      height: heightMM
    };
  } catch (err) {
    console.error('[LITE] Error:', err.message);
    return {
      success: false,
      error: err.message,
      regions: [],
      totalStitches: 0,
      colorCount: 0,
      width: widthMM,
      height: heightMM
    };
  }
}

// ============================================================================
// PASO 1: CARGAR IMAGEN
// ============================================================================

async function loadImage(imageData) {
  // Si ya son pixels
  if (imageData?.pixels && imageData?.width && imageData?.height) {
    return {
      pixels: new Uint8ClampedArray(imageData.pixels),
      width: imageData.width,
      height: imageData.height
    };
  }

  // File/Blob → bitmap → canvas
  if (typeof createImageBitmap !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
    const bitmap = await createImageBitmap(imageData);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context failed');

    ctx.drawImage(bitmap, 0, 0);
    const imgData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    bitmap.close();

    return {
      pixels: imgData.data,
      width: bitmap.width,
      height: bitmap.height
    };
  }

  throw new Error('Image loading not supported');
}

// ============================================================================
// ESCALAR IMAGEN a máximo 128px
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
// PASO 2: CUANTIZAR SIN K-MEANS (truncar a 3 bits + frecuencias)
// ============================================================================

function quantizeToFrequency(pixels, width, height, k) {
  // Truncar RGB a 3 bits: (valor & 0xE0) = (valor >> 5) << 5
  const colorMap = new Map();
  const pixelCount = (width * height);

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] & 0xE0;
    const g = pixels[i + 1] & 0xE0;
    const b = pixels[i + 2] & 0xE0;
    const key = `${r},${g},${b}`;

    colorMap.set(key, (colorMap.get(key) || 0) + 1);
  }

  // Tomar los K colores más frecuentes
  const palette = Array.from(colorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([key]) => {
      const [r, g, b] = key.split(',').map(Number);
      return { r, g, b };
    });

  // Asignar cada píxel al color más cercano de la paleta
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
// PASO 3: GENERAR PUNTADAS (scanlines horizontales simples)
// ============================================================================

function generateScanlineStitches(labels, palette, width, height, stitchDensity) {
  const SCANLINE_STEP = Math.max(1, Math.round(5 / stitchDensity)); // ~5px
  const STITCH_STEP = SCANLINE_STEP;
  const regions = [];

  // Para cada color
  for (let colorIdx = 0; colorIdx < palette.length; colorIdx++) {
    const stitches = [];

    // Para cada scanline Y (saltando cada SCANLINE_STEP)
    for (let y = 0; y < height; y += SCANLINE_STEP) {
      let inSegment = false;
      let segmentStart = -1;

      // Recorrer X
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const currentColor = labels[idx];
        const prevColor = x > 0 ? labels[idx - 1] : -1;

        // Inicio de segmento: color actual == nuestro color, anterior != nuestro color
        if (currentColor === colorIdx && prevColor !== colorIdx) {
          inSegment = true;
          segmentStart = x;
        }

        // Fin de segmento
        if (inSegment && (currentColor !== colorIdx || x === width - 1)) {
          const segmentEnd = currentColor === colorIdx ? x : x - 1;

          // Generar puntos cada STITCH_STEP en este segmento
          if (segmentEnd >= segmentStart) {
            for (let sx = segmentStart; sx <= segmentEnd; sx += STITCH_STEP) {
              // Verificar que el punto está en el color correcto
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
      // Zigzag: alternar dirección X en cada scanline
      const zigzagged = zigzagConnect(stitches, SCANLINE_STEP);
      const type = classifyType(zigzagged.length);

      regions.push({
        id: `r${colorIdx}`,
        name: getColorName(palette[colorIdx], colorIdx),
        color: palette[colorIdx],
        type,
        stitches: zigzagged,
        pointCount: zigzagged.length
      });
    }
  }

  return regions;
}

function zigzagConnect(stitches, scanlineStep) {
  if (stitches.length < 2) return stitches;

  // Agrupar por Y
  const rows = new Map();
  for (const s of stitches) {
    const yKey = Math.round(s.y / scanlineStep);
    if (!rows.has(yKey)) rows.set(yKey, []);
    rows.get(yKey).push(s);
  }

  // Ordenar cada fila por X, alternar dirección en zigzag
  const sortedRows = Array.from(rows.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([_, row]) => {
      row.sort((a, b) => a.x - b.x);
      return row;
    });

  const result = [];
  for (let i = 0; i < sortedRows.length; i++) {
    const row = sortedRows[i];
    if (i % 2 === 1) row.reverse(); // Alternar dirección
    result.push(...row);
  }

  return result;
}

// ============================================================================
// CLASIFICAR TIPO DE PUNTADA
// ============================================================================

function classifyType(pointCount) {
  if (pointCount < 100) return 'running_stitch';
  if (pointCount < 1000) return 'satin';
  return 'fill';
}

function getColorName(color, idx) {
  const names = ['negro', 'rojo', 'verde', 'azul', 'amarillo', 'rosa'];
  return (names[idx] || `color${idx}`);
}

export default robustVectorization;