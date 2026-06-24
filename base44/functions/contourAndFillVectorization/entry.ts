/* global Deno */

/**
 * MOTOR VECTORIZACIÓN COMPLETO - CONTORNOS + RELLENOS
 * ======================================================
 * 
 * Arquitectura:
 * FASE 1: Preprocessing (escala, filtro, clustering)
 * FASE 2: Contour Detection (trazo de bordes exteriores)
 * FASE 3: Interior Fill (relleno tatami/satin del interior)
 * FASE 4: Underlay Generation (capas de soporte)
 * FASE 5: Path Optimization (secuencia de máquina)
 */

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });

    const payload = await req.json();
    const { pixels, width, height, width_mm = 100, height_mm = 100, color_count = 8, stitch_density = 0.8 } = payload;

    console.log(`[CONTOUR_FILL] Input: ${width}x${height}, ${color_count} colors, density=${stitch_density}`);

    if (!pixels || width < 2 || height < 2) {
      return Response.json({ success: false, error: 'Invalid dimensions' });
    }

    let data = pixels;
    if (!(data instanceof Uint8ClampedArray) && Array.isArray(data)) {
      data = new Uint8ClampedArray(data);
    }

    // ========================================================================
    // FASE 1: PREPROCESSING
    // ========================================================================
    const scaled = intelligentScale(data, width, height);
    const filtered = bilateralFilter(scaled.data, scaled.w, scaled.h);
    const { quantized, palette } = kmeansCluster(filtered, scaled.w, scaled.h, color_count);
    const components = findComponents(quantized, scaled.w, scaled.h);

    console.log(`[CONTOUR_FILL] Prep done: ${scaled.w}x${scaled.h}, ${palette.length} colors, ${components.length} components`);

    // ========================================================================
    // FASE 2+3: CONTOUR + FILL POR CADA REGIÓN
    // ========================================================================
    const regions = [];

    for (const comp of components) {
      if (comp.pixels.length < 8) continue;

      const color = palette[comp.color];
      const hexColor = rgbToHex(color);

      // PASO 1: Extraer contorno exterior
      const contourPath = extractContourPath(comp.pixels, scaled.w, scaled.h);
      
      if (contourPath.length < 4) {
        console.log(`[CONTOUR_FILL] Skipping region (contour too small: ${contourPath.length})`);
        continue;
      }

      // PASO 2: Validar que sea cerrado
      const closedContour = ensurePathIsClosed(contourPath);

      // PASO 3: Verificar si está hueco o relleno
      const bbox = calculateBoundingBox(closedContour);
      const area = bbox.width * bbox.height;

      // PASO 4: Decidir tipo de relleno
      let fillType = 'satin';
      let fillStitches = [];

      if (area < 50) {
        fillType = 'running_stitch';
        fillStitches = closedContour;
      } else if (area < 300) {
        fillType = 'satin';
        fillStitches = generateSatinFill(closedContour, scaled.w, scaled.h, stitch_density);
      } else {
        fillType = 'fill';
        fillStitches = generateTatamiFill(closedContour, scaled.w, scaled.h, stitch_density);
      }

      // PASO 5: Asegurar que el relleno está completo
      if (fillStitches.length < closedContour.length) {
        fillStitches = [...closedContour, ...fillStitches];
      }

      // PASO 6: Agrupar contorno + relleno
      const region = {
        id: `r${regions.length}`,
        color: hexColor,
        fill_type: fillType,
        contour: closedContour,
        interior: fillStitches,
        all_stitches: mergeContourfill(closedContour, fillStitches),
        pointCount: fillStitches.length,
        area: comp.pixels.length,
        is_closed: true
      };

      regions.push(region);
      console.log(`[CONTOUR_FILL] Region ${region.id}: ${fillType}, ${region.pointCount} stitches, area=${region.area}`);
    }

    console.log(`[CONTOUR_FILL] Generated ${regions.length} complete regions with fill`);

    if (regions.length === 0) {
      throw new Error('No regions generated');
    }

    // ========================================================================
    // FASE 4: CONVERTIR A MM + UNDERLAY
    // ========================================================================
    const pxPerMM_x = width_mm / scaled.w;
    const pxPerMM_y = height_mm / scaled.h;

    const finalRegions = [];

    for (const region of regions) {
      // Región principal
      finalRegions.push({
        id: region.id,
        color: region.color,
        stitch_type: region.fill_type,
        stitches: region.all_stitches.map(p => ({ x: p.x * pxPerMM_x, y: p.y * pxPerMM_y })),
        path_points: region.all_stitches.map(p => [p.x * pxPerMM_x / width_mm, p.y * pxPerMM_y / height_mm]),
        pointCount: region.pointCount,
        visible: true,
        has_fill: region.interior.length > 0
      });

      // Underlay si es necesario (áreas grandes)
      if (region.area > 200) {
        const underlayStitches = generateUnderlay(region.contour, scaled.w, scaled.h);
        if (underlayStitches.length > 0) {
          finalRegions.push({
            id: `${region.id}_underlay`,
            color: region.color,
            stitch_type: 'underlay',
            stitches: underlayStitches.map(p => ({ x: p.x * pxPerMM_x, y: p.y * pxPerMM_y })),
            path_points: underlayStitches.map(p => [p.x * pxPerMM_x / width_mm, p.y * pxPerMM_y / height_mm]),
            pointCount: underlayStitches.length,
            visible: true
          });
        }
      }
    }

    const totalStitches = finalRegions.reduce((s, r) => s + r.pointCount, 0);
    console.log(`[CONTOUR_FILL] ✅ Final: ${finalRegions.length} regions, ${totalStitches} total stitches`);

    return Response.json({
      success: true,
      data: {
        response: {
          regions: finalRegions,
          total_stitches: totalStitches,
          color_count: palette.length,
          width: width_mm,
          height: height_mm,
          regions_with_fill: regions.filter(r => r.interior.length > 0).length
        }
      }
    });
  } catch (err) {
    console.error('[CONTOUR_FILL] Error:', err.message);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
});

// ============================================================================
// CONTOUR EXTRACTION - Algoritmo BFS para bordes
// ============================================================================

function extractContourPath(pixelIndices, w, h) {
  const pixelSet = new Set();
  const pixels = pixelIndices.map(idx => ({
    x: idx % w,
    y: Math.floor(idx / w)
  }));

  for (const p of pixels) {
    pixelSet.add(`${p.x},${p.y}`);
  }

  // Encontrar píxeles de borde (vecinos con vacío)
  const borderPixels = [];
  for (const p of pixels) {
    let isBorder = false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (!pixelSet.has(`${nx},${ny}`)) {
          isBorder = true;
          break;
        }
      }
      if (isBorder) break;
    }
    if (isBorder) borderPixels.push(p);
  }

  if (borderPixels.length === 0) return [];

  // Ordenar borde en sentido antihorario
  const ordered = orderBorderPixels(borderPixels);
  return ordered;
}

function orderBorderPixels(pixels) {
  if (pixels.length === 0) return [];

  // Encontrar centroide
  let cx = 0, cy = 0;
  for (const p of pixels) {
    cx += p.x;
    cy += p.y;
  }
  cx /= pixels.length;
  cy /= pixels.length;

  // Ordenar por ángulo desde centroide
  pixels.sort((a, b) => {
    const angleA = Math.atan2(a.y - cy, a.x - cx);
    const angleB = Math.atan2(b.y - cy, b.x - cx);
    return angleA - angleB;
  });

  return pixels;
}

function ensurePathIsClosed(path) {
  if (path.length < 3) return path;

  const start = path[0];
  const end = path[path.length - 1];
  
  // Si no están suficientemente cerca, agregar puntos intermedios
  const dist = Math.hypot(start.x - end.x, start.y - end.y);
  if (dist > 1.5) {
    const steps = Math.ceil(dist);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      path.push({
        x: end.x + t * (start.x - end.x),
        y: end.y + t * (start.y - end.y)
      });
    }
  }

  return path;
}

// ============================================================================
// FILL GENERATION - Rellenos interiores profesionales
// ============================================================================

function generateSatinFill(contour, w, h, density) {
  const bbox = calculateBoundingBox(contour);
  const spacing = Math.max(1, Math.round(3 / Math.max(0.1, density)));
  const stitches = [];

  // Líneas paralelas horizontales
  for (let y = Math.floor(bbox.y); y <= Math.ceil(bbox.y + bbox.height); y += spacing) {
    const intersections = [];

    // Encontrar puntos de intersección con el contorno
    for (let i = 0; i < contour.length; i++) {
      const p1 = contour[i];
      const p2 = contour[(i + 1) % contour.length];

      // Verificar intersección de línea horizontal con segmento
      if ((p1.y <= y && p2.y >= y) || (p2.y <= y && p1.y >= y)) {
        if (p2.y !== p1.y) {
          const t = (y - p1.y) / (p2.y - p1.y);
          const x = p1.x + t * (p2.x - p1.x);
          intersections.push(x);
        }
      }
    }

    if (intersections.length >= 2) {
      intersections.sort((a, b) => a - b);

      // Conectar pares de intersecciones
      for (let i = 0; i < intersections.length - 1; i += 2) {
        const x1 = intersections[i];
        const x2 = intersections[i + 1];

        // Zigzag alternado
        if (Math.floor(y / spacing) % 2 === 0) {
          stitches.push({ x: x1, y });
          stitches.push({ x: x2, y });
        } else {
          stitches.push({ x: x2, y });
          stitches.push({ x: x1, y });
        }
      }
    }
  }

  return stitches.length > 0 ? stitches : contour;
}

function generateTatamiFill(contour, w, h, density) {
  const bbox = calculateBoundingBox(contour);
  const spacing = Math.max(1, Math.round(2 / Math.max(0.1, density)));
  const stitches = [];

  // Patrón cruzado: primero horizontal, luego diagonal
  const passes = [
    { dx: 0, dy: spacing },     // Horizontal
    { dx: spacing, dy: spacing }  // Diagonal 45°
  ];

  for (const pass of passes) {
    if (pass.dy !== undefined) {
      // Pasada horizontal
      for (let y = Math.floor(bbox.y); y <= Math.ceil(bbox.y + bbox.height); y += pass.dy) {
        const points = [];

        for (let x = Math.floor(bbox.x); x <= Math.ceil(bbox.x + bbox.width); x += pass.dx || 1) {
          if (isPointInPolygon(x, y, contour)) {
            points.push({ x, y });
          }
        }

        if (points.length > 0) {
          const reverse = Math.floor((y - bbox.y) / (pass.dy || 1)) % 2 === 1;
          if (reverse) points.reverse();
          stitches.push(...points);
        }
      }
    }
  }

  return stitches.length > 0 ? stitches : contour;
}

function generateUnderlay(contour, w, h) {
  // Underlay simple: versión simplificada del contorno ligeramente interna
  const shrunk = shrinkPath(contour, 1.5);
  return shrunk.length > 0 ? shrunk : contour.slice(0, Math.ceil(contour.length / 2));
}

function shrinkPath(path, amount) {
  if (path.length < 3) return path;

  const shrunk = [];
  const cx = path.reduce((s, p) => s + p.x, 0) / path.length;
  const cy = path.reduce((s, p) => s + p.y, 0) / path.length;

  for (const p of path) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.hypot(dx, dy);
    
    if (dist > amount) {
      const ratio = (dist - amount) / dist;
      shrunk.push({
        x: cx + dx * ratio,
        y: cy + dy * ratio
      });
    }
  }

  return shrunk;
}

function isPointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if ((polygon[i].y > y) !== (polygon[j].y > y) &&
        x < ((polygon[j].x - polygon[i].x) * (y - polygon[i].y)) / (polygon[j].y - polygon[i].y) + polygon[i].x) {
      inside = !inside;
    }
  }
  return inside;
}

function mergeContourfill(contour, interior) {
  // Combinar contorno + interior en una secuencia eficiente
  if (interior.length === 0) return contour;
  if (interior.length === contour.length) return interior;

  // Intercalar: contorno primero, luego interior
  return [...contour, ...interior];
}

// ============================================================================
// HELPERS - Infraestructura compartida
// ============================================================================

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
        const val = 
          (1 - wx) * (1 - wy) * src[p00 + i] +
          wx * (1 - wy) * src[p10 + i] +
          (1 - wx) * wy * src[p01 + i] +
          wx * wy * src[p11 + i];

        dst[(y * dstW + x) * 4 + i] = Math.round(val);
      }
      dst[(y * dstW + x) * 4 + 3] = 255;
    }
  }

  return { data: dst, w: dstW, h: dstH };
}

function bilateralFilter(src, w, h) {
  const dst = new Uint8ClampedArray(src.length);
  const sigma_s = 2;
  const sigma_r = 25;

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

function kmeansCluster(pixels, w, h, k) {
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

  for (let iter = 0; iter < 15; iter++) {
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
      centroids[j] = {
        r: sr / clusters[j].length,
        g: sg / clusters[j].length,
        b: sb / clusters[j].length
      };
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

function findComponents(labels, w, h) {
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

          const nx = x + dx;
          const ny = y + dy;

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

function calculateBoundingBox(path) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const p of path) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function rgbToHex(color) {
  const r = Math.round(color.r).toString(16).padStart(2, '0');
  const g = Math.round(color.g).toString(16).padStart(2, '0');
  const b = Math.round(color.b).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}