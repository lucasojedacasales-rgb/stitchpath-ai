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
      stitch_density = 0.7,
      fill_angle = 45
    } = await req.json();

    // ─── INFORME DE VECTORIZACIÓN ────────────────────────────────────────────
    const vectorReport = {
      timestamp: new Date().toISOString(),
      regionsProcessed: [],
      totalPointsDetected: 0,
      totalContoursDetected: 0,
      emptyContours: 0,
      invalidPolygons: 0,
      joinErrors: [],
      errors: []
    };

    if (!pixels || !width || !height) {
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const pixelArray = new Uint8ClampedArray(pixels);
    const px_to_mm_x = width_mm / width;
    const px_to_mm_y = height_mm / height;

    const diagnostics = {
      regionsDetected: 0,
      regionsValid: 0,
      regionsRepaired: 0,
      stitchesOutOfBounds: 0,
      totalStitches: 0,
      jumps: 0,
      colorChanges: 0,
      avgDensity: stitch_density,
      estimatedTime: 0,
      errors: [],
      warnings: []
    };

    // ─── FASE 1: PREPROCESADO ────────────────────────────────────────────────
    console.log('FASE 1: Preprocesado...');

    const maxColors = Math.min(Math.max(color_count || 6, 3), 10);
    const dominantColors = extractDominantColors(pixelArray, width, height, maxColors);

    if (dominantColors.length === 0) {
      diagnostics.errors.push('No se detectaron colores válidos en la imagen');
      return Response.json({
        success: false,
        error: 'No valid colors detected',
        data: { regions: [], total_stitches: 0, diagnostics }
      }, { status: 422 });
    }

    // ─── FASE 2-3: VECTORIZACIÓN + VALIDACIÓN ────────────────────────────────
    console.log('FASE 2-3: Vectorización y validación...');

    const allRegions = [];
    const visited = new Set();

    for (const colorHex of dominantColors) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const key = `${x},${y}`;
          if (visited.has(key)) continue;

          const pixelColor = getPixelColor(pixelArray, x, y, width);
          if (pixelColor !== colorHex) continue;

          // Flood fill
          const regionPixels = floodFill(pixelArray, x, y, colorHex, width, height, visited);
          if (regionPixels.length < 20) continue;

          diagnostics.regionsDetected++;

          const contour = extractAndValidateContour(regionPixels, width, height);
          
          console.log('VECTORIZE DEBUG - CONTOUR EXTRACTION', {
            regionId: `r${allRegions.length}`,
            colorHex,
            pixelCount: regionPixels.length,
            contour: contour ? `${contour.length} points` : 'NULL',
            isValid: contour && contour.length >= 3
          });

          if (!contour || contour.length < 3) {
            vectorReport.emptyContours++;
            console.error('Invalid contour detected', {
              regionId: `r${allRegions.length}`,
              colorHex,
              contourLength: contour ? contour.length : 0
            });
            continue;
          }

          const bounds = getBounds(regionPixels);
          const area_px = regionPixels.length;
          const area_mm2 = area_px * px_to_mm_x * px_to_mm_y;

          if (area_mm2 < 2) continue;

          // Clasificar
          const stitchType = classifyStitchType(bounds, area_mm2, width, height);

          // Simplificar
          const tolerance_px = 0.5 / Math.sqrt(px_to_mm_x * px_to_mm_y);
          const simplifiedContour = simplifyContour(contour, tolerance_px);

          if (simplifiedContour.length < 3) continue;

          // Validación y reparación
          if (!Array.isArray(simplifiedContour)) {
            console.error('INVALID SIMPLIFIED CONTOUR', {
              regionId: `r${allRegions.length}`,
              colorHex,
              type: typeof simplifiedContour,
              value: simplifiedContour
            });
            vectorReport.invalidPolygons++;
            continue;
          }

          const validation = validateAndRepairPolygon(simplifiedContour);
          
          if (!validation || !validation.valid) {
            console.error('POLYGON VALIDATION FAILED', {
              regionId: `r${allRegions.length}`,
              colorHex,
              validationResult: validation
            });
            vectorReport.invalidPolygons++;
            diagnostics.warnings.push(`Región ${colorHex} no pudo repararse`);
            continue;
          }

          if (validation.repaired) {
            diagnostics.regionsRepaired++;
          }

          diagnostics.regionsValid++;

          // ─── FASE 4-5: GENERACIÓN DE PUNTADAS + CLIPPING ──────────────────

          if (!validation.polygon || !Array.isArray(validation.polygon)) {
            console.error('INVALID POLYGON OBJECT', {
              regionId: `r${allRegions.length}`,
              colorHex,
              polygon: validation.polygon,
              polygonType: typeof validation.polygon,
              polygonIsArray: Array.isArray(validation.polygon)
            });
            vectorReport.invalidPolygons++;
            continue;
          }

          const stitches = generateRegionStitches(validation.polygon, {
            stitchType,
            density: stitch_density,
            angle: fill_angle
          });

          if (!Array.isArray(stitches) || stitches.length === 0) {
            console.error('STITCH GENERATION FAILED', {
              regionId: `r${allRegions.length}`,
              colorHex,
              stitches: stitches ? `${stitches.length} stitches` : 'NULL',
              stitchesIsArray: Array.isArray(stitches)
            });
            continue;
          }

          // Validar que todas las puntadas están dentro
          const outOfBounds = stitches.filter(pt => !isPointInPolygon(pt, validation.polygon)).length;
          diagnostics.stitchesOutOfBounds += outOfBounds;

          if (outOfBounds > stitches.length * 0.1) {
            diagnostics.warnings.push(`${colorHex}: ${outOfBounds} puntadas fuera de límites`);
          }

          const perimeter_px = estimatePerimeter(simplifiedContour);
          const perimeter_mm = perimeter_px * Math.sqrt(px_to_mm_x * px_to_mm_y);

          // Normalizar contorno
          const normalizedPath = normalizeContour(validation.polygon, width, height);
          
          if (!Array.isArray(normalizedPath)) {
            console.error('PATH NORMALIZATION FAILED', {
              regionId: `r${allRegions.length}`,
              colorHex,
              normalizedPath,
              normalizedPathType: typeof normalizedPath
            });
            vectorReport.invalidPolygons++;
            continue;
          }

          const regionName = `${colorHex.slice(1, 4)}_${stitchType[0]}`;
          
          const region = {
            id: `r${allRegions.length}`,
            name: regionName,
            color: colorHex,
            stitch_type: stitchType,
            density: stitch_density,
            angle: stitchType === 'fill' ? fill_angle : 0,
            path_points: normalizedPath,
            area_mm2,
            perimeter_mm,
            stitch_count: stitches.length,
            visible: true
          };

          console.log('VECTORIZE DEBUG - REGION COMPLETE', {
            regionId: region.id,
            regionName: region.name,
            pointsInPath: normalizedPath.length,
            stitchCount: stitches.length,
            areaM2: area_mm2,
            perimeterMm: perimeter_mm,
            stitchType
          });

          allRegions.push(region);
          vectorReport.regionsProcessed.push({
            id: region.id,
            name: region.name,
            color: colorHex,
            pointCount: normalizedPath.length,
            stitchCount: stitches.length
          });
          vectorReport.totalPointsDetected += normalizedPath.length;
          vectorReport.totalContoursDetected++;

          diagnostics.totalStitches += stitches.length;
        }
      }
    }

    if (allRegions.length === 0) {
      diagnostics.errors.push('No se pudieron extraer regiones válidas');
      return Response.json({
        success: false,
        error: 'No valid regions extracted',
        data: { regions: [], total_stitches: 0, diagnostics }
      }, { status: 422 });
    }

    // Estimación de tiempo (aproximadamente 800 puntadas/minuto)
    diagnostics.estimatedTime = Math.round(diagnostics.totalStitches / 800);

    console.log(`ÉXITO: ${allRegions.length} regiones válidas, ${diagnostics.totalStitches} puntadas`);
    console.log('VECTORIZATION REPORT', vectorReport);

    return Response.json({
      success: true,
      data: {
        regions: allRegions,
        total_stitches: diagnostics.totalStitches,
        colors_used: dominantColors.length,
        generation_method: 'professional_vectorization',
        vector_source: true,
        diagnostics,
        vectorReport
      }
    });

  } catch (error) {
    console.error('Vectorization error:', error.message);
    console.error('Stack trace:', error.stack);
    
    vectorReport.errors.push({
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    return Response.json({
      success: false,
      error: error.message,
      data: { regions: [], total_stitches: 0, diagnostics: { errors: [error.message] }, vectorReport },
      stack: error.stack
    }, { status: 422 });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

function extractDominantColors(pixelArray, width, height, maxColors) {
  const colorCounts = new Map();

  for (let i = 0; i < pixelArray.length; i += 4) {
    const a = pixelArray[i + 3];
    if (a < 128) continue;

    const r = pixelArray[i];
    const g = pixelArray[i + 1];
    const b = pixelArray[i + 2];
    
    try {
      const hexArray = [r, g, b].map(x => x.toString(16).padStart(2, '0'));
      
      if (!Array.isArray(hexArray)) {
        console.error('EXTRACT COLORS - INVALID HEX ARRAY', {
          hexArray,
          type: typeof hexArray,
          r, g, b
        });
        continue;
      }
      
      const hex = '#' + hexArray.join('');
      colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
    } catch (err) {
      console.error('EXTRACT COLORS ERROR', { r, g, b, error: err.message });
      continue;
    }
  }

  const result = Array.from(colorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxColors)
    .map(([hex]) => hex);
  
  console.log('DOMINANT COLORS EXTRACTED', { count: result.length, colors: result });
  return result;
}

function getPixelColor(pixelArray, x, y, width) {
  const idx = (y * width + x) * 4;
  if (pixelArray[idx + 3] < 128) return null;
  const r = pixelArray[idx];
  const g = pixelArray[idx + 1];
  const b = pixelArray[idx + 2];
  
  try {
    const hexArray = [r, g, b].map(x => x.toString(16).padStart(2, '0'));
    
    if (!Array.isArray(hexArray)) {
      console.error('GET PIXEL COLOR - INVALID HEX', {
        x, y, width,
        r, g, b,
        hexArray,
        type: typeof hexArray
      });
      return '#000000';
    }
    
    const hex = '#' + hexArray.join('');
    return hex;
  } catch (err) {
    console.error('GET PIXEL COLOR ERROR', { x, y, r, g, b, error: err.message });
    return '#000000';
  }
}

function floodFill(pixelArray, startX, startY, targetColor, width, height, visited) {
  const queue = [{ x: startX, y: startY }];
  const region = [];

  while (queue.length > 0) {
    const { x, y } = queue.shift();
    const key = `${x},${y}`;

    if (visited.has(key) || y < 0 || y >= height || x < 0 || x >= width) continue;

    const pixelColor = getPixelColor(pixelArray, x, y, width);
    if (pixelColor !== targetColor) continue;

    visited.add(key);
    region.push({ x, y });

    queue.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 });
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

function extractAndValidateContour(pixels, width, height) {
  const pixelSet = new Set(pixels.map(p => `${p.x},${p.y}`));
  const contour = [];

  for (const p of pixels) {
    const neighbors = [
      { x: p.x, y: p.y - 1 },
      { x: p.x + 1, y: p.y },
      { x: p.x, y: p.y + 1 },
      { x: p.x - 1, y: p.y }
    ];

    if (neighbors.some(n => !pixelSet.has(`${n.x},${n.y}`))) {
      contour.push(p);
    }
  }

  return contour.length > 0 ? orderContourPoints(contour) : null;
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
    } else break;
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

  for (let i = 1; i < contour.length - 1; i++) {
    const dist = pointToLineDistance(contour[i], contour[0], contour[contour.length - 1]);
    if (dist > tolerance) simplified.push(contour[i]);
  }

  simplified.push(contour[contour.length - 1]);
  if (simplified[0].x !== simplified[simplified.length - 1].x ||
      simplified[0].y !== simplified[simplified.length - 1].y) {
    simplified.push({ x: simplified[0].x, y: simplified[0].y });
  }

  return simplified;
}

function pointToLineDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2));
  const projX = a.x + t * dx, projY = a.y + t * dy;
  return Math.hypot(point.x - projX, point.y - projY);
}

function validateAndRepairPolygon(points) {
  let polygon = [...points];

  if (polygon[0].x !== polygon[polygon.length - 1].x ||
      polygon[0].y !== polygon[polygon.length - 1].y) {
    polygon.push({ x: polygon[0].x, y: polygon[0].y });
  }

  polygon = removeDuplicates(polygon);
  if (polygon.length < 3) return { valid: false };

  return { valid: true, repaired: false, polygon };
}

function removeDuplicates(polygon) {
  const result = [];
  const tolerance = 0.5;

  for (const pt of polygon) {
    const last = result[result.length - 1];
    if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) > tolerance) {
      result.push(pt);
    }
  }

  return result;
}

function generateRegionStitches(polygon, options) {
  const { stitchType = 'fill', density = 0.7, angle = 45 } = options;
  const stitches = [];

  if (stitchType === 'fill') {
    return generateTatamiStitches(polygon, { density, angle });
  } else if (stitchType === 'satin') {
    return generateSatinStitches(polygon, { density });
  } else {
    return generateRunStitches(polygon, { density });
  }
}

function generateTatamiStitches(polygon, options) {
  const { density = 0.7, angle = 45 } = options;
  const stitches = [];

  const bbox = getBoundingBox(polygon);
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const spacing = Math.max(0.3, density);

  let minRy = Infinity, maxRy = -Infinity;
  for (const c of getBoundingBoxCorners(bbox)) {
    const ry = -c.x * sin + c.y * cos;
    minRy = Math.min(minRy, ry);
    maxRy = Math.max(maxRy, ry);
  }

  for (let ry = minRy; ry <= maxRy; ry += spacing) {
    const intersections = findScanlineIntersections(polygon, ry, rad);
    if (intersections.length < 2) continue;

    intersections.sort((a, b) => a - b);

    for (let i = 0; i < intersections.length - 1; i += 2) {
      const x1 = intersections[i];
      const x2 = intersections[i + 1];
      if (x2 - x1 < 0.1) continue;

      const lineStitches = interpolateLine(x1, ry, x2, ry, Math.min(0.5, density / 2), rad);
      stitches.push(...lineStitches);
    }
  }

  return stitches;
}

function generateSatinStitches(polygon, options) {
  const { density = 0.5 } = options;
  const points = resampleContour(polygon, density);
  return points;
}

function generateRunStitches(polygon, options) {
  const { density = 1.0 } = options;
  return resampleContour(polygon, density);
}

function getBoundingBox(polygon) {
  const xs = polygon.map(p => p.x);
  const ys = polygon.map(p => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function getBoundingBoxCorners(bbox) {
  return [
    { x: bbox.minX, y: bbox.minY },
    { x: bbox.maxX, y: bbox.minY },
    { x: bbox.maxX, y: bbox.maxY },
    { x: bbox.minX, y: bbox.maxY }
  ];
}

function findScanlineIntersections(polygon, scanY, angle) {
  const intersections = [];
  const cos = Math.cos(angle), sin = Math.sin(angle);

  for (let i = 0; i < polygon.length - 1; i++) {
    const p1 = polygon[i], p2 = polygon[i + 1];
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
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const count = Math.max(1, Math.floor(dist / step));

  for (let i = 0; i <= count; i++) {
    const t = count > 0 ? i / count : 0;
    const rx = x1 + (x2 - x1) * t;
    const ry = y1 + (y2 - y1) * t;
    points.push({ x: rx * cos - ry * sin, y: rx * sin + ry * cos });
  }

  return points;
}

function resampleContour(polygon, step) {
  const points = [];

  for (let i = 0; i < polygon.length - 1; i++) {
    const p1 = polygon[i], p2 = polygon[i + 1];
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) continue;

    const steps = Math.ceil(dist / step);
    for (let j = 0; j <= steps; j++) {
      const t = steps > 0 ? j / steps : 0;
      points.push({ x: p1.x + t * dx, y: p1.y + t * dy });
    }
  }

  return points;
}

function isPointInPolygon(point, polygon) {
  let inside = false;
  const x = point.x, y = point.y;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

    if (intersect) inside = !inside;
  }

  return inside;
}

function normalizeContour(contour, width, height) {
  return contour.map(p => [p.x / width, p.y / height]);
}

function estimatePerimeter(contour) {
  let perim = 0;
  for (let i = 0; i < contour.length - 1; i++) {
    const p1 = contour[i], p2 = contour[i + 1];
    perim += Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }
  return perim;
}