import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Motor de Vectorización Puro en JavaScript (ImageTracer-inspired)
 * Raster → Vector → Stitches directamente en Deno sin dependencias externas
 * 
 * Pipeline: Imagen → Cuantización → Flood Fill → Contornos → Simplificación → Stitches
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
      stitch_density = 0.7
    } = await req.json();

    if (!pixels || !width || !height) {
      return Response.json({ error: 'Missing image data' }, { status: 400 });
    }

    console.log(`[VECTORIZER] Input: ${width}×${height}px → ${width_mm}×${height_mm}mm, ${color_count} colors`);

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 1: Color Quantization (k-means simple)
    // ──────────────────────────────────────────────────────────────────────────
    const quantizedPixels = quantizeColors(pixels, width, height, color_count);
    console.log(`[VECTORIZER] Color quantization complete`);

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 2: Flood Fill - Detect Regions
    // ──────────────────────────────────────────────────────────────────────────
    const regions = floodFillRegions(quantizedPixels, width, height, 20);
    console.log(`[VECTORIZER] Detected ${regions.length} regions`);

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 3: Process Each Region → Contours → Stitches
    // ──────────────────────────────────────────────────────────────────────────
    const pixelsPerMmX = width / width_mm;
    const pixelsPerMmY = height / height_mm;

    const processedRegions = [];
    let totalStitches = 0;

    for (const region of regions) {
      try {
        // Extract contour points
        let contourPoints = extractContour(region.pixels, region.bbox, quantizedPixels, width);
        if (contourPoints.length < 3) continue;

        // Order as continuous path
        contourPoints = orderPath(contourPoints);

        // Simplify with Ramer-Douglas-Peucker
        contourPoints = simplifyPath(contourPoints, 1); // 1px tolerance

        // Close loop
        if (contourPoints.length > 0 &&
            (contourPoints[0][0] !== contourPoints[contourPoints.length - 1][0] ||
             contourPoints[0][1] !== contourPoints[contourPoints.length - 1][1])) {
          contourPoints.push([...contourPoints[0]]);
        }

        if (contourPoints.length < 3) continue;

        // Convert to normalized coordinates (0-1)
        const normalizedPath = contourPoints.map(p => [
          p[0] / width,
          p[1] / height
        ]);

        // Calculate area (in mm²)
        const areaMm2 = calculatePolygonArea(normalizedPath) * width_mm * height_mm;
        const perimeterPx = calculatePolygonPerimeter(contourPoints);
        const perimeterMm = perimeterPx / Math.max(pixelsPerMmX, pixelsPerMmY);

        // Classify stitch type
        let stitchType = 'fill';
        if (areaMm2 < 10) stitchType = 'running_stitch';
        else if (areaMm2 < 30) stitchType = 'satin';

        // Generate stitches
        let stitches = [];
        if (stitchType === 'fill') {
          stitches = generateFillStitches(contourPoints, width, height, width_mm, height_mm, stitch_density);
        } else if (stitchType === 'satin') {
          stitches = generateSatinStitches(contourPoints, width_mm, height_mm, stitch_density);
        } else {
          stitches = generateRunningStitches(contourPoints, width_mm, height_mm);
        }

        // Color
        const color = region.color;
        const colorHex = `#${color.r.toString(16).padStart(2, '0')}${color.g.toString(16).padStart(2, '0')}${color.b.toString(16).padStart(2, '0')}`;

        processedRegions.push({
          id: `r${processedRegions.length}`,
          name: `region_${processedRegions.length}`,
          color: colorHex,
          stitch_type: stitchType,
          path_points: normalizedPath,
          stitches: stitches,
          pointCount: stitches.length,
          area_mm2: areaMm2,
          perimeter_mm: perimeterMm,
          visible: true
        });

        totalStitches += stitches.length;
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
        colors_used: processedRegions.length,
        generation_method: 'native_javascript',
        vector_source: true,
        diagnostics: {
          regionsDetected: processedRegions.length,
          totalStitches,
          colorsUsed: processedRegions.length,
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
// COLOR QUANTIZATION (K-MEANS)
// ═══════════════════════════════════════════════════════════════════════════════

function quantizeColors(pixels, width, height, k = 6) {
  const rgba = new Uint8ClampedArray(pixels);
  const pixelCount = width * height;

  // Sample pixels to find initial centers
  const centers = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.floor((i / k) * pixelCount) * 4;
    centers.push({
      r: rgba[idx],
      g: rgba[idx + 1],
      b: rgba[idx + 2],
      count: 0
    });
  }

  // K-means iterations
  for (let iter = 0; iter < 5; iter++) {
    // Reset counts
    centers.forEach(c => c.count = 0);
    const newCenters = centers.map(c => ({ r: 0, g: 0, b: 0, count: 0 }));

    // Assign pixels to nearest center
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 4;
      const r = rgba[idx], g = rgba[idx + 1], b = rgba[idx + 2];

      let minDist = Infinity, nearest = 0;
      for (let j = 0; j < centers.length; j++) {
        const dist = Math.pow(r - centers[j].r, 2) * 0.299 +
                     Math.pow(g - centers[j].g, 2) * 0.587 +
                     Math.pow(b - centers[j].b, 2) * 0.114; // Perceptual weighting
        if (dist < minDist) { minDist = dist; nearest = j; }
      }

      newCenters[nearest].r += r;
      newCenters[nearest].g += g;
      newCenters[nearest].b += b;
      newCenters[nearest].count++;
    }

    // Update centers
    for (let i = 0; i < centers.length; i++) {
      if (newCenters[i].count > 0) {
        centers[i].r = Math.round(newCenters[i].r / newCenters[i].count);
        centers[i].g = Math.round(newCenters[i].g / newCenters[i].count);
        centers[i].b = Math.round(newCenters[i].b / newCenters[i].count);
      }
    }
  }

  // Quantize all pixels
  const quantized = new Uint8ClampedArray(rgba);
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const r = rgba[idx], g = rgba[idx + 1], b = rgba[idx + 2];

    let minDist = Infinity, nearest = 0;
    for (let j = 0; j < centers.length; j++) {
      const dist = Math.pow(r - centers[j].r, 2) +
                   Math.pow(g - centers[j].g, 2) +
                   Math.pow(b - centers[j].b, 2);
      if (dist < minDist) { minDist = dist; nearest = j; }
    }

    quantized[idx] = centers[nearest].r;
    quantized[idx + 1] = centers[nearest].g;
    quantized[idx + 2] = centers[nearest].b;
  }

  return quantized;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLOOD FILL - DETECT REGIONS
// ═══════════════════════════════════════════════════════════════════════════════

function floodFillRegions(pixels, width, height, minSize = 20) {
  const visited = new Set();
  const regions = [];

  for (let i = 0; i < width * height; i++) {
    if (visited.has(i)) continue;

    const idx = i * 4;
    const color = { r: pixels[idx], g: pixels[idx + 1], b: pixels[idx + 2] };

    const regionPixels = new Set();
    const queue = [i];
    visited.add(i);

    while (queue.length > 0) {
      const current = queue.shift();
      regionPixels.add(current);

      const x = current % width;
      const y = Math.floor(current / width);

      // 8-connected neighbors
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

          const neighbor = ny * width + nx;
          if (visited.has(neighbor)) continue;

          const nIdx = neighbor * 4;
          const nr = pixels[nIdx], ng = pixels[nIdx + 1], nb = pixels[nIdx + 2];

          if (nr === color.r && ng === color.g && nb === color.b) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
    }

    // Filter by minimum size
    if (regionPixels.size >= minSize) {
      // Calculate bbox
      let minX = width, maxX = 0, minY = height, maxY = 0;
      for (const pixel of regionPixels) {
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }

      regions.push({
        pixels: regionPixels,
        bbox: { minX, maxX, minY, maxY },
        color
      });
    }
  }

  return regions;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTOUR EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

function extractContour(regionPixels, bbox, allPixels, width) {
  const contour = [];
  const { minX, maxX, minY, maxY } = bbox;

  // Find edge pixels (have neighbor outside region)
  for (const pixel of regionPixels) {
    const x = pixel % width;
    const y = Math.floor(pixel / width);

    // Check 4-connected neighbors
    let isEdge = false;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0) {
        isEdge = true;
        break;
      }
      const neighbor = ny * width + nx;
      if (!regionPixels.has(neighbor)) {
        isEdge = true;
        break;
      }
    }

    if (isEdge) {
      contour.push([x, y]);
    }
  }

  return contour;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORDER PATH - Nearest Neighbor
// ═══════════════════════════════════════════════════════════════════════════════

function orderPath(points) {
  if (points.length === 0) return [];

  const ordered = [points[0]];
  const remaining = new Set(points.slice(1));

  while (remaining.size > 0) {
    const last = ordered[ordered.length - 1];
    let nearest = null, minDist = Infinity;

    for (const p of remaining) {
      const dist = Math.hypot(p[0] - last[0], p[1] - last[1]);
      if (dist < minDist) { minDist = dist; nearest = p; }
    }

    if (nearest) {
      ordered.push(nearest);
      remaining.delete(nearest);
    } else {
      break;
    }
  }

  return ordered;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RAMER-DOUGLAS-PEUCKER SIMPLIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

function simplifyPath(points, tolerance) {
  if (points.length < 3) return points;

  function perpDistance(point, lineStart, lineEnd) {
    const dx = lineEnd[0] - lineStart[0];
    const dy = lineEnd[1] - lineStart[1];
    const dist = Math.abs(dy * point[0] - dx * point[1] + lineEnd[0] * lineStart[1] - lineEnd[1] * lineStart[0]) /
                 Math.hypot(dx, dy);
    return dist;
  }

  function rdp(points, tolerance) {
    if (points.length < 3) return points;

    let maxDist = 0, maxIdx = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const dist = perpDistance(points[i], points[0], points[points.length - 1]);
      if (dist > maxDist) { maxDist = dist; maxIdx = i; }
    }

    if (maxDist > tolerance) {
      const left = rdp(points.slice(0, maxIdx + 1), tolerance);
      const right = rdp(points.slice(maxIdx), tolerance);
      return [...left.slice(0, -1), ...right];
    } else {
      return [points[0], points[points.length - 1]];
    }
  }

  return rdp(points, tolerance);
}

// ═══════════════════════════════════════════════════════════════════════════════
// POLYGON AREA & PERIMETER
// ═══════════════════════════════════════════════════════════════════════════════

function calculatePolygonArea(polygon) {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    area += p1[0] * p2[1] - p2[0] * p1[1];
  }
  return Math.abs(area) / 2;
}

function calculatePolygonPerimeter(polygon) {
  let perimeter = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    perimeter += Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  }
  return perimeter;
}

// ═══════════════════════════════════════════════════════════════════════════════
// POINT IN POLYGON (Ray casting)
// ═══════════════════════════════════════════════════════════════════════════════

function pointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STITCH GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

function generateFillStitches(contourPx, canvasW, canvasH, widthMm, heightMm, density) {
  const stitches = [];
  const spacing = Math.max(1.5, 4 / density); // pixels
  const angle = (Math.PI * 45) / 180;

  // Normalized polygon
  const polygon = contourPx.map(p => [p[0] / canvasW, p[1] / canvasH]);

  // Scanlines at 45°
  const minX = Math.min(...polygon.map(p => p[0]));
  const maxX = Math.max(...polygon.map(p => p[0]));
  const minY = Math.min(...polygon.map(p => p[1]));
  const maxY = Math.max(...polygon.map(p => p[1]));

  const scanCount = Math.ceil((maxX - minX + maxY - minY) / (spacing / Math.max(canvasW, canvasH)));

  for (let s = 0; s < scanCount; s++) {
    const offset = minX + (s * spacing / canvasW);
    const intersections = [];

    // Find scanline intersections with polygon edges
    for (let i = 0; i < polygon.length; i++) {
      const p1 = polygon[i];
      const p2 = polygon[(i + 1) % polygon.length];

      // Scanline intersection logic
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];

      if (Math.abs(dx * Math.sin(angle) - dy * Math.cos(angle)) > 1e-6) {
        const t = (offset - (p1[0] * Math.cos(angle) + p1[1] * Math.sin(angle))) /
                  (dx * Math.cos(angle) + dy * Math.sin(angle));

        if (t >= 0 && t <= 1) {
          const px = p1[0] + t * dx;
          const py = p1[1] + t * dy;
          if (pointInPolygon([px, py], polygon)) {
            intersections.push([px, py]);
          }
        }
      }
    }

    // Sort intersections along scanline
    intersections.sort((a, b) => {
      const aProj = a[0] * Math.cos(angle) + a[1] * Math.sin(angle);
      const bProj = b[0] * Math.cos(angle) + b[1] * Math.sin(angle);
      return aProj - bProj;
    });

    // Generate stitches between pairs
    for (let i = 0; i < intersections.length - 1; i += 2) {
      const start = intersections[i];
      const end = intersections[i + 1];

      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const len = Math.hypot(dx, dy);
      const stepCount = Math.ceil(len / (0.5 / Math.max(widthMm, heightMm)));

      for (let step = 0; step <= stepCount; step++) {
        const t = stepCount > 0 ? step / stepCount : 0;
        const x = start[0] + t * dx;
        const y = start[1] + t * dy;

        // Verify point is inside
        if (pointInPolygon([x, y], polygon)) {
          stitches.push({
            x: x * widthMm,
            y: y * heightMm
          });
        }
      }
    }
  }

  return stitches;
}

function generateSatinStitches(contourPx, widthMm, heightMm, density) {
  const stitches = [];
  const spacing = Math.max(1.5, 3 / density);

  // Resample contour
  const resampled = resamplePath(contourPx, spacing / Math.max(widthMm, heightMm));

  for (const point of resampled) {
    stitches.push({
      x: point[0] / Math.max(widthMm, heightMm) * widthMm,
      y: point[1] / Math.max(widthMm, heightMm) * heightMm
    });
  }

  return stitches;
}

function generateRunningStitches(contourPx, widthMm, heightMm) {
  const stitches = [];
  const spacing = 0.7; // mm

  // Resample contour
  const resampled = resamplePath(contourPx, spacing / Math.max(widthMm, heightMm));

  for (const point of resampled) {
    stitches.push({
      x: point[0] / Math.max(widthMm, heightMm) * widthMm,
      y: point[1] / Math.max(widthMm, heightMm) * heightMm
    });
  }

  return stitches;
}

function resamplePath(path, targetSpacing) {
  const resampled = [path[0]];
  let currentDist = 0;

  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    const segLen = Math.hypot(curr[0] - prev[0], curr[1] - prev[1]);

    let t = 0;
    while (currentDist + t * segLen < targetSpacing) {
      t += targetSpacing / Math.max(segLen, 1e-6);
    }

    const dx = curr[0] - prev[0];
    const dy = curr[1] - prev[1];

    while (currentDist + t * segLen < targetSpacing && i < path.length) {
      const nextTarget = targetSpacing - currentDist;
      const x = prev[0] + (nextTarget / segLen) * dx;
      const y = prev[1] + (nextTarget / segLen) * dy;
      resampled.push([x, y]);
      currentDist = 0;
      t = 0;
      i++;
    }

    currentDist += segLen;
  }

  resampled.push(path[path.length - 1]);
  return resampled;
}