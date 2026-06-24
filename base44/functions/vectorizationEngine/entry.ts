/* global Deno */

/**
 * MOTOR DE VECTORIZACIÓN v5 - ENHANCED DETECTION
 * ========================
 * Mejoras implementadas:
 * 1. K-means con 10 iteraciones (mejor convergencia)
 * 2. Edge detection para análisis de detalles
 * 3. Curvature analysis para clasificación de stitch types
 * 4. Path simplification con Douglas-Peucker
 * 5. Zigzag pattern en scanlines para reducir saltos
 */

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });

    const payload = await req.json();
    const { pixels, width, height, width_mm = 100, height_mm = 100, color_count = 8, stitch_density = 0.8 } = payload;

    console.log(`[VECTORIZATION] Input: ${width}x${height}, ${color_count} colors, density=${stitch_density}`);

    if (!pixels || width < 2 || height < 2) {
      return Response.json({ success: false, error: 'Invalid dimensions' });
    }

    let data = pixels;
    if (!(data instanceof Uint8ClampedArray) && Array.isArray(data)) {
      data = new Uint8ClampedArray(data);
    }

    // PASO 1: Escalar inteligentemente
    const scaled = intelligentScale(data, width, height);
    console.log(`[VECTORIZATION] Scaled to ${scaled.w}x${scaled.h}`);

    // PASO 2: Aplicar filtro bilateral
    const filtered = bilateralFilter(scaled.data, scaled.w, scaled.h);
    console.log('[VECTORIZATION] Bilateral filter applied');

    // PASO 2.5: Detectar edges para análisis posterior
    const edgeMap = detectEdges(filtered, scaled.w, scaled.h);
    console.log('[VECTORIZATION] Edge map generated');

    // PASO 3: K-means clustering (10 iteraciones para mejor convergencia)
    const { quantized, palette } = kmeansCluster(filtered, scaled.w, scaled.h, color_count);
    console.log(`[VECTORIZATION] Clustered to ${palette.length} colors`);

    // PASO 4: Detectar componentes
    const components = findComponents(quantized, scaled.w, scaled.h);
    console.log(`[VECTORIZATION] Found ${components.length} components`);

    // PASO 5: Generar regiones
    const regions = [];
    for (const comp of components) {
      if (comp.pixels.length < 8) continue;

      const color = palette[comp.color];
      const hexColor = rgbToHex(color);

      // Generar scanlines
      let stitches = generateTatamiScanlines(comp.pixels, scaled.w, scaled.h, stitch_density);

      if (stitches.length > 3) {
        // Simplificar path moderadamente
        stitches = simplifyPath(stitches, 1.0);

        const area = comp.pixels.length;
        const pointDensity = stitches.length / Math.max(1, area);
        
        regions.push({
          id: `r${regions.length}`,
          color: hexColor,
          stitches: stitches,
          pointCount: stitches.length,
          area: area,
          density: pointDensity
        });
      }
    }

    console.log(`[VECTORIZATION] Generated ${regions.length} regions`);

    if (regions.length === 0) {
      throw new Error('No regions generated');
    }

    // PASO 6: Convertir a mm
    const pxPerMM_x = width_mm / scaled.w;
    const pxPerMM_y = height_mm / scaled.h;

    const finalRegions = regions.map(r => {
      // Clasificación mejorada usando curvatura
      const curvature = calculateCurvature(r.stitches);
      let stitch_type = 'fill';
      
      if (r.pointCount < 30) {
        stitch_type = 'running_stitch';
      } else if (r.area < 50) {
        stitch_type = 'running_stitch';
      } else if (curvature > 0.3 && r.pointCount < 200) {
        stitch_type = 'satin'; // Muchas curvas
      } else if (r.pointCount < 250 || r.density < 0.3) {
        stitch_type = 'satin';
      } else {
        stitch_type = 'fill';
      }

      return {
        id: r.id,
        color: r.color,
        stitch_type: stitch_type,
        stitches: r.stitches.map(p => ({ x: p.x * pxPerMM_x, y: p.y * pxPerMM_y })),
        path_points: r.stitches.map(p => [p.x * pxPerMM_x / width_mm, p.y * pxPerMM_y / height_mm]),
        pointCount: r.pointCount,
        visible: true,
        curvature: curvature
      };
    });

    const totalStitches = finalRegions.reduce((s, r) => s + r.pointCount, 0);
    console.log(`[VECTORIZATION] ✅ Success: ${finalRegions.length} regions, ${totalStitches} stitches`);

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
    console.error('[VECTORIZATION] Error:', err.message);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
});

// ============================================================================
// PASO 1: ESCALAR INTELIGENTEMENTE
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

// ============================================================================
// PASO 2: FILTRO BILATERAL
// ============================================================================

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

// ============================================================================
// MEJORA 1: EDGE DETECTION (Sobel-like)
// ============================================================================

function detectEdges(pixels, w, h) {
  const edges = new Uint8Array(w * h);
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let gx = 0, gy = 0;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const idx = ((y + dy) * w + (x + dx)) * 4;
          const gray = pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114;
          const kernelIdx = (dy + 1) * 3 + (dx + 1);
          gx += gray * sobelX[kernelIdx];
          gy += gray * sobelY[kernelIdx];
        }
      }

      edges[y * w + x] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
    }
  }

  return edges;
}

// ============================================================================
// PASO 3: K-MEANS CLUSTERING (mejorado)
// ============================================================================

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

  // MEJORA: 10 iteraciones en lugar de 5
  for (let iter = 0; iter < 10; iter++) {
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

// ============================================================================
// PASO 4: DETECTAR COMPONENTES CONECTADAS
// ============================================================================

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

// ============================================================================
// PASO 5: GENERAR SCANLINES TATAMI (con zigzag)
// ============================================================================

function generateTatamiScanlines(pixelIndices, w, h, density) {
  const step = Math.max(1, Math.round(2 / Math.max(0.1, density)));
  const pixelSet = new Set();

  const pixels = pixelIndices.map(idx => ({
    x: idx % w,
    y: Math.floor(idx / w)
  }));

  for (const p of pixels) {
    pixelSet.add(`${p.x},${p.y}`);
  }

  let minX = w, maxX = -1, minY = h, maxY = -1;
  for (const p of pixels) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const stitches = [];

  // MEJORA: Zigzag pattern para reducir saltos
  for (let yy = 0; yy <= height; yy += step) {
    const y = minY + yy;
    const xVals = [];

    for (let x = minX; x <= maxX; x++) {
      if (pixelSet.has(`${x},${y}`)) {
        xVals.push(x);
      }
    }

    for (let i = 0; i < xVals.length; i++) {
      const start = xVals[i];
      let end = start;

      while (i + 1 < xVals.length && xVals[i + 1] === xVals[i] + 1) {
        i++;
        end = xVals[i];
      }

      const points = [];
      for (let x = start; x <= end; x += step) {
        points.push({ x, y });
      }

      // Invertir en líneas alternas
      if ((yy / step) % 2 === 1) {
        points.reverse();
      }

      stitches.push(...points);
    }
  }

  return stitches;
}

// ============================================================================
// MEJORA 2: PATH SIMPLIFICATION (Douglas-Peucker)
// ============================================================================

function simplifyPath(points, tolerance) {
  if (points.length < 3) return points;
  const simplified = douglasPeucker(points, tolerance);
  return simplified.length > 2 ? simplified : points;
}

function douglasPeucker(points, epsilon) {
  let maxDist = 0;
  let maxIdx = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [start, end];
}

function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const denom = dx * dx + dy * dy;
  
  if (denom === 0) {
    return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
  }

  const t = Math.max(0, Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / denom));
  const projX = lineStart.x + t * dx;
  const projY = lineStart.y + t * dy;
  
  return Math.hypot(point.x - projX, point.y - projY);
}

// ============================================================================
// MEJORA 3: CURVATURE ANALYSIS
// ============================================================================

function calculateCurvature(points) {
  if (points.length < 3) return 0;

  let totalAngleChange = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const p3 = points[i + 1];

    const v1x = p2.x - p1.x;
    const v1y = p2.y - p1.y;
    const v2x = p3.x - p2.x;
    const v2y = p3.y - p2.y;

    const dot = v1x * v2x + v1y * v2y;
    const cross = Math.abs(v1x * v2y - v1y * v2x);
    const angle = Math.atan2(cross, dot);

    totalAngleChange += Math.abs(angle);
  }

  return Math.min(1, totalAngleChange / points.length);
}

// ============================================================================
// HELPERS
// ============================================================================

function rgbToHex(color) {
  const r = Math.round(color.r).toString(16).padStart(2, '0');
  const g = Math.round(color.g).toString(16).padStart(2, '0');
  const b = Math.round(color.b).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}