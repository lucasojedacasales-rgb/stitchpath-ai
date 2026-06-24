/* global Deno */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * MOTOR DE BORDADO INTEGRADO (end-to-end)
 * Entrada: imagen raster → Salida: archivo DST/PES/etc binario
 * Pipeline: Vectoriza → Analiza → Genera stitches → Optimiza → Exporta
 */
Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'POST only' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const {
      pixels,
      width,
      height,
      width_mm = 100,
      height_mm = 100,
      format_type = 'DST',
      project_name = 'design'
    } = payload;

    console.log(`[MOTOR] Starting: ${width}x${height}px → ${width_mm}x${height_mm}mm, format=${format_type}`);

    if (!pixels || !width || !height) {
      throw new Error('Invalid image data');
    }

    let pixelData = pixels;
    if (!(pixelData instanceof Uint8ClampedArray) && Array.isArray(pixelData)) {
      pixelData = new Uint8ClampedArray(pixelData);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FASE 1: VECTORIZACIÓN (raster → regiones cerradas)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('[MOTOR] Phase 1: Vectorization');
    
    // Vectorización integrada: escala → bilateral → kmeans → componentes → scanlines
    const vecResult = vectorizeWithAdvancedEngine(pixelData, width, height, width_mm, height_mm);
    const regions = vecResult.regions;
    console.log(`[MOTOR] → ${regions.length} regions, ${regions.reduce((s, r) => s + (r.pointCount || 0), 0)} candidate stitches`);

    if (regions.length === 0) {
      throw new Error('Vectorization produced no regions');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FASE 2: CLASIFICACIÓN DE STITCHES (qué tipo para cada región)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('[MOTOR] Phase 2: Stitch classification');
    const classifiedRegions = regions.map(r => ({
      ...r,
      stitch_type: classifyStitchType(r)
    }));

    // ═══════════════════════════════════════════════════════════════════════════
    // FASE 3: GENERACIÓN DE STITCHES (regiones → comandos máquina)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('[MOTOR] Phase 3: Stitch generation');
    const stitchBlocks = classifiedRegions.flatMap(r => generateStitchesForRegion(r));
    console.log(`[MOTOR] → ${stitchBlocks.length} stitch blocks generated`);

    if (stitchBlocks.length === 0) {
      throw new Error('Stitch generation produced no output');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FASE 4: OPTIMIZACIÓN DE SECUENCIA (minimiza saltos + cambios de color)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('[MOTOR] Phase 4: Sequence optimization');
    const optimizedBlocks = optimizeSequence(stitchBlocks, width_mm, height_mm);

    // ═══════════════════════════════════════════════════════════════════════════
    // FASE 5: EXPORTACIÓN A FORMATO MÁQUINA
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('[MOTOR] Phase 5: Export to ' + format_type);
    const binary = exportToFormat(optimizedBlocks, format_type, project_name);
    console.log(`[MOTOR] ✅ SUCCESS: ${binary.length} bytes`);

    return Response.json({
      success: true,
      data: {
        format: format_type,
        filename: `${project_name}.${format_type.toLowerCase()}`,
        size_bytes: binary.length,
        blocks: optimizedBlocks,
        stitches: optimizedBlocks.reduce((s, b) => s + (b.stitches?.length || 0), 0),
        binary: Array.from(binary)
      }
    });
  } catch (error) {
    console.error('[MOTOR] FATAL:', error.message);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// VECTORIZACIÓN INTEGRADA - Engine Avanzado Inline
// ═════════════════════════════════════════════════════════════════════════════

function vectorizeWithAdvancedEngine(pixels, srcW, srcH, mmW, mmH) {
  // PASO 1: Escalar inteligentemente
  const scaled = intelligentScale(pixels, srcW, srcH);

  // PASO 2: Bilateral filter
  const filtered = bilateralFilterInline(scaled.data, scaled.w, scaled.h);

  // PASO 3: K-means clustering
  const { quantized, palette } = kmeansClusterInline(filtered, scaled.w, scaled.h, 8);

  // PASO 4: Detectar componentes
  const components = findComponentsInline(quantized, scaled.w, scaled.h);

  // PASO 5: Generar regiones
  const regions = [];
  const pxPerMM_x = mmW / scaled.w;
  const pxPerMM_y = mmH / scaled.h;

  for (const comp of components) {
    if (comp.pixels.length < 8) continue;

    const color = palette[comp.color];
    const hexColor = rgbToHex(color);
    const stitches = generateTatamiScanlinesInline(comp.pixels, scaled.w, scaled.h, 0.8);

    if (stitches.length > 3) {
      // Convertir a mm
      const pathPoints = stitches.map(p => [
        p.x * pxPerMM_x / mmW,
        p.y * pxPerMM_y / mmH
      ]);

      regions.push({
        id: `r${regions.length}`,
        color: hexColor,
        stitches: stitches.map(p => ({ x: p.x * pxPerMM_x, y: p.y * pxPerMM_y })),
        path_points: pathPoints,
        pointCount: stitches.length,
        visible: true
      });
    }
  }

  return { regions, palette };
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

function bilateralFilterInline(src, w, h) {
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

function kmeansClusterInline(pixels, w, h, k) {
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

  for (let iter = 0; iter < 5; iter++) {
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

function findComponentsInline(labels, w, h) {
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

function generateTatamiScanlinesInline(pixelIndices, w, h, density) {
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

  // Zigzag pattern para reducir saltos
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

      if ((yy / step) % 2 === 1) {
        points.reverse(); // Invertir dirección en líneas alternas
      }

      stitches.push(...points);
    }
  }

  return stitches;
}

function rgbToHex(color) {
  const r = Math.round(color.r).toString(16).padStart(2, '0');
  const g = Math.round(color.g).toString(16).padStart(2, '0');
  const b = Math.round(color.b).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// FASE 2: CLASIFICACIÓN DE STITCHES
// ═════════════════════════════════════════════════════════════════════════════

function classifyStitchType(region) {
  const count = region.pointCount || 0;

  // Simple heurística: conteo de puntos
  if (count < 50) return 'running_stitch';
  if (count < 200) return 'satin';
  return 'fill';
}

// ═════════════════════════════════════════════════════════════════════════════
// FASE 3: GENERACIÓN DE STITCHES
// ═════════════════════════════════════════════════════════════════════════════

function generateStitchesForRegion(region) {
  const blocks = [];

  if (region.stitch_type === 'fill') {
    blocks.push(generateFillStitches(region));
  } else if (region.stitch_type === 'satin') {
    blocks.push(generateSatinStitches(region));
  } else {
    blocks.push(generateRunningStitches(region));
  }

  return blocks;
}

function generateFillStitches(region) {
  const stitches = [];
  const pathPoints = region.path_points || [];

  if (pathPoints.length < 3) {
    return { type: 'fill', color: region.color, stitches: [] };
  }

  // Bounding box
  let minY = Infinity, maxY = -Infinity;
  for (const p of pathPoints) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }

  // Líneas horizontales (scanlines) cada 1.5mm
  const spacing = 1.5;
  for (let y = minY; y <= maxY; y += spacing) {
    // Encontrar intersecciones con el boundary
    const intersections = [];
    for (let i = 0; i < pathPoints.length; i++) {
      const p1 = pathPoints[i];
      const p2 = pathPoints[(i + 1) % pathPoints.length];

      if ((p1[1] <= y && p2[1] >= y) || (p2[1] <= y && p1[1] >= y)) {
        const t = (p2[1] - p1[1]) !== 0 ? (y - p1[1]) / (p2[1] - p1[1]) : 0;
        const x = p1[0] + t * (p2[0] - p1[0]);
        intersections.push(x);
      }
    }

    intersections.sort((a, b) => a - b);

    // Generar stitches entre pares de intersecciones
    for (let i = 0; i < intersections.length - 1; i += 2) {
      const x1 = intersections[i];
      const x2 = intersections[i + 1];

      // Zigzag: alternar dirección
      if (Math.floor(y / spacing) % 2 === 0) {
        stitches.push([x1, y]);
        stitches.push([x2, y]);
      } else {
        stitches.push([x2, y]);
        stitches.push([x1, y]);
      }
    }
  }

  return {
    id: region.id,
    type: 'fill',
    color: region.color,
    stitches: stitches.length > 0 ? stitches : region.path_points
  };
}

function generateSatinStitches(region) {
  // Paralelas al contorno
  const stitches = region.path_points ? [...region.path_points] : [];

  return {
    id: region.id,
    type: 'satin',
    color: region.color,
    stitches: stitches
  };
}

function generateRunningStitches(region) {
  // Contorno simple
  const stitches = region.path_points ? [...region.path_points] : [];

  return {
    id: region.id,
    type: 'running_stitch',
    color: region.color,
    stitches: stitches
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// FASE 4: OPTIMIZACIÓN DE SECUENCIA
// ═════════════════════════════════════════════════════════════════════════════

function optimizeSequence(blocks, mmW, mmH) {
  // Calcular centroides
  const withCentroids = blocks.map(b => {
    let cx = 0, cy = 0;
    if (b.stitches && b.stitches.length > 0) {
      for (const [x, y] of b.stitches) {
        cx += x;
        cy += y;
      }
      cx /= b.stitches.length;
      cy /= b.stitches.length;
    }
    return { ...b, cx, cy };
  });

  // Agrupar por color
  const colorGroups = {};
  for (const block of withCentroids) {
    const color = block.color || 'default';
    if (!colorGroups[color]) colorGroups[color] = [];
    colorGroups[color].push(block);
  }

  // Ordenar cada grupo por proximidad (greedy TSP)
  const optimized = [];
  for (const color of Object.keys(colorGroups)) {
    const group = colorGroups[color];
    const ordered = [group[0]];
    const visited = new Set([0]);

    for (let i = 1; i < group.length; i++) {
      const last = ordered[ordered.length - 1];
      let nearest = -1;
      let minDist = Infinity;

      for (let j = 0; j < group.length; j++) {
        if (visited.has(j)) continue;
        const dist = Math.hypot(group[j].cx - last.cx, group[j].cy - last.cy);
        if (dist < minDist) {
          minDist = dist;
          nearest = j;
        }
      }

      if (nearest >= 0) {
        ordered.push(group[nearest]);
        visited.add(nearest);
      }
    }

    optimized.push(...ordered);
  }

  // Insertar TRIM entre bloques
  const withTrims = [];
  for (let i = 0; i < optimized.length; i++) {
    const block = optimized[i];
    if (i > 0) {
      const prev = optimized[i - 1];
      if (prev.color !== block.color) {
        withTrims.push({ type: 'trim', color: block.color, stitches: [] });
      }
    }
    withTrims.push(block);
  }

  return withTrims;
}

// ═════════════════════════════════════════════════════════════════════════════
// FASE 5: EXPORTACIÓN
// ═════════════════════════════════════════════════════════════════════════════

function exportToFormat(blocks, format, projectName) {
  format = format.toUpperCase();

  if (format === 'DST') return exportDST(blocks);
  if (format === 'PES') return exportPES(blocks);
  if (format === 'JEF') return exportJEF(blocks);
  if (format === 'EXP') return exportEXP(blocks);
  if (format === 'VP3') return exportVP3(blocks);

  return exportDST(blocks); // Default
}

function exportDST(blocks) {
  const buffer = new Uint8Array(512 + 10000); // Header + data
  let dataOffset = 512;
  let x = 0, y = 0;

  // Header
  const header = 'LA:';
  for (let i = 0; i < 3; i++) {
    buffer[i] = header.charCodeAt(i);
  }

  for (const block of blocks) {
    if (block.type === 'trim') {
      buffer[dataOffset++] = 0xD0; // TRIM
    } else if (block.stitches) {
      for (const [px, py] of block.stitches) {
        const dx = Math.max(-127, Math.min(127, Math.round(px) - x));
        const dy = Math.max(-127, Math.min(127, Math.round(py) - y));

        buffer[dataOffset++] = ((dy >> 4) & 0x0F) | (((dx >> 4) & 0x0F) << 4);
        buffer[dataOffset++] = dx & 0x0F;
        buffer[dataOffset++] = dy & 0x0F;

        x += dx;
        y += dy;
      }
    }
  }

  buffer[dataOffset++] = 0xF0; // END
  return buffer.slice(0, dataOffset);
}

function exportPES(blocks) {
  const buffer = [];
  buffer.push(...'PES\0'.split('').map(c => c.charCodeAt(0)));
  buffer.push(...[0, 0, 0, 0]);

  let x = 0, y = 0;

  for (const block of blocks) {
    if (block.type === 'trim') {
      buffer.push(0xFF, 0x00);
    } else if (block.stitches) {
      for (const [px, py] of block.stitches) {
        const dx = Math.round(px) - x;
        const dy = Math.round(py) - y;

        if (Math.abs(dx) < 128 && Math.abs(dy) < 128) {
          buffer.push(dx & 0xFF, dy & 0xFF);
        } else {
          buffer.push(0x80, (dx >> 8) & 0xFF, dx & 0xFF, (dy >> 8) & 0xFF, dy & 0xFF);
        }

        x += dx;
        y += dy;
      }
    }
  }

  buffer.push(0xFF, 0xFF);
  return new Uint8Array(buffer);
}

function exportJEF(blocks) {
  const buffer = [];
  buffer.push(...'JEF\0'.split('').map(c => c.charCodeAt(0)));

  let x = 0, y = 0;

  for (const block of blocks) {
    if (block.type === 'trim') {
      buffer.push(0xFF, 0x00);
    } else if (block.stitches) {
      for (const [px, py] of block.stitches) {
        const dx = Math.round(px) - x;
        const dy = Math.round(py) - y;

        if (Math.abs(dx) < 128 && Math.abs(dy) < 128) {
          buffer.push(dx & 0xFF, dy & 0xFF);
        } else {
          buffer.push(0x80, (dx >> 8) & 0xFF, dx & 0xFF, (dy >> 8) & 0xFF, dy & 0xFF);
        }

        x += dx;
        y += dy;
      }
    }
  }

  buffer.push(0xFF, 0xFF);
  return new Uint8Array(buffer);
}

function exportEXP(blocks) {
  const buffer = [];
  buffer.push(...[0x54, 0x54, 0x00, 0x00, 0, 0, 0, 0]);

  let x = 0, y = 0;

  for (const block of blocks) {
    if (block.type === 'trim') {
      buffer.push(0xFF, 0x00, 0xFF, 0x00);
    } else if (block.stitches) {
      for (const [px, py] of block.stitches) {
        const dx = Math.round((px - x) * 2);
        const dy = Math.round((py - y) * 2);

        buffer.push(dx & 0xFF, (dx >> 8) & 0xFF, dy & 0xFF, (dy >> 8) & 0xFF);

        x = Math.round(px);
        y = Math.round(py);
      }
    }
  }

  return new Uint8Array(buffer);
}

function exportVP3(blocks) {
  const buffer = [];
  buffer.push(...[0, 0, 0, 0, 0, 0, 0, 0]);

  let x = 0, y = 0;

  for (const block of blocks) {
    if (block.type === 'trim') {
      buffer.push(0xFF, 0x00);
    } else if (block.stitches) {
      for (const [px, py] of block.stitches) {
        const dx = Math.round(px) - x;
        const dy = Math.round(py) - y;

        if (Math.abs(dx) < 128 && Math.abs(dy) < 128) {
          buffer.push(dx & 0xFF, dy & 0xFF);
        } else {
          buffer.push(0x80, (dx >> 8) & 0xFF, dx & 0xFF, (dy >> 8) & 0xFF, dy & 0xFF);
        }

        x += dx;
        y += dy;
      }
    }
  }

  buffer.push(0xFF, 0xFF);
  return new Uint8Array(buffer);
}