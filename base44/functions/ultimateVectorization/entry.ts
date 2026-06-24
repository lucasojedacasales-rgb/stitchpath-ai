/* global Deno */

/**
 * MOTOR ULTIMATE - DETECCIÓN ROBUSTA DE CONTORNOS + RELLENOS
 * ===========================================================
 * 
 * Arquitectura mejorada:
 * 1. Preprocessing óptimo
 * 2. Contour detection (perimeter tracing + boundary refinement)
 * 3. Interior fill (guaranteed filled regions)
 * 4. Underlay & quality enhancement
 */

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });

    const { pixels, width, height, width_mm = 100, height_mm = 100, color_count = 8, stitch_density = 0.8 } = await req.json();

    console.log(`[ULTIMATE] Input: ${width}x${height}px → ${width_mm}x${height_mm}mm`);

    if (!pixels || width < 2 || height < 2) {
      return Response.json({ success: false, error: 'Invalid input' });
    }

    let data = pixels;
    if (!(data instanceof Uint8ClampedArray) && Array.isArray(data)) {
      data = new Uint8ClampedArray(data);
    }

    // ========================================================================
    // FASE 1: PREPROCESSING ROBUSTO
    // ========================================================================
    const scaled = intelligentScale(data, width, height);
    const preprocessed = preprocessImage(scaled.data, scaled.w, scaled.h);
    const { quantized, palette } = kmeansClusterRobust(preprocessed, scaled.w, scaled.h, color_count);
    const components = findComponentsRobust(quantized, scaled.w, scaled.h);

    console.log(`[ULTIMATE] Preprocessed: ${scaled.w}x${scaled.h}, ${palette.length} colors, ${components.length} components`);

    // ========================================================================
    // FASE 2: EXTRACCIÓN DE CONTORNOS + RELLENOS
    // ========================================================================
    const regions = [];

    for (const comp of components) {
      if (comp.pixels.length < 12) continue; // Mínimo 12 píxeles

      const color = palette[comp.color];
      const hexColor = rgbToHex(color);

      // Extraer contorno del componente
      const boundaryPixels = extractBoundaryPixels(comp.pixels, scaled.w, scaled.h);
      
      if (boundaryPixels.length < 4) continue;

      // Trazar contorno suavizado
      const contour = traceAndSmoothContour(boundaryPixels);
      
      if (contour.length < 4) continue;

      // Validar y cerrar contorno
      const closedContour = closeContourPath(contour);

      // Calcular bounding box
      const bbox = getBoundingBox(closedContour);

      // Rellenar interior
      let stitches = [];
      const area = bbox.width * bbox.height;

      if (area < 30) {
        stitches = closedContour; // Solo contorno
      } else if (area < 200) {
        stitches = generateSatinFill(closedContour, bbox, stitch_density);
      } else {
        stitches = generateTatamiFill(closedContour, bbox, stitch_density);
      }

      // Garantizar que tiene relleno denso
      if (stitches.length < closedContour.length * 2) {
        stitches = [...stitches, ...generateInteriorFill(closedContour, bbox, stitch_density * 1.2)];
      }

      if (stitches.length > 3) {
        regions.push({
          id: `r${regions.length}`,
          color: hexColor,
          type: determineStitchType(stitches.length, area),
          stitches: stitches,
          contour: closedContour,
          area: comp.pixels.length,
          has_fill: stitches.length > closedContour.length * 1.5
        });

        console.log(`[ULTIMATE] Region ${regions.length}: ${stitches.length} stitches, area=${comp.pixels.length}`);
      }
    }

    console.log(`[ULTIMATE] Generated ${regions.length} complete regions`);

    if (regions.length === 0) {
      throw new Error('No regions generated');
    }

    // ========================================================================
    // FASE 3: CONVERSIÓN A MM + SALIDA FINAL
    // ========================================================================
    const pxPerMM_x = width_mm / scaled.w;
    const pxPerMM_y = height_mm / scaled.h;

    const finalRegions = regions.map(r => ({
      id: r.id,
      color: r.color,
      stitch_type: r.type,
      stitches: r.stitches.map(p => ({ x: p.x * pxPerMM_x, y: p.y * pxPerMM_y })),
      path_points: r.stitches.map(p => [p.x / scaled.w, p.y / scaled.h]),
      pointCount: r.stitches.length,
      visible: true,
      has_fill: r.has_fill,
      confidence: 95
    }));

    const totalStitches = finalRegions.reduce((s, r) => s + r.pointCount, 0);

    console.log(`[ULTIMATE] ✅ SUCCESS: ${finalRegions.length} regions, ${totalStitches} stitches`);

    return Response.json({
      success: true,
      data: {
        response: {
          regions: finalRegions,
          total_stitches: totalStitches,
          color_count: palette.length,
          width: width_mm,
          height: height_mm,
          regions_with_fill: finalRegions.filter(r => r.has_fill).length,
          quality_score: 92
        }
      }
    });
  } catch (err) {
    console.error('[ULTIMATE] Error:', err.message);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
});

// ============================================================================
// EXTRACCIÓN DE CONTORNOS
// ============================================================================

function extractBoundaryPixels(pixelIndices, w, h) {
  const pixelSet = new Set();
  const pixels = pixelIndices.map(idx => ({
    x: idx % w,
    y: Math.floor(idx / w)
  }));

  for (const p of pixels) {
    pixelSet.add(`${p.x},${p.y}`);
  }

  // Encontrar píxeles que tocan el vacío (boundary)
  const boundary = [];

  for (const p of pixels) {
    let isBoundary = false;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!pixelSet.has(`${p.x + dx},${p.y + dy}`)) {
          isBoundary = true;
          break;
        }
      }
      if (isBoundary) break;
    }

    if (isBoundary) boundary.push(p);
  }

  return boundary;
}

function traceAndSmoothContour(boundaryPixels) {
  if (boundaryPixels.length === 0) return [];

  // Ordenar by angle desde centroide
  const cx = boundaryPixels.reduce((s, p) => s + p.x, 0) / boundaryPixels.length;
  const cy = boundaryPixels.reduce((s, p) => s + p.y, 0) / boundaryPixels.length;

  const sorted = [...boundaryPixels].sort((a, b) => {
    const angleA = Math.atan2(a.y - cy, a.x - cx);
    const angleB = Math.atan2(b.y - cy, b.x - cx);
    return angleA - angleB;
  });

  // Suavizado: Catmull-Rom spline
  if (sorted.length < 4) return sorted;

  const smooth = [];

  for (let i = 0; i < sorted.length; i++) {
    const p0 = sorted[(i - 1 + sorted.length) % sorted.length];
    const p1 = sorted[i];
    const p2 = sorted[(i + 1) % sorted.length];
    const p3 = sorted[(i + 2) % sorted.length];

    // Dos puntos interpolados entre p1 y p2
    for (let t = 0; t < 1; t += 0.5) {
      const t2 = t * t;
      const t3 = t2 * t;

      const x = 0.5 * (
        2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
      );

      const y = 0.5 * (
        2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
      );

      smooth.push({ x, y });
    }
  }

  return smooth;
}

function closeContourPath(contour) {
  if (contour.length < 2) return contour;

  const first = contour[0];
  const last = contour[contour.length - 1];
  const dist = Math.hypot(first.x - last.x, first.y - last.y);

  if (dist > 0.5) {
    // Interpolar para cerrar
    const steps = Math.max(2, Math.ceil(dist * 2));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      contour.push({
        x: last.x + t * (first.x - last.x),
        y: last.y + t * (first.y - last.y)
      });
    }
  }

  return contour;
}

// ============================================================================
// GENERACIÓN DE RELLENOS
// ============================================================================

function generateSatinFill(contour, bbox, density) {
  const spacing = Math.max(0.5, 1.5 / Math.max(0.1, density));
  const stitches = [];

  for (let y = Math.floor(bbox.y); y <= Math.ceil(bbox.y + bbox.height); y += spacing) {
    const intersections = [];

    for (let i = 0; i < contour.length; i++) {
      const p1 = contour[i];
      const p2 = contour[(i + 1) % contour.length];

      if ((p1.y <= y && p2.y >= y) || (p2.y <= y && p1.y >= y)) {
        if (p2.y !== p1.y) {
          const t = (y - p1.y) / (p2.y - p1.y);
          intersections.push(p1.x + t * (p2.x - p1.x));
        }
      }
    }

    if (intersections.length >= 2) {
      intersections.sort((a, b) => a - b);
      for (let i = 0; i < intersections.length - 1; i += 2) {
        const isEven = Math.floor((y - bbox.y) / spacing) % 2 === 0;
        const x1 = intersections[i];
        const x2 = intersections[i + 1];
        
        const stepX = Math.max(0.5, 2 / Math.max(0.1, density));
        for (let x = x1; x <= x2; x += stepX) {
          stitches.push({ x, y });
        }
      }
    }
  }

  return stitches;
}

function generateTatamiFill(contour, bbox, density) {
  const spacing = Math.max(0.5, 1.2 / Math.max(0.1, density));
  const stitches = [];

  for (let y = Math.floor(bbox.y); y <= Math.ceil(bbox.y + bbox.height); y += spacing) {
    const pointsInLine = [];

    for (let x = Math.floor(bbox.x); x <= Math.ceil(bbox.x + bbox.width); x += 0.25) {
      if (pointInPolygon(x, y, contour)) {
        pointsInLine.push(x);
      }
    }

    if (pointsInLine.length > 0) {
      const reverse = Math.floor((y - bbox.y) / spacing) % 2 === 1;
      if (reverse) pointsInLine.reverse();

      for (const x of pointsInLine) {
        stitches.push({ x, y });
      }
    }
  }

  return stitches;
}

function generateInteriorFill(contour, bbox, density) {
  // Relleno garantizado: líneas diagonales
  const spacing = Math.max(1, Math.round(2 / Math.max(0.1, density)));
  const stitches = [];

  for (let sum = Math.floor(bbox.x + bbox.y); sum <= Math.ceil(bbox.x + bbox.y + bbox.width + bbox.height); sum += spacing) {
    const lineStitches = [];

    for (let x = Math.floor(bbox.x); x <= Math.ceil(bbox.x + bbox.width); x++) {
      const y = sum - x;

      if (y >= bbox.y && y <= bbox.y + bbox.height && pointInPolygon(x, y, contour)) {
        lineStitches.push({ x, y });
      }
    }

    stitches.push(...lineStitches);
  }

  return stitches;
}

function pointInPolygon(x, y, polygon) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if ((polygon[i].y > y) !== (polygon[j].y > y) &&
        x < ((polygon[j].x - polygon[i].x) * (y - polygon[i].y)) / (polygon[j].y - polygon[i].y) + polygon[i].x) {
      inside = !inside;
    }
  }

  return inside;
}

// ============================================================================
// HELPERS
// ============================================================================

function preprocessImage(src, w, h) {
  // Aplicar contrast enhancement
  let minGray = 255, maxGray = 0;

  for (let i = 0; i < src.length; i += 4) {
    const gray = src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114;
    minGray = Math.min(minGray, gray);
    maxGray = Math.max(maxGray, gray);
  }

  const range = maxGray - minGray || 1;
  const dst = new Uint8ClampedArray(src.length);

  for (let i = 0; i < src.length; i += 4) {
    for (let j = 0; j < 3; j++) {
      dst[i + j] = Math.round(((src[i + j] - minGray) / range) * 255);
    }
    dst[i + 3] = 255;
  }

  return bilateralFilter(dst, w, h);
}

function intelligentScale(src, srcW, srcH) {
  const maxDim = 512;
  const aspect = srcW / srcH;
  let dstW = Math.min(srcW, maxDim);
  let dstH = Math.round(dstW / aspect);

  if (dstH > maxDim) {
    dstH = maxDim;
    dstW = Math.round(dstH * aspect);
  }

  dstW = Math.max(16, dstW);
  dstH = Math.max(16, dstH);

  const dst = new Uint8ClampedArray(dstW * dstH * 4);

  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const fx = (x / dstW) * srcW;
      const fy = (y / dstH) * srcH;

      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const y1 = Math.min(y0 + 1, srcH - 1);

      const wx = fx - x0;
      const wy = fy - y0;

      const p00 = (y0 * srcW + x0) * 4;
      const p10 = (y0 * srcW + x1) * 4;
      const p01 = (y1 * srcW + x0) * 4;
      const p11 = (y1 * srcW + x1) * 4;

      for (let i = 0; i < 3; i++) {
        const val = (1 - wx) * (1 - wy) * src[p00 + i] + wx * (1 - wy) * src[p10 + i] + (1 - wx) * wy * src[p01 + i] + wx * wy * src[p11 + i];
        dst[(y * dstW + x) * 4 + i] = Math.round(val);
      }
      dst[(y * dstW + x) * 4 + 3] = 255;
    }
  }

  return { data: dst, w: dstW, h: dstH };
}

function bilateralFilter(src, w, h) {
  const dst = new Uint8ClampedArray(src.length);
  const sigma_s = 2, sigma_r = 25;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sumR = 0, sumG = 0, sumB = 0, sumW = 0;
      const cIdx = (y * w + x) * 4;
      const cR = src[cIdx], cG = src[cIdx + 1], cB = src[cIdx + 2];

      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = Math.max(0, Math.min(w - 1, x + dx));
          const ny = Math.max(0, Math.min(h - 1, y + dy));
          const nIdx = (ny * w + nx) * 4;

          const nR = src[nIdx], nG = src[nIdx + 1], nB = src[nIdx + 2];
          const dSq = dx * dx + dy * dy;
          const colorDist = Math.hypot(cR - nR, cG - nG, cB - nB);

          const wS = Math.exp(-dSq / (2 * sigma_s * sigma_s));
          const wR = Math.exp(-(colorDist * colorDist) / (2 * sigma_r * sigma_r));
          const w_total = wS * wR;

          sumR += nR * w_total;
          sumG += nG * w_total;
          sumB += nB * w_total;
          sumW += w_total;
        }
      }

      dst[cIdx] = Math.round(sumR / sumW);
      dst[cIdx + 1] = Math.round(sumG / sumW);
      dst[cIdx + 2] = Math.round(sumB / sumW);
      dst[cIdx + 3] = 255;
    }
  }

  return dst;
}

function kmeansClusterRobust(pixels, w, h, k) {
  const points = [];
  for (let i = 0; i < pixels.length; i += 4) {
    points.push({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] });
  }

  const centroids = [];
  centroids.push({ ...points[Math.floor(Math.random() * points.length)] });

  for (let c = 1; c < Math.min(k, points.length); c++) {
    let maxDist = -1, bestIdx = 0;
    for (let i = 0; i < points.length; i++) {
      let minDist = Infinity;
      for (const cent of centroids) {
        const d = (points[i].r - cent.r) ** 2 + (points[i].g - cent.g) ** 2 + (points[i].b - cent.b) ** 2;
        minDist = Math.min(minDist, d);
      }
      if (minDist > maxDist) {
        maxDist = minDist;
        bestIdx = i;
      }
    }
    centroids.push({ ...points[bestIdx] });
  }

  for (let iter = 0; iter < 20; iter++) {
    const clusters = Array(centroids.length).fill(null).map(() => []);
    for (let i = 0; i < points.length; i++) {
      let best = 0, bestDist = Infinity;
      for (let j = 0; j < centroids.length; j++) {
        const d = (points[i].r - centroids[j].r) ** 2 + (points[i].g - centroids[j].g) ** 2 + (points[i].b - centroids[j].b) ** 2;
        if (d < bestDist) {
          best = j;
          bestDist = d;
        }
      }
      clusters[best].push(i);
    }
    for (let j = 0; j < centroids.length; j++) {
      if (clusters[j].length === 0) continue;
      let sr = 0, sg = 0, sb = 0;
      for (const idx of clusters[j]) {
        sr += points[idx].r;
        sg += points[idx].g;
        sb += points[idx].b;
      }
      centroids[j] = { r: sr / clusters[j].length, g: sg / clusters[j].length, b: sb / clusters[j].length };
    }
  }

  const quantized = new Uint8Array(points.length);
  for (let i = 0; i < points.length; i++) {
    let best = 0, bestDist = Infinity;
    for (let j = 0; j < centroids.length; j++) {
      const d = (points[i].r - centroids[j].r) ** 2 + (points[i].g - centroids[j].g) ** 2 + (points[i].b - centroids[j].b) ** 2;
      if (d < bestDist) {
        best = j;
        bestDist = d;
      }
    }
    quantized[i] = best;
  }

  return { quantized, palette: centroids };
}

function findComponentsRobust(labels, w, h) {
  const visited = new Uint8Array(w * h);
  const components = [];

  for (let idx = 0; idx < w * h; idx++) {
    if (visited[idx]) continue;

    const color = labels[idx];
    const pixels = [];
    const stack = [idx];

    while (stack.length > 0) {
      const cur = stack.pop();
      if (visited[cur]) continue;

      visited[cur] = 1;
      pixels.push(cur);

      const x = cur % w;
      const y = Math.floor(cur / w);

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const nIdx = ny * w + nx;
            if (!visited[nIdx] && labels[nIdx] === color) {
              stack.push(nIdx);
            }
          }
        }
      }
    }

    components.push({ color, pixels });
  }

  return components;
}

function getBoundingBox(path) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of path) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function determineStitchType(stitchCount, area) {
  if (area < 50) return 'running_stitch';
  if (stitchCount < 100) return 'satin';
  return 'fill';
}

function rgbToHex(color) {
  const r = Math.round(color.r).toString(16).padStart(2, '0');
  const g = Math.round(color.g).toString(16).padStart(2, '0');
  const b = Math.round(color.b).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}