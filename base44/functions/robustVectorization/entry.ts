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
      apply_pipeline = true
    } = await req.json();

    if (!pixels || !width || !height) {
      return Response.json({ error: 'Missing pixels, width, or height' }, { status: 400 });
    }

    const pixelArray = new Uint8ClampedArray(pixels);
    const px_to_mm_x = width_mm / width;
    const px_to_mm_y = height_mm / height;

    // ─── PASO 1: CUANTIZACIÓN DE COLOR ────────────────────────────────────
    const maxColors = Math.min(Math.max(color_count || 6, 3), 10);
    const dominantColors = extractDominantColors(pixelArray, width, height, maxColors);

    if (dominantColors.length === 0) {
      return Response.json({
        success: false,
        error: 'No valid colors detected',
        data: { regions: [], total_stitches: 0 }
      }, { status: 422 });
    }

    // ─── PASO 2: DETECTAR REGIONES CONECTADAS POR FLOOD FILL ───────────────
    const allRegions = [];
    const visited = new Set();

    for (const colorHex of dominantColors) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const key = `${x},${y}`;
          if (visited.has(key)) continue;

          const pixelColor = getPixelColor(pixelArray, x, y, width);
          if (pixelColor !== colorHex) continue;

          // Flood fill para encontrar región conectada
          const regionPixels = floodFill(pixelArray, x, y, colorHex, width, height, visited);
          if (regionPixels.length < 15) continue; // Ignorar ruido

          // Extraer contorno de la región
          const contour = extractContour(regionPixels, width, height);
          if (contour.length < 3) continue;

          // Clasificar tipo de puntada
          const bounds = getBounds(regionPixels);
          const area_px = regionPixels.length;
          const area_mm2 = area_px * px_to_mm_x * px_to_mm_y;
          const stitchType = classifyStitchType(bounds, area_mm2, width, height);

          // Simplificar contorno
          const tolerance_px = 0.5 / Math.sqrt(px_to_mm_x * px_to_mm_y);
          const simplifiedContour = simplifyContour(contour, tolerance_px);

          if (simplifiedContour.length < 3) continue;

          // ─── PASO 3: PROCESAR REGIÓN INDEPENDIENTEMENTE ─────────────────

          let stitches = [];
          if (stitchType === 'fill') {
            stitches = generateFillStitches(
              simplifiedContour,
              regionPixels,
              bounds,
              { angle: 45, density: 0.7, px_to_mm_x, px_to_mm_y }
            );
          } else if (stitchType === 'satin') {
            stitches = generateSatinStitches(
              simplifiedContour,
              { density: 0.5, px_to_mm_x, px_to_mm_y }
            );
          } else {
            stitches = generateRunStitches(
              simplifiedContour,
              { density: 1.0, px_to_mm_x, px_to_mm_y }
            );
          }

          if (stitches.length === 0) continue;

          const perimeter_px = estimatePerimeter(simplifiedContour);
          const perimeter_mm = perimeter_px * Math.sqrt(px_to_mm_x * px_to_mm_y);

          allRegions.push({
            id: `r${allRegions.length}`,
            name: `${colorHex.slice(1, 4)}_${stitchType[0]}`,
            color: colorHex,
            stitch_type: stitchType,
            density: stitchType === 'fill' ? 0.7 : stitchType === 'satin' ? 0.5 : 1.0,
            angle: stitchType === 'fill' ? 45 : 0,
            path_points: normalizeContour(simplifiedContour, width, height),
            area_mm2,
            perimeter_mm,
            stitch_count: stitches.length,
            visible: true
          });
        }
      }
    }

    if (allRegions.length === 0) {
      return Response.json({
        success: false,
        error: 'No valid regions extracted',
        data: { regions: [], total_stitches: 0 }
      }, { status: 422 });
    }

    const totalStitches = allRegions.reduce((s, r) => s + (r.stitch_count || 0), 0);

    return Response.json({
      success: true,
      data: {
        regions: allRegions,
        total_stitches: totalStitches,
        colors_used: dominantColors.length,
        generation_method: 'region_based_scanline_vectorization',
        vector_source: true
      }
    });

  } catch (error) {
    console.error('Vectorization error:', error.message);
    return Response.json({
      success: false,
      error: error.message,
      data: { regions: [], total_stitches: 0 }
    }, { status: 422 });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

function extractDominantColors(pixelArray, width, height, maxColors) {
  const colorCounts = new Map();

  for (let i = 0; i < pixelArray.length; i += 4) {
    const a = pixelArray[i + 3];
    if (a < 128) continue;

    const r = pixelArray[i];
    const g = pixelArray[i + 1];
    const b = pixelArray[i + 2];
    const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
  }

  return Array.from(colorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxColors)
    .map(([hex]) => hex);
}

function getPixelColor(pixelArray, x, y, width) {
  const idx = (y * width + x) * 4;
  const r = pixelArray[idx];
  const g = pixelArray[idx + 1];
  const b = pixelArray[idx + 2];
  const a = pixelArray[idx + 3];
  if (a < 128) return null;
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function floodFill(pixelArray, startX, startY, targetColor, width, height, visited) {
  const queue = [{ x: startX, y: startY }];
  const region = [];

  while (queue.length > 0) {
    const { x, y } = queue.shift();
    const key = `${x},${y}`;

    if (visited.has(key)) continue;
    if (y < 0 || y >= height || x < 0 || x >= width) continue;

    const pixelColor = getPixelColor(pixelArray, x, y, width);
    if (pixelColor !== targetColor) continue;

    visited.add(key);
    region.push({ x, y });

    queue.push({ x: x + 1, y });
    queue.push({ x: x - 1, y });
    queue.push({ x, y: y + 1 });
    queue.push({ x, y: y - 1 });
  }

  return region;
}

function getBounds(pixels) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pixels) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function extractContour(pixels, width, height) {
  const pixelSet = new Set(pixels.map(p => `${p.x},${p.y}`));
  const contour = [];

  for (const p of pixels) {
    const neighbors = [
      { x: p.x, y: p.y - 1 },
      { x: p.x + 1, y: p.y },
      { x: p.x, y: p.y + 1 },
      { x: p.x - 1, y: p.y }
    ];

    let isEdge = false;
    for (const n of neighbors) {
      if (!pixelSet.has(`${n.x},${n.y}`)) {
        isEdge = true;
        break;
      }
    }

    if (isEdge) contour.push(p);
  }

  return orderContourPoints(contour);
}

function orderContourPoints(contour) {
  if (contour.length === 0) return [];

  const ordered = [contour[0]];
  const remaining = new Set(contour.slice(1).map((p, i) => i + 1));

  while (remaining.size > 0) {
    const last = ordered[ordered.length - 1];
    let nearest = -1;
    let minDist = Infinity;

    for (const idx of remaining) {
      const p = contour[idx];
      const dist = Math.hypot(p.x - last.x, p.y - last.y);
      if (dist < minDist) {
        minDist = dist;
        nearest = idx;
      }
    }

    if (nearest >= 0) {
      ordered.push(contour[nearest]);
      remaining.delete(nearest);
    } else {
      break;
    }
  }

  return ordered;
}

function classifyStitchType(bounds, area_mm2, width, height) {
  const w_px = bounds.maxX - bounds.minX + 1;
  const h_px = bounds.maxY - bounds.minY + 1;
  const minDim = Math.min(w_px, h_px);

  if (area_mm2 < 10) return 'running_stitch';
  if (area_mm2 < 50 || minDim < 6) return 'satin';
  return 'fill';
}

function simplifyContour(contour, tolerance) {
  if (contour.length <= 2) return contour;

  const simplified = [contour[0]];
  let start = 0;

  for (let i = 1; i < contour.length - 1; i++) {
    const dist = pointToLineDistance(contour[i], contour[start], contour[i + 1]);
    if (dist > tolerance) {
      simplified.push(contour[i]);
      start = i;
    }
  }

  simplified.push(contour[contour.length - 1]);

  // Cerrar loop
  if (simplified[0].x !== simplified[simplified.length - 1].x ||
      simplified[0].y !== simplified[simplified.length - 1].y) {
    simplified.push({ x: simplified[0].x, y: simplified[0].y });
  }

  return simplified;
}

function pointToLineDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(point.x - projX, point.y - projY);
}

function generateFillStitches(contour, regionPixels, bounds, options) {
  const { angle, density, px_to_mm_x, px_to_mm_y } = options;
  const stitches = [];
  const pixelSet = new Set(regionPixels.map(p => `${p.x},${p.y}`));

  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Spacing en píxeles
  const spacing_px = Math.max(1, density / Math.sqrt(px_to_mm_x * px_to_mm_y));

  // Bounding box rotado
  const corners = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY }
  ];

  let minRy = Infinity, maxRy = -Infinity;
  for (const c of corners) {
    const ry = -c.x * sin + c.y * cos;
    minRy = Math.min(minRy, ry);
    maxRy = Math.max(maxRy, ry);
  }

  // Scanlines
  for (let ry = minRy; ry <= maxRy; ry += spacing_px) {
    const intersections = findScanlineIntersections(contour, ry, rad);
    intersections.sort((a, b) => a - b);

    for (let i = 0; i < intersections.length - 1; i += 2) {
      const x1 = intersections[i];
      const x2 = intersections[i + 1];

      const lineStitches = interpolateLine(x1, ry, x2, ry, spacing_px, rad);

      for (const pt of lineStitches) {
        const px = Math.round(pt.x);
        const py = Math.round(pt.y);

        // CLIPPING: validar que el punto está en la máscara de región
        if (pixelSet.has(`${px},${py}`)) {
          stitches.push([pt.x, pt.y]);
        }
      }
    }
  }

  return stitches;
}

function findScanlineIntersections(contour, scanY, angle) {
  const intersections = [];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  for (let i = 0; i < contour.length - 1; i++) {
    const p1 = contour[i];
    const p2 = contour[i + 1];

    const ry1 = -p1.x * sin + p1.y * cos;
    const ry2 = -p2.x * sin + p2.y * cos;

    if ((ry1 <= scanY && ry2 > scanY) || (ry2 <= scanY && ry1 > scanY)) {
      const t = (scanY - ry1) / (ry2 - ry1);
      const rx = p1.x * cos + p1.y * sin + t * ((p2.x * cos + p2.y * sin) - (p1.x * cos + p1.y * sin));
      intersections.push(rx);
    }
  }

  return intersections;
}

function interpolateLine(x1, y1, x2, y2, step, angle) {
  const points = [];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const count = Math.max(1, Math.floor(dist / step));

  for (let i = 0; i <= count; i++) {
    const t = count > 0 ? i / count : 0;
    const rx = x1 + (x2 - x1) * t;
    const ry = y1 + (y2 - y1) * t;

    // Rotar de vuelta a coordenadas originales
    const x = rx * cos - ry * sin;
    const y = rx * sin + ry * cos;

    points.push({ x, y });
  }

  return points;
}

function generateSatinStitches(contour, options) {
  const { density, px_to_mm_x, px_to_mm_y } = options;
  const stitches = [];
  const spacing_px = Math.max(1, density / Math.sqrt(px_to_mm_x * px_to_mm_y));

  const points = resampleContour(contour, spacing_px);

  for (let i = 0; i < points.length; i++) {
    stitches.push([points[i].x, points[i].y]);
  }

  return stitches;
}

function generateRunStitches(contour, options) {
  const { density, px_to_mm_x, px_to_mm_y } = options;
  const spacing_px = Math.max(1, density / Math.sqrt(px_to_mm_x * px_to_mm_y));
  const points = resampleContour(contour, spacing_px);
  return points.map(p => [p.x, p.y]);
}

function resampleContour(contour, step) {
  const points = [];
  let accDist = 0;

  for (let i = 0; i < contour.length - 1; i++) {
    const p1 = contour[i];
    const p2 = contour[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy);

    if (dist === 0) continue;

    const steps = Math.ceil(dist / step);
    for (let j = 0; j <= steps; j++) {
      const t = steps > 0 ? j / steps : 0;
      points.push({
        x: p1.x + t * dx,
        y: p1.y + t * dy
      });
    }
  }

  return points;
}

function normalizeContour(contour, width, height) {
  return contour.map(p => [p.x / width, p.y / height]);
}

function estimatePerimeter(contour) {
  let perim = 0;
  for (let i = 0; i < contour.length - 1; i++) {
    const p1 = contour[i];
    const p2 = contour[i + 1];
    perim += Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }
  return perim;
}