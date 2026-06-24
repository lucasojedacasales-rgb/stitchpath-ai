/**
 * Motor de Vectorización 100% JavaScript Puro para Deno
 * Raster → Vector → Stitches sin dependencias externas
 * 
 * Algoritmos:
 * - K-means color quantization
 * - Flood fill 8-conectado
 * - Marching squares (contour extraction)
 * - Ramer-Douglas-Peucker simplification
 * - Scanline fill con point-in-polygon
 */

/**
 * Función principal: recibe imagen como File/Blob, devuelve regiones con puntadas
 * 
 * @param {File|Blob} imageFile - Archivo de imagen subido por el usuario
 * @param {Object} options - Configuración
 * @param {number} options.colorCount - Número de colores (default: 6)
 * @param {number} options.widthMM - Ancho físico en mm (default: 100)
 * @param {number} options.heightMM - Alto físico en mm (default: 100)
 * @param {number} options.stitchDensity - Densidad en mm (default: 0.7)
 * @param {number} options.fillAngle - Ángulo de fill en grados (default: 45)
 * @returns {Promise<Object>} - Objeto con regions, totalStitches, etc.
 */
export async function robustVectorization(imageFile, options = {}) {
  const {
    colorCount = 6,
    widthMM = 100,
    heightMM = 100,
    stitchDensity = 0.7,
    fillAngle = 45
  } = options;

  console.log(`[VECTORIZER] Starting: colorCount=${colorCount}, ${widthMM}x${heightMM}mm, density=${stitchDensity}`);

  // 1. Cargar imagen y extraer píxeles
  const { pixels, width, height } = await loadImagePixels(imageFile);

  // 2. Cuantización de color (K-means simplificado)
  const { quantized, palette } = quantizeColors(pixels, width, height, colorCount);

  // 3. Detectar regiones conectadas por color (Flood Fill)
  const regions = findConnectedRegions(quantized, palette, width, height);

  // 4. Procesar cada región: contornos + puntadas
  const pxPerMM = width / widthMM;
  const stitchPX = stitchDensity * pxPerMM;

  const processedRegions = [];
  let totalStitches = 0;

  for (const region of regions) {
    try {
      const regionData = processRegion(region, {
        width,
        height,
        pxPerMM,
        stitchPX,
        fillAngle,
        widthMM,
        heightMM
      });

      if (regionData.stitches && regionData.stitches.length >= 2) {
        processedRegions.push(regionData);
        totalStitches += regionData.pointCount;
      }
    } catch (err) {
      console.warn(`[VECTORIZER] Region processing error: ${err.message}`);
    }
  }

  console.log(`[VECTORIZER] SUCCESS: ${processedRegions.length} regions, ${totalStitches} stitches`);

  return {
    regions: processedRegions,
    totalStitches,
    colorCount: palette.length,
    width: widthMM,
    height: heightMM
  };
}

// ============================================================
// PASO 1: CARGAR IMAGEN Y EXTRAER PÍXELES
// ============================================================

async function loadImagePixels(file) {
  // Crear bitmap desde archivo
  const bitmap = await createImageBitmap(file);

  // Crear canvas offscreen
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  ctx.drawImage(bitmap, 0, 0);

  // Extraer píxeles como Uint8ClampedArray [R,G,B,A, R,G,B,A, ...]
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

  bitmap.close();

  return {
    pixels: imageData.data,
    width: bitmap.width,
    height: bitmap.height
  };
}

// ============================================================
// PASO 2: CUANTIZACIÓN DE COLOR (K-means simplificado)
// ============================================================

function quantizeColors(pixels, width, height, k) {
  // Extraer colores únicos con frecuencia
  const colorFreq = new Map();

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const key = `${r},${g},${b}`;
    colorFreq.set(key, (colorFreq.get(key) || 0) + 1);
  }

  // Si hay menos colores que k, usarlos todos
  const uniqueColors = Array.from(colorFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => {
      const [r, g, b] = key.split(',').map(Number);
      return { r, g, b };
    });

  if (uniqueColors.length <= k) {
    const palette = uniqueColors;
    const colorIndexMap = new Map();
    palette.forEach((c, i) => colorIndexMap.set(`${c.r},${c.g},${c.b}`, i));

    const quantized = new Uint8Array(width * height);
    for (let i = 0, idx = 0; i < pixels.length; i += 4, idx++) {
      const key = `${pixels[i]},${pixels[i+1]},${pixels[i+2]}`;
      quantized[idx] = colorIndexMap.get(key) || 0;
    }

    return { quantized, palette };
  }

  // K-means simplificado
  let palette = initializePalette(uniqueColors, k);

  for (let iter = 0; iter < 5; iter++) {
    const clusters = Array.from({ length: k }, () => []);

    for (const color of uniqueColors) {
      let bestIdx = 0;
      let bestDist = Infinity;

      for (let i = 0; i < palette.length; i++) {
        const dist = colorDistance(color, palette[i]);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }

      clusters[bestIdx].push(color);
    }

    const newPalette = [];
    for (let i = 0; i < k; i++) {
      if (clusters[i].length === 0) {
        newPalette.push(palette[i]);
      } else {
        const avg = {
          r: Math.round(clusters[i].reduce((s, c) => s + c.r, 0) / clusters[i].length),
          g: Math.round(clusters[i].reduce((s, c) => s + c.g, 0) / clusters[i].length),
          b: Math.round(clusters[i].reduce((s, c) => s + c.b, 0) / clusters[i].length)
        };
        newPalette.push(avg);
      }
    }

    palette = newPalette;
  }

  // Cuantizar imagen completa
  const quantized = new Uint8Array(width * height);
  for (let i = 0, idx = 0; i < pixels.length; i += 4, idx++) {
    const pixel = { r: pixels[i], g: pixels[i+1], b: pixels[i+2] };
    let bestIdx = 0;
    let bestDist = Infinity;

    for (let j = 0; j < palette.length; j++) {
      const dist = colorDistance(pixel, palette[j]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = j;
      }
    }

    quantized[idx] = bestIdx;
  }

  return { quantized, palette };
}

function initializePalette(colors, k) {
  const palette = [];
  const used = new Set();

  palette.push(colors[0]);
  used.add(0);

  while (palette.length < k && used.size < colors.length) {
    let maxDist = -1;
    let maxIdx = -1;

    for (let i = 0; i < colors.length; i++) {
      if (used.has(i)) continue;

      let minDist = Infinity;
      for (const p of palette) {
        const d = colorDistance(colors[i], p);
        if (d < minDist) minDist = d;
      }

      if (minDist > maxDist) {
        maxDist = minDist;
        maxIdx = i;
      }
    }

    if (maxIdx >= 0) {
      palette.push(colors[maxIdx]);
      used.add(maxIdx);
    } else {
      break;
    }
  }

  while (palette.length < k) {
    palette.push({ r: 128, g: 128, b: 128 });
  }

  return palette;
}

function colorDistance(c1, c2) {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  // Distancia RGB ponderada perceptual exacta
  return (dr * dr * 0.299) + (dg * dg * 0.587) + (db * db * 0.114);
}

// ============================================================
// PASO 3: DETECTAR REGIONES CONECTADAS (Flood Fill)
// ============================================================

function findConnectedRegions(quantized, palette, width, height) {
  const visited = new Uint8Array(width * height);
  const regions = [];
  let regionId = 0;

  const directions = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [1, -1], [-1, 1], [1, 1]
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (visited[idx]) continue;

      const colorIdx = quantized[idx];
      const pixels = [];
      const stack = [{x, y}];

      while (stack.length > 0) {
        const {x: cx, y: cy} = stack.pop();
        const cidx = cy * width + cx;

        if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
        if (visited[cidx]) continue;
        if (quantized[cidx] !== colorIdx) continue;

        visited[cidx] = 1;
        pixels.push({x: cx, y: cy});

        for (const [dx, dy] of directions) {
          stack.push({x: cx + dx, y: cy + dy});
        }
      }

      if (pixels.length < 20) continue;

      let minX = width, minY = height, maxX = 0, maxY = 0;
      for (const p of pixels) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }

      regions.push({
        id: regionId++,
        colorIdx,
        color: palette[colorIdx],
        pixels,
        bounds: { minX, minY, maxX, maxY },
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        area: pixels.length
      });
    }
  }

  return regions;
}

// ============================================================
// PASO 4: PROCESAR CADA REGIÓN
// ============================================================

function processRegion(region, options) {
  const { width, height, pxPerMM, stitchPX, fillAngle, widthMM, heightMM } = options;

  // Crear máscara binaria para esta región
  const mask = createRegionMask(region);

  // Extraer contorno (Marching Squares simplificado)
  const contour = extractContour(region, mask);

  if (contour.length < 3) {
    return { ...region, type: 'run', stitches: [], pointCount: 0, pathPoints: [] };
  }

  // Simplificar contorno (Ramer-Douglas-Peucker)
  const simplifiedContour = simplifyContour(contour, 1.0 * pxPerMM);

  // Cerrar contorno
  if (simplifiedContour.length > 0) {
    const first = simplifiedContour[0];
    const last = simplifiedContour[simplifiedContour.length - 1];
    if (first.x !== last.x || first.y !== last.y) {
      simplifiedContour.push({ ...first });
    }
  }

  // Clasificar tipo de región
  const regionType = classifyRegion(region, pxPerMM);

  // Generar puntadas según tipo
  let stitches = [];

  if (regionType === 'fill') {
    stitches = generateFillStitches(simplifiedContour, region, mask, {
      stitchPX,
      fillAngle,
      pxPerMM
    });
  } else if (regionType === 'satin') {
    stitches = generateSatinStitches(simplifiedContour, stitchPX);
  } else {
    stitches = generateRunStitches(simplifiedContour, stitchPX);
  }

  // Convertir a mm
  const stitchesMM = stitches.map(pt => ({
    x: Math.max(0, Math.min(widthMM, pt.x / pxPerMM)),
    y: Math.max(0, Math.min(heightMM, pt.y / pxPerMM))
  }));

  // Path points normalizados
  const pathPoints = simplifiedContour.map(p => [
    p.x / width,
    p.y / height
  ]);

  return {
    id: `region_${region.id}`,
    name: generateRegionName(region, regionType),
    color: region.color,
    type: regionType,
    pointCount: stitchesMM.length,
    stitches: stitchesMM,
    pathPoints,
    angle: regionType === 'fill' ? fillAngle : 0,
    density: stitchPX / pxPerMM
  };
}

function createRegionMask(region) {
  const w = region.width;
  const h = region.height;
  const mask = new Uint8Array(w * h);

  for (const p of region.pixels) {
    const mx = p.x - region.bounds.minX;
    const my = p.y - region.bounds.minY;
    mask[my * w + mx] = 1;
  }

  return mask;
}

// ============================================================
// EXTRACTOR DE CONTORNO (Marching Squares simplificado)
// ============================================================

function extractContour(region, mask) {
  const w = region.width;
  const h = region.height;
  const edgePixels = [];

  for (const p of region.pixels) {
    const mx = p.x - region.bounds.minX;
    const my = p.y - region.bounds.minY;

    let isEdge = false;
    const neighbors = [[-1,0], [1,0], [0,-1], [0,1]];

    for (const [dx, dy] of neighbors) {
      const nx = mx + dx;
      const ny = my + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h || mask[ny * w + nx] === 0) {
        isEdge = true;
        break;
      }
    }

    if (isEdge) {
      edgePixels.push({ x: p.x, y: p.y });
    }
  }

  return orderPointsAsPath(edgePixels);
}

function orderPointsAsPath(points) {
  if (points.length === 0) return [];
  if (points.length === 1) return points;

  // Encontrar punto inicial (top-left para consistencia)
  let startIdx = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].y < points[startIdx].y || 
        (points[i].y === points[startIdx].y && points[i].x < points[startIdx].x)) {
      startIdx = i;
    }
  }

  const ordered = [points[startIdx]];
  const remaining = new Set(points.map((p, i) => i).filter(i => i !== startIdx));

  while (remaining.size > 0) {
    const last = ordered[ordered.length - 1];
    let nearestIdx = -1;
    let nearestDist = Infinity;

    for (const idx of remaining) {
      const dx = points[idx].x - last.x;
      const dy = points[idx].y - last.y;
      const dist = dx * dx + dy * dy;

      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = idx;
      }
    }

    if (nearestIdx >= 0) {
      ordered.push(points[nearestIdx]);
      remaining.delete(nearestIdx);
    } else {
      break;
    }
  }

  // Cerrar path: conectar último con primero
  if (ordered.length > 1) {
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (first.x !== last.x || first.y !== last.y) {
      ordered.push({ ...first });
    }
  }

  return ordered;
}

// ============================================================
// SIMPLIFICACIÓN (Ramer-Douglas-Peucker)
// ============================================================

function simplifyContour(points, tolerance) {
  if (points.length <= 2) return points;

  const result = rdpRecursive(points, 0, points.length - 1, tolerance * tolerance);

  if (result.length > 0 && (result[0].x !== result[result.length - 1].x || result[0].y !== result[result.length - 1].y)) {
    result.push({ ...result[0] });
  }

  return result;
}

function rdpRecursive(points, start, end, tolSq) {
  if (end <= start + 1) {
    return [points[start], points[end]];
  }

  let maxDist = -1;
  let maxIdx = -1;

  const lineStart = points[start];
  const lineEnd = points[end];

  for (let i = start + 1; i < end; i++) {
    const dist = pointToLineDistanceSq(points[i], lineStart, lineEnd);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > tolSq) {
    const left = rdpRecursive(points, start, maxIdx, tolSq);
    const right = rdpRecursive(points, maxIdx, end, tolSq);
    return left.slice(0, -1).concat(right);
  } else {
    return [points[start], points[end]];
  }
}

function pointToLineDistanceSq(point, lineStart, lineEnd) {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    const ddx = point.x - lineStart.x;
    const ddy = point.y - lineStart.y;
    return ddx * ddx + ddy * ddy;
  }

  const t = Math.max(0, Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lenSq));
  const projX = lineStart.x + t * dx;
  const projY = lineStart.y + t * dy;

  const ddx = point.x - projX;
  const ddy = point.y - projY;
  return ddx * ddx + ddy * ddy;
}

// ============================================================
// CLASIFICACIÓN DE REGIÓN
// ============================================================

function classifyRegion(region, pxPerMM) {
  const areaMM2 = region.area / (pxPerMM * pxPerMM);
  const wMM = region.width / pxPerMM;
  const hMM = region.height / pxPerMM;
  const aspect = Math.max(wMM, hMM) / Math.max(Math.min(wMM, hMM), 0.1);
  const avgWidth = Math.sqrt(areaMM2) / Math.max((region.width + region.height) / 2 / pxPerMM, 0.1);

  if (areaMM2 < 5 || avgWidth < 1.5) {
    return 'running_stitch';
  } else if (areaMM2 < 30 || (aspect < 4 && avgWidth < 4)) {
    return 'satin';
  } else {
    return 'fill';
  }
}

// ============================================================
// GENERACIÓN DE FILL (Scanline con clipping point-in-polygon)
// ============================================================

function generateFillStitches(contour, region, mask, options) {
  const { stitchPX, fillAngle, pxPerMM } = options;
  const stitches = [];

  if (contour.length < 3) return stitches;

  const angleRad = (fillAngle * Math.PI) / 180;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  // 1. Rotar contorno al ángulo de fill
  let rMin = Infinity, rMax = -Infinity;
  const rotContour = contour.map(p => {
    const rx = p.x * cosA + p.y * sinA;
    const ry = -p.x * sinA + p.y * cosA;
    rMin = Math.min(rMin, ry);
    rMax = Math.max(rMax, ry);
    return { rx, ry };
  });

  const step = stitchPX;
  const scanlines = [];

  // 2. Generar scanlines paralelas al ángulo
  for (let r = rMin; r <= rMax; r += step) {
    const intersections = [];

    // Encontrar intersecciones con contorno
    for (let i = 0; i < rotContour.length - 1; i++) {
      const p1 = rotContour[i];
      const p2 = rotContour[i + 1];

      const minY = Math.min(p1.ry, p2.ry);
      const maxY = Math.max(p1.ry, p2.ry);

      if (r >= minY && r <= maxY) {
        if (Math.abs(p2.ry - p1.ry) > 1e-6) {
          const t = (r - p1.ry) / (p2.ry - p1.ry);
          const rx = p1.rx + t * (p2.rx - p1.rx);
          intersections.push(rx);
        }
      }
    }

    if (intersections.length >= 2) {
      intersections.sort((a, b) => a - b);
      scanlines.push({ r, intersections });
    }
  }

  // 3. Generar puntadas entre intersecciones
  for (const scanline of scanlines) {
    const { r, intersections } = scanline;

    // Procesar pares de intersecciones (entrada/salida)
    for (let i = 0; i < intersections.length - 1; i += 2) {
      const x1 = intersections[i];
      const x2 = intersections[i + 1];
      const lineLen = x2 - x1;

      if (lineLen < step * 0.5) continue;

      // Generar puntos cada stitchPX
      const numPoints = Math.max(2, Math.floor(lineLen / step) + 1);

      for (let j = 0; j < numPoints; j++) {
        const t = j / (numPoints - 1);
        const rx = x1 + t * lineLen;
        const ry = r;

        // 4. Rotar de vuelta a coordenadas originales
        const ox = rx * cosA - ry * sinA;
        const oy = rx * sinA + ry * cosA;

        // 5. Verificar point-in-polygon
        if (isPointInPolygon(ox, oy, contour)) {
          stitches.push({ x: ox, y: oy });
        }
      }
    }
  }

  // 6. Conectar scanlines en zigzag
  return zigzagConnectFillRows(stitches, step);
}

function zigzagConnectFillRows(stitches, step) {
  if (stitches.length < 2) return stitches;

  // Agrupar puntadas por fila Y (con tolerancia)
  const tolerance = step * 0.8;
  const rows = new Map();

  for (const s of stitches) {
    let foundRow = false;

    for (const [yKey, rowStitches] of rows) {
      if (Math.abs(s.y - yKey) < tolerance) {
        rowStitches.push(s);
        foundRow = true;
        break;
      }
    }

    if (!foundRow) {
      rows.set(s.y, [s]);
    }
  }

  // Ordenar filas por Y
  const sortedRows = Array.from(rows.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([_, stitches]) => stitches);

  // Alternar dirección en zigzag
  const result = [];
  for (let i = 0; i < sortedRows.length; i++) {
    const row = sortedRows[i];
    row.sort((a, b) => a.x - b.x);
    
    // Alternar dirección: par = izq→der, impar = der→izq
    if (i % 2 === 1) {
      row.reverse();
    }

    result.push(...row);
  }

  return result;
}

// ============================================================
// GENERACIÓN DE SATIN
// ============================================================

function generateSatinStitches(contour, stitchPX) {
  const stitches = [];
  if (contour.length < 3) return stitches;

  // Calcular centro geométrico
  const center = {
    x: contour.reduce((s, p) => s + p.x, 0) / contour.length,
    y: contour.reduce((s, p) => s + p.y, 0) / contour.length
  };

  // Offset interior (0.35mm típico)
  const offset = stitchPX * 0.5;

  // Crear contorno interior (offset hacia centro)
  const innerContour = contour.map(p => {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < 1) {
      return { x: p.x, y: p.y };
    }

    // Mover punto hacia centro por offset
    const factor = Math.max(0, (dist - offset) / dist);
    return {
      x: center.x + dx * factor,
      y: center.y + dy * factor
    };
  });

  // Resamplear ambos contornos a stitchPX (0.7mm)
  const outerResampled = resampleContour(contour, stitchPX);
  const innerResampled = resampleContour(innerContour, stitchPX);

  // Alternar exterior → interior → exterior
  const count = Math.min(outerResampled.length, innerResampled.length);
  for (let i = 0; i < count; i++) {
    stitches.push(outerResampled[i]);
    stitches.push(innerResampled[i]);
  }

  return stitches;
}

// ============================================================
// GENERACIÓN DE RUN
// ============================================================

function generateRunStitches(contour, stitchPX) {
  return resampleContour(contour, stitchPX);
}

// ============================================================
// RESAMPLEAR CONTORNO
// ============================================================

function resampleContour(points, step) {
  if (points.length < 2) return points;

  let totalLen = 0;
  const lengths = [0];

  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i-1].x;
    const dy = points[i].y - points[i-1].y;
    totalLen += Math.sqrt(dx * dx + dy * dy);
    lengths.push(totalLen);
  }

  if (totalLen < step) return [points[0]];

  const numPoints = Math.max(2, Math.floor(totalLen / step) + 1);
  const result = [];

  for (let i = 0; i < numPoints; i++) {
    const targetDist = (i / (numPoints - 1)) * totalLen;

    let segIdx = 0;
    for (let j = 1; j < lengths.length; j++) {
      if (lengths[j] >= targetDist) {
        segIdx = j - 1;
        break;
      }
    }

    const segStart = points[segIdx];
    const segEnd = points[segIdx + 1] || points[points.length - 1];
    const segLen = lengths[segIdx + 1] - lengths[segIdx];

    if (segLen < 1e-6) {
      result.push({ ...segStart });
    } else {
      const t = (targetDist - lengths[segIdx]) / segLen;
      result.push({
        x: segStart.x + t * (segEnd.x - segStart.x),
        y: segStart.y + t * (segEnd.y - segStart.y)
      });
    }
  }

  return result;
}

// ============================================================
// POINT-IN-POLYGON (Ray Casting)
// ============================================================

function isPointInPolygon(x, y, polygon) {
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    if (((yi > y) !== (yj > y)) && 
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

// ============================================================
// UTILIDADES
// ============================================================

function generateRegionName(region, type) {
  const colorNames = [
    'negro', 'rojo', 'rosa', 'azul', 'verde', 'amarillo',
    'naranja', 'morado', 'cafe', 'blanco', 'gris', 'cyan'
  ];

  const typeSuffix = type === 'fill' ? 'fill' : type === 'satin' ? 'sat' : 'run';
  const colorName = colorNames[region.colorIdx % colorNames.length] || 'color';

  return `${colorName}_${typeSuffix}`;
}

export default robustVectorization;