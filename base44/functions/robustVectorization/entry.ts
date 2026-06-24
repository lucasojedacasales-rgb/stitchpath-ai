import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Motor de Vectorización 100% JavaScript Puro para Deno
 * Basado en algoritmo Marching Squares + Scanline Fill
 * Sin dependencias externas
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      pixels,
      width,
      height,
      width_mm = 100,
      height_mm = 100,
      color_count = 6,
      stitch_density = 0.7,
      fill_angle = 45
    } = await req.json();

    if (!pixels || !width || !height) {
      return Response.json({ error: 'Missing image data' }, { status: 400 });
    }

    console.log(`[VECTORIZER] Input: ${width}×${height}px → ${width_mm}×${height_mm}mm, ${color_count} colors`);

    // Convertir array de pixels a Uint8ClampedArray si es necesario
    const pixelArray = new Uint8ClampedArray(pixels);

    // ──────────────────────────────────────────────────────────────────────────
    // PASO 1: Cuantización de Color (K-means)
    // ──────────────────────────────────────────────────────────────────────────
    const { quantized, palette } = quantizeColors(pixelArray, width, height, color_count);

    // ──────────────────────────────────────────────────────────────────────────
    // PASO 2: Detectar Regiones Conectadas (Flood Fill)
    // ──────────────────────────────────────────────────────────────────────────
    const regions = findConnectedRegions(quantized, palette, width, height);
    console.log(`[VECTORIZER] Detected ${regions.length} regions`);

    // ──────────────────────────────────────────────────────────────────────────
    // PASO 3: Procesar cada región → Contornos → Puntadas
    // ──────────────────────────────────────────────────────────────────────────
    const pxPerMM = width / width_mm;
    const stitchPX = stitch_density * pxPerMM;

    const processedRegions = [];
    let totalStitches = 0;

    for (const region of regions) {
      try {
        const regionData = processRegion(region, {
          width,
          height,
          pxPerMM,
          stitchPX,
          fillAngle: fill_angle,
          widthMM: width_mm,
          heightMM: height_mm
        });

        if (regionData.stitches && regionData.stitches.length >= 2) {
          processedRegions.push({
            id: regionData.id,
            name: regionData.name,
            color: `#${regionData.color.r.toString(16).padStart(2, '0')}${regionData.color.g.toString(16).padStart(2, '0')}${regionData.color.b.toString(16).padStart(2, '0')}`,
            stitch_type: regionData.type,
            stitches: regionData.stitches,
            pointCount: regionData.pointCount,
            path_points: regionData.pathPoints || [],
            visible: true
          });

          totalStitches += regionData.pointCount;
        }
      } catch (err) {
        console.warn(`[VECTORIZER] Region processing error:`, err.message);
      }
    }

    console.log(`[VECTORIZER] SUCCESS: ${processedRegions.length} regions, ${totalStitches} stitches`);

    return Response.json({
      success: true,
      data: {
        regions: processedRegions,
        total_stitches: totalStitches,
        colors_used: palette.length,
        generation_method: 'native_javascript_puro',
        vector_source: true,
        diagnostics: {
          regionsDetected: processedRegions.length,
          totalStitches,
          colorsUsed: palette.length,
          errors: []
        }
      }
    });

  } catch (error) {
    console.error('[VECTORIZER] ERROR:', error.message);
    return Response.json({
      success: false,
      error: error.message,
      data: { regions: [], total_stitches: 0, diagnostics: { errors: [error.message] } }
    }, { status: 500 });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 1: CUANTIZACIÓN DE COLOR (K-means simplificado)
// ═══════════════════════════════════════════════════════════════════════════════

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

  // Extraer colores únicos ordenados por frecuencia
  const uniqueColors = Array.from(colorFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => {
      const [r, g, b] = key.split(',').map(Number);
      return { r, g, b };
    });

  if (uniqueColors.length <= k) {
    // Si hay menos colores que k, usarlos todos
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

  // K-means simplificado para reducir colores
  let palette = initializePalette(uniqueColors, k);

  // Iteraciones de k-means (3-5 son suficientes)
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

    // Recalcular centroides
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
  return (dr * dr * 0.299) + (dg * dg * 0.587) + (db * db * 0.114);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 2: DETECTAR REGIONES CONECTADAS (Flood Fill)
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 3: PROCESAR CADA REGIÓN
// ═══════════════════════════════════════════════════════════════════════════════

function processRegion(region, options) {
  const { pxPerMM, stitchPX, fillAngle, widthMM, heightMM } = options;

  // Crear máscara binaria
  const mask = createRegionMask(region);

  // Extraer contorno
  const contour = extractContour(region, mask);

  if (contour.length < 3) {
    return { ...region, type: 'run', stitches: [], pointCount: 0, pathPoints: [] };
  }

  // Simplificar contorno
  const simplifiedContour = simplifyContour(contour, 1.0 * pxPerMM);

  // Cerrar loop
  if (simplifiedContour.length > 0) {
    const first = simplifiedContour[0];
    const last = simplifiedContour[simplifiedContour.length - 1];
    if (first.x !== last.x || first.y !== last.y) {
      simplifiedContour.push({ ...first });
    }
  }

  // Clasificar tipo
  const regionType = classifyRegion(region, pxPerMM);

  // Generar puntadas
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
    p.x / options.width,
    p.y / options.height
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

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRACTOR DE CONTORNO
// ═══════════════════════════════════════════════════════════════════════════════

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

  const ordered = [points[0]];
  const remaining = points.slice(1);

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const dx = remaining[i].x - last.x;
      const dy = remaining[i].y - last.y;
      const dist = dx * dx + dy * dy;

      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    ordered.push(remaining[nearestIdx]);
    remaining.splice(nearestIdx, 1);
  }

  return ordered;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIMPLIFICACIÓN (Ramer-Douglas-Peucker)
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// CLASIFICACIÓN DE REGIÓN
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// GENERACIÓN DE FILL (Scanline con clipping)
// ═══════════════════════════════════════════════════════════════════════════════

function generateFillStitches(contour, region, mask, options) {
  const { stitchPX, fillAngle, pxPerMM } = options;
  const stitches = [];

  if (contour.length < 3) return stitches;

  const angleRad = (fillAngle * Math.PI) / 180;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  let rMin = Infinity, rMax = -Infinity;
  const rotContour = contour.map(p => {
    const rx = p.x * cosA + p.y * sinA;
    const ry = -p.x * sinA + p.y * cosA;
    rMin = Math.min(rMin, ry);
    rMax = Math.max(rMax, ry);
    return { rx, ry, ox: p.x, oy: p.y };
  });

  const step = stitchPX;

  for (let r = rMin; r <= rMax; r += step) {
    const intersections = [];

    for (let i = 0; i < rotContour.length - 1; i++) {
      const p1 = rotContour[i];
      const p2 = rotContour[i + 1];

      if ((p1.ry <= r && p2.ry > r) || (p2.ry <= r && p1.ry > r)) {
        if (Math.abs(p2.ry - p1.ry) > 1e-6) {
          const t = (r - p1.ry) / (p2.ry - p1.ry);
          const rx = p1.rx + t * (p2.rx - p1.rx);
          intersections.push(rx);
        }
      }
    }

    if (intersections.length < 2) continue;
    intersections.sort((a, b) => a - b);

    for (let i = 0; i < intersections.length - 1; i += 2) {
      const x1 = intersections[i];
      const x2 = intersections[i + 1];
      const lineLen = x2 - x1;

      if (lineLen < step) continue;

      const numPoints = Math.max(2, Math.floor(lineLen / step) + 1);

      for (let j = 0; j < numPoints; j++) {
        const t = j / (numPoints - 1);
        const rx = x1 + t * lineLen;
        const ry = r;

        const ox = rx * cosA - ry * sinA;
        const oy = rx * sinA + ry * cosA;

        if (isPointInPolygon(ox, oy, contour)) {
          stitches.push({ x: ox, y: oy });
        }
      }
    }
  }

  return zigzagConnect(stitches, step);
}

function zigzagConnect(stitches, step) {
  if (stitches.length < 2) return stitches;

  const rows = new Map();

  for (const s of stitches) {
    const yKey = Math.round(s.y / (step * 2));
    if (!rows.has(yKey)) rows.set(yKey, []);
    rows.get(yKey).push(s);
  }

  const sortedRows = Array.from(rows.entries()).sort((a, b) => a[0] - b[0]);
  const result = [];

  for (let i = 0; i < sortedRows.length; i++) {
    const row = sortedRows[i][1];
    row.sort((a, b) => a.x - b.x);
    if (i % 2 === 1) row.reverse();
    result.push(...row);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GENERACIÓN DE SATIN
// ═══════════════════════════════════════════════════════════════════════════════

function generateSatinStitches(contour, stitchPX) {
  const stitches = [];
  if (contour.length < 3) return stitches;

  const center = {
    x: contour.reduce((s, p) => s + p.x, 0) / contour.length,
    y: contour.reduce((s, p) => s + p.y, 0) / contour.length
  };

  const offset = stitchPX * 0.5;
  const innerContour = contour.map(p => {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return { x: p.x, y: p.y };
    const factor = Math.max(0, (dist - offset) / dist);
    return { x: center.x + dx * factor, y: center.y + dy * factor };
  });

  const outerResampled = resampleContour(contour, stitchPX);
  const innerResampled = resampleContour(innerContour, stitchPX);

  const count = Math.min(outerResampled.length, innerResampled.length);

  for (let i = 0; i < count; i++) {
    stitches.push(outerResampled[i]);
    stitches.push(innerResampled[i]);
  }

  return stitches;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GENERACIÓN DE RUN
// ═══════════════════════════════════════════════════════════════════════════════

function generateRunStitches(contour, stitchPX) {
  return resampleContour(contour, stitchPX);
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESAMPLEAR CONTORNO
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// POINT-IN-POLYGON (Ray Casting)
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════════════════════════

function generateRegionName(region, type) {
  const colorNames = [
    'negro', 'rojo', 'rosa', 'azul', 'verde', 'amarillo',
    'naranja', 'morado', 'cafe', 'blanco', 'gris', 'cyan'
  ];

  const typeSuffix = type === 'fill' ? 'fill' : type === 'satin' ? 'sat' : 'run';
  const colorName = colorNames[region.colorIdx % colorNames.length] || 'color';

  return `${colorName}_${typeSuffix}`;
}