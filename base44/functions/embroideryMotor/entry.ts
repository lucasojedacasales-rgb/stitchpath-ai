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
    const regions = vectorizeImage(pixelData, width, height, width_mm, height_mm);
    console.log(`[MOTOR] → ${regions.length} regions, ${regions.reduce((s, r) => s + r.stitches.length, 0)} candidate stitches`);

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
// FASE 1: VECTORIZACIÓN
// ═════════════════════════════════════════════════════════════════════════════

function vectorizeImage(pixels, srcW, srcH, mmW, mmH) {
  // Redimensionar a máx 256px para eficiencia
  const SCALE = 256;
  const s = Math.max(srcW, srcH);
  const scale = s > SCALE ? SCALE / s : 1;
  const dstW = Math.round(srcW * scale);
  const dstH = Math.round(srcH * scale);

  const scaled = scaleImage(pixels, srcW, srcH, dstW, dstH);

  // Cuantizar a 8 colores principales
  const { labels, palette } = quantizeColors(scaled.pixels, dstW, dstH, 8);

  // Generar regiones por color (scanlines)
  const regions = [];
  const pxPerMMx = mmW / dstW;
  const pxPerMMy = mmH / dstH;

  for (let colorIdx = 0; colorIdx < palette.length; colorIdx++) {
    const stitches = scanlineRegion(labels, dstW, dstH, colorIdx);

    if (stitches.length > 5) {
      // Convertir a mm
      const pathPoints = stitches.map(p => [
        p.x * pxPerMMx,
        p.y * pxPerMMy
      ]);

      regions.push({
        id: `r${colorIdx}`,
        color: palette[colorIdx],
        stitches: stitches,
        path_points: pathPoints,
        pointCount: stitches.length,
        visible: true
      });
    }
  }

  return regions;
}

function scaleImage(pixels, srcW, srcH, dstW, dstH) {
  const dst = new Uint8ClampedArray(dstW * dstH * 4);

  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const sx = Math.floor((x / dstW) * srcW);
      const sy = Math.floor((y / dstH) * srcH);
      const srcIdx = (sy * srcW + sx) * 4;
      const dstIdx = (y * dstW + x) * 4;

      dst[dstIdx] = pixels[srcIdx];
      dst[dstIdx + 1] = pixels[srcIdx + 1];
      dst[dstIdx + 2] = pixels[srcIdx + 2];
      dst[dstIdx + 3] = 255;
    }
  }

  return { pixels: dst, width: dstW, height: dstH };
}

function quantizeColors(pixels, width, height, k) {
  const colorMap = new Map();

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] & 0xE0;
    const g = pixels[i + 1] & 0xE0;
    const b = pixels[i + 2] & 0xE0;
    const key = `${r},${g},${b}`;
    colorMap.set(key, (colorMap.get(key) || 0) + 1);
  }

  const palette = Array.from(colorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([key]) => {
      const [r, g, b] = key.split(',').map(Number);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    });

  const labels = new Uint8Array(width * height);

  for (let i = 0, idx = 0; i < pixels.length; i += 4, idx++) {
    const r = pixels[i] & 0xE0;
    const g = pixels[i + 1] & 0xE0;
    const b = pixels[i + 2] & 0xE0;

    let bestIdx = 0;
    let bestDist = Infinity;

    for (let j = 0; j < palette.length; j++) {
      const hexR = parseInt(palette[j].slice(1, 3), 16);
      const hexG = parseInt(palette[j].slice(3, 5), 16);
      const hexB = parseInt(palette[j].slice(5, 7), 16);
      const dist = (r - hexR) ** 2 + (g - hexG) ** 2 + (b - hexB) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = j;
      }
    }

    labels[idx] = bestIdx;
  }

  return { labels, palette };
}

function scanlineRegion(labels, width, height, colorIdx) {
  const stitches = [];
  const STEP = 2; // cada 2 píxeles = resolución base

  for (let y = 0; y < height; y += STEP) {
    let inRun = false;
    let runStart = -1;

    for (let x = 0; x < width; x++) {
      const current = labels[y * width + x];

      if (current === colorIdx && !inRun) {
        inRun = true;
        runStart = x;
      } else if (current !== colorIdx && inRun) {
        // Fin de run: agregar puntos del run
        for (let px = runStart; px < x; px += STEP) {
          if (labels[y * width + px] === colorIdx) {
            stitches.push({ x: px, y });
          }
        }
        inRun = false;
      }
    }

    if (inRun) {
      for (let px = runStart; px < width; px += STEP) {
        if (labels[y * width + px] === colorIdx) {
          stitches.push({ x: px, y });
        }
      }
    }
  }

  return stitches;
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