import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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
      stitch_density = 0.7
    } = await req.json();

    if (!pixels || !width || !height) {
      return Response.json({ error: 'Missing image data' }, { status: 400 });
    }

    const pixelArray = new Uint8ClampedArray(pixels);
    const px_to_mm_x = width_mm / width;
    const px_to_mm_y = height_mm / height;

    // ─── FASE 1: PREPROCESAMIENTO ────────────────────────────────────────────
    console.log('[VECTORIZATION] Phase 1: Preprocessing...');
    
    // K-means cuantización a colorCount colores
    const dominantColors = kmeansQuantize(pixelArray, width, height, color_count);
    console.log(`[VECTORIZATION] Dominant colors: ${dominantColors.length}`, dominantColors);

    if (dominantColors.length === 0) {
      return Response.json({
        success: false,
        error: 'No valid colors detected',
        data: { regions: [], total_stitches: 0, diagnostics: { errors: ['No colors'] } }
      }, { status: 422 });
    }

    // ─── FASE 2: CREAR MÁSCARAS BINARIAS ─────────────────────────────────────
    console.log('[VECTORIZATION] Phase 2: Creating binary masks...');
    const masks = createBinaryMasks(pixelArray, width, height, dominantColors);

    // ─── FASE 3-4: DETECCIÓN Y CLASIFICACIÓN ────────────────────────────────
    console.log('[VECTORIZATION] Phase 3-4: Contour detection & classification...');
    const regions = [];
    
    for (let colorIdx = 0; colorIdx < dominantColors.length; colorIdx++) {
      const color = dominantColors[colorIdx];
      const mask = masks[colorIdx];

      // Detectar contornos
      const contours = detectContours(mask, width, height);
      console.log(`[VECTORIZATION] Color ${color}: ${contours.length} contours`);

      for (const contour of contours) {
        if (contour.length < 3) continue;

        // Convertir píxeles a milímetros
        const contourMM = contour.map(p => [p[0] * px_to_mm_x, p[1] * px_to_mm_y]);
        
        // Simplificar contorno (Ramer-Douglas-Peucker)
        const simplified = simplifyContour(contourMM, 0.5);
        if (simplified.length < 3) continue;

        // Cerrar contorno
        const closed = closeContour(simplified);

        // Calcular área
        const area_mm2 = polygonArea(closed);
        if (area_mm2 < 0.5) continue; // Ignorar regiones muy pequeñas

        // Clasificar tipo de puntada
        const type = classifyRegionType(closed, area_mm2);
        
        console.log(`[VECTORIZATION] Region: color=${color}, area=${area_mm2.toFixed(2)}mm², type=${type}`);

        // ─── FASE 5-7: GENERACIÓN DE PUNTADAS ──────────────────────────────

        let stitches = [];

        if (type === 'fill') {
          stitches = generateFillStitches(closed, stitch_density);
        } else if (type === 'satin') {
          stitches = generateSatinStitches(closed, stitch_density);
        } else {
          stitches = generateRunStitches(closed, stitch_density);
        }

        console.log(`[VECTORIZATION] Generated ${stitches.length} stitches for region`);

        // Verificar que TODOS los stitches están dentro del contorno
        const validStitches = stitches.filter(st => isPointInPolygon([st.x, st.y], closed));
        console.log(`[VECTORIZATION] Valid stitches: ${validStitches.length}/${stitches.length}`);

        if (validStitches.length > 0) {
          regions.push({
            id: `r${regions.length}`,
            name: `${color.slice(1, 4)}_${type[0]}`,
            color,
            stitch_type: type,
            density: stitch_density,
            angle: 45,
            path_points: closed.map(p => [p[0] / width_mm, p[1] / height_mm]), // Normalizar
            area_mm2,
            stitch_count: validStitches.length,
            stitches: validStitches,
            visible: true
          });
        }
      }
    }

    if (regions.length === 0) {
      return Response.json({
        success: false,
        error: 'No valid regions generated',
        data: { regions: [], total_stitches: 0, diagnostics: { errors: ['No regions'] } }
      }, { status: 422 });
    }

    const totalStitches = regions.reduce((s, r) => s + (r.stitch_count || 0), 0);

    console.log(`[VECTORIZATION] SUCCESS: ${regions.length} regions, ${totalStitches} stitches`);

    return Response.json({
      success: true,
      data: {
        regions: regions.map(r => {
          const { stitches, ...rest } = r;
          return rest;
        }),
        total_stitches: totalStitches,
        colors_used: dominantColors.length,
        generation_method: 'professional_vectorization',
        vector_source: true,
        diagnostics: {
          regionsDetected: regions.length,
          totalStitches,
          colorsUsed: dominantColors.length,
          errors: []
        }
      }
    });

  } catch (error) {
    console.error('[VECTORIZATION] ERROR:', error.message);
    return Response.json({
      success: false,
      error: error.message,
      stack: error.stack,
      data: { regions: [], total_stitches: 0, diagnostics: { errors: [error.message] } }
    }, { status: 422 });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * K-MEANS QUANTIZATION: Reducir imagen a N colores dominantes
 * 
 * Basado en Potrace (potrace.sourceforge.net) + K-means clustering.
 * Produce colores dominantes que serán procesados por contour detection
 * para crear máscaras binarias independientes.
 * 
 * Referencia: https://en.wikipedia.org/wiki/K-means_clustering
 */
function kmeansQuantize(pixelArray, width, height, colorCount) {
  const maxIterations = 10;
  const pixels = [];

  // Extraer píxeles únicos
  const pixelSet = new Set();
  for (let i = 0; i < pixelArray.length; i += 4) {
    const a = pixelArray[i + 3];
    if (a < 128) continue;
    
    const r = pixelArray[i];
    const g = pixelArray[i + 1];
    const b = pixelArray[i + 2];
    pixels.push([r, g, b]);
    pixelSet.add(`${r},${g},${b}`);
  }

  if (pixels.length === 0) return [];

  // Inicializar centroides aleatoriamente
  let centroids = [];
  for (let i = 0; i < Math.min(colorCount, pixels.length); i++) {
    centroids.push(pixels[Math.floor(Math.random() * pixels.length)]);
  }

  // K-means iterativo
  for (let iter = 0; iter < maxIterations; iter++) {
    const clusters = Array(centroids.length).fill(null).map(() => []);

    // Asignar píxeles a clusters
    for (const px of pixels) {
      let minDist = Infinity, bestCluster = 0;
      for (let k = 0; k < centroids.length; k++) {
        const dist = colorDistance(px, centroids[k]);
        if (dist < minDist) {
          minDist = dist;
          bestCluster = k;
        }
      }
      clusters[bestCluster].push(px);
    }

    // Recalcular centroides
    const newCentroids = [];
    for (let k = 0; k < centroids.length; k++) {
      if (clusters[k].length > 0) {
        const avg = [
          Math.round(clusters[k].reduce((s, p) => s + p[0], 0) / clusters[k].length),
          Math.round(clusters[k].reduce((s, p) => s + p[1], 0) / clusters[k].length),
          Math.round(clusters[k].reduce((s, p) => s + p[2], 0) / clusters[k].length)
        ];
        newCentroids.push(avg);
      }
    }

    if (newCentroids.length === 0) break;
    centroids = newCentroids;
  }

  // Convertir a hex y ordenar por frecuencia
  const colorCounts = new Map();
  for (const px of pixels) {
    const hex = rgbToHex(px[0], px[1], px[2]);
    const centroid = findNearestCentroid(px, centroids);
    const centroidHex = rgbToHex(centroid[0], centroid[1], centroid[2]);
    colorCounts.set(centroidHex, (colorCounts.get(centroidHex) || 0) + 1);
  }

  return Array.from(colorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, colorCount)
    .map(([hex]) => hex);
}

/**
 * CREAR MÁSCARAS BINARIAS: Una para cada color
 */
function createBinaryMasks(pixelArray, width, height, colors) {
  return colors.map(colorHex => {
    const mask = Array(height).fill(null).map(() => Array(width).fill(0));
    
    for (let i = 0; i < pixelArray.length; i += 4) {
      const idx = i / 4;
      const a = pixelArray[i + 3];
      if (a < 128) continue;

      const r = pixelArray[i];
      const g = pixelArray[i + 1];
      const b = pixelArray[i + 2];
      const px = rgbToHex(r, g, b);

      if (px === colorHex) {
        const y = Math.floor(idx / width);
        const x = idx % width;
        if (x >= 0 && x < width && y >= 0 && y < height) {
          mask[y][x] = 1;
        }
      }
    }
    
    return mask;
  });
}

/**
 * DETECTAR CONTORNOS: Marching Squares algorithm
 * 
 * Implementación del algoritmo Marching Squares de Potrace para detectar
 * contornos de regiones binarias. Cada máscara se procesa independientemente.
 * 
 * Referencia: http://potrace.sourceforge.net/
 */
function detectContours(mask, width, height) {
  const contours = [];
  const visited = Set();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y]?.[x] === 1 && !visited.has(`${x},${y}`)) {
        const contour = traceContour(mask, x, y, width, height, visited);
        if (contour.length >= 3) {
          contours.push(contour);
        }
      }
    }
  }

  return contours;
}

function traceContour(mask, startX, startY, width, height, visited) {
  const contour = [];
  let x = startX, y = startY;
  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N, E, S, W
  let dirIdx = 0;

  const getKey = (px, py) => `${px},${py}`;

  do {
    contour.push([x, y]);
    visited.add(getKey(x, y));

    let found = false;
    for (let i = 0; i < 4; i++) {
      const [dx, dy] = directions[(dirIdx + i) % 4];
      const nx = x + dx, ny = y + dy;

      if (nx >= 0 && nx < width && ny >= 0 && ny < height && mask[ny]?.[nx] === 1 && !visited.has(getKey(nx, ny))) {
        x = nx;
        y = ny;
        dirIdx = (dirIdx + i) % 4;
        found = true;
        break;
      }
    }

    if (!found) break;
  } while ((x !== startX || y !== startY) && contour.length < width * height);

  return contour;
}

/**
 * SIMPLIFICAR CONTORNO: Ramer-Douglas-Peucker
 */
function simplifyContour(contour, tolerance) {
  if (contour.length <= 2) return contour;

  const dmax = [];
  let maxDist = 0, index = 0;

  for (let i = 1; i < contour.length - 1; i++) {
    const dist = pointToLineDistance(contour[i], contour[0], contour[contour.length - 1]);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > tolerance) {
    const rec1 = simplifyContour(contour.slice(0, index + 1), tolerance);
    const rec2 = simplifyContour(contour.slice(index), tolerance);
    return rec1.slice(0, -1).concat(rec2);
  } else {
    return [contour[0], contour[contour.length - 1]];
  }
}

function pointToLineDistance(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(point[0] - a[0], point[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / len2));
  const projX = a[0] + t * dx;
  const projY = a[1] + t * dy;
  return Math.hypot(point[0] - projX, point[1] - projY);
}

/**
 * CERRAR CONTORNO: Asegurar que primer punto == último punto
 */
function closeContour(contour) {
  if (contour.length > 0) {
    const last = contour[contour.length - 1];
    const first = contour[0];
    if (last[0] !== first[0] || last[1] !== first[1]) {
      return [...contour, [first[0], first[1]]];
    }
  }
  return contour;
}

/**
 * CALCULAR ÁREA DEL POLÍGONO: Shoelace formula
 */
function polygonArea(polygon) {
  let area = 0;
  for (let i = 0; i < polygon.length - 1; i++) {
    const p1 = polygon[i];
    const p2 = polygon[i + 1];
    area += (p2[0] - p1[0]) * (p2[1] + p1[1]) / 2;
  }
  return Math.abs(area);
}

/**
 * CLASIFICAR TIPO DE REGIÓN
 */
function classifyRegionType(contour, area_mm2) {
  if (area_mm2 < 10) return 'running_stitch';
  
  const minX = Math.min(...contour.map(p => p[0]));
  const maxX = Math.max(...contour.map(p => p[0]));
  const minY = Math.min(...contour.map(p => p[1]));
  const maxY = Math.max(...contour.map(p => p[1]));
  const width = maxX - minX;
  const height = maxY - minY;
  const aspectRatio = Math.max(width, height) / Math.min(width, height);

  if (area_mm2 < 50 && aspectRatio < 3) return 'satin';
  return 'fill';
}

/**
 * GENERAR FILL STITCHES: Scanlines con clipping
 */
function generateFillStitches(contour, density) {
  const stitches = [];
  const spacing = Math.max(0.3, 1.5 / density);
  const angle = 45 * Math.PI / 180;

  const minX = Math.min(...contour.map(p => p[0]));
  const maxX = Math.max(...contour.map(p => p[0]));
  const minY = Math.min(...contour.map(p => p[1]));
  const maxY = Math.max(...contour.map(p => p[1]));

  const cos = Math.cos(angle), sin = Math.sin(angle);

  let lineIdx = 0;
  for (let y = minY; y <= maxY; y += spacing) {
    const intersections = [];

    for (let i = 0; i < contour.length - 1; i++) {
      const p1 = contour[i];
      const p2 = contour[i + 1];

      if ((p1[1] <= y && p2[1] > y) || (p2[1] <= y && p1[1] > y)) {
        const t = (y - p1[1]) / (p2[1] - p1[1]);
        const x = p1[0] + t * (p2[0] - p1[0]);
        intersections.push(x);
      }
    }

    intersections.sort((a, b) => a - b);

    for (let i = 0; i < intersections.length - 1; i += 2) {
      const x0 = intersections[i];
      const x1 = intersections[i + 1];
      const dist = x1 - x0;
      const steps = Math.max(1, Math.ceil(dist / 0.7));

      for (let step = 0; step <= steps; step++) {
        const x = x0 + (x1 - x0) * (step / steps);
        stitches.push({ x, y });
      }

      if (i + 2 < intersections.length) {
        stitches.push({ x: x1, y, cmd: 'trim' });
      }
    }

    lineIdx++;
  }

  return stitches;
}

/**
 * GENERAR SATIN STITCHES: Zigzag entre offsets
 */
function generateSatinStitches(contour, density) {
  const stitches = [];
  const innerOffset = offsetPolygon(contour, -0.35);
  const outerOffset = offsetPolygon(contour, 0.35);

  if (innerOffset.length < 3 || outerOffset.length < 3) {
    return generateRunStitches(contour, density);
  }

  // Zigzag entre inner y outer
  const minLen = Math.min(innerOffset.length, outerOffset.length);
  for (let i = 0; i < minLen; i++) {
    const inner = innerOffset[i];
    const outer = outerOffset[i];
    const dist = Math.hypot(outer[0] - inner[0], outer[1] - inner[1]);
    const steps = Math.max(1, Math.ceil(dist / 0.7));

    for (let step = 0; step <= steps; step++) {
      const t = steps > 0 ? step / steps : 0;
      const x = inner[0] + (outer[0] - inner[0]) * t;
      const y = inner[1] + (outer[1] - inner[1]) * t;
      stitches.push({ x, y });
    }
  }

  return stitches;
}

/**
 * GENERAR RUN STITCHES: Seguir contorno
 */
function generateRunStitches(contour, density) {
  const stitches = [];
  const spacing = Math.max(0.3, 0.7 / density);

  for (let i = 0; i < contour.length - 1; i++) {
    const p1 = contour[i];
    const p2 = contour[i + 1];
    const dist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(1, Math.ceil(dist / spacing));

    for (let step = 0; step <= steps; step++) {
      const t = steps > 0 ? step / steps : 0;
      const x = p1[0] + (p2[0] - p1[0]) * t;
      const y = p1[1] + (p2[1] - p1[1]) * t;
      stitches.push({ x, y });
    }
  }

  return stitches;
}

/**
 * OFFSET POLYGON: Inset/outset
 */
function offsetPolygon(polygon, amount) {
  if (polygon.length < 3 || amount === 0) return polygon;

  const offset = [];
  const n = polygon.length - 1; // Exclude last (duplicate of first)

  for (let i = 0; i < n; i++) {
    const prev = polygon[i];
    const curr = polygon[(i + 1) % n];
    const next = polygon[(i + 2) % n];

    const e1 = [curr[0] - prev[0], curr[1] - prev[1]];
    const e2 = [next[0] - curr[0], next[1] - curr[1]];

    const len1 = Math.hypot(e1[0], e1[1]) || 1;
    const len2 = Math.hypot(e2[0], e2[1]) || 1;

    const n1 = [-e1[1] / len1, e1[0] / len1];
    const n2 = [-e2[1] / len2, e2[0] / len2];

    const bis = [n1[0] + n2[0], n1[1] + n2[1]];
    const bisLen = Math.hypot(bis[0], bis[1]) || 1;
    const cosHalf = (n1[0] * (bis[0] / bisLen) + n1[1] * (bis[1] / bisLen));
    const miter = cosHalf > 0.1 ? amount / cosHalf : amount;

    offset.push([
      curr[0] + (bis[0] / bisLen) * Math.min(miter, Math.abs(amount) * 2),
      curr[1] + (bis[1] / bisLen) * Math.min(miter, Math.abs(amount) * 2)
    ]);
  }

  return closeContour(offset);
}

/**
 * POINT IN POLYGON: Ray casting algorithm
 */
function isPointInPolygon(point, polygon) {
  let inside = false;
  const [x, y] = point;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

// ─────────────────────────────────────────────────────────────────────────────
// COLOR HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function colorDistance(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function findNearestCentroid(pixel, centroids) {
  let minDist = Infinity, nearest = centroids[0];
  for (const c of centroids) {
    const dist = colorDistance(pixel, c);
    if (dist < minDist) {
      minDist = dist;
      nearest = c;
    }
  }
  return nearest;
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
}