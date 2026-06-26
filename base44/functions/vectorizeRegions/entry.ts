import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { 
      imageUrl, 
      colorClusters = 12,
    edgeThreshold = 0.18,
    minRegionArea = 8,
    tatamiDensity = 0.4,
    tatamiStitchLength = 2.5,
    tatamiAngle = 45,
    contourSatinWidth = 0.6,
    rdpEpsilon = 0.25,
    posterizeLevels = 5,
    mergeColorThreshold = 85,
    maxRegions = 400
    } = await req.json();
    
    if (!imageUrl) return Response.json({ error: 'imageUrl required' }, { status: 400 });

    const startMs = Date.now();
    console.log("=== MOTOR CUSTOM === maxRegions:", maxRegions);
    
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) return Response.json({ error: 'Could not fetch image' }, { status: 400 });
    
    const arrayBuffer = await imgResp.arrayBuffer();
    const { Jimp } = await import('npm:jimp@1.6.0');
    const image = await Jimp.fromBuffer(Buffer.from(arrayBuffer));

    const origW = image.width;
    const origH = image.height;

    const scale = Math.min(600 / origW, 600 / origH, 1);
    const W = Math.round(origW * scale);
    const H = Math.round(origH * scale);
    
    image.resize({ w: W, h: H });

    const rgba = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const pixelData = image.getPixelColor(x, y);
        const i = (y * W + x) * 4;
        rgba[i]     = (pixelData >>> 24) & 0xff;
        rgba[i + 1] = (pixelData >>> 16) & 0xff;
        rgba[i + 2] = (pixelData >>> 8)  & 0xff;
        rgba[i + 3] = pixelData & 0xff;
      }
    }

    const mmPerPx = 100 / origW / scale;

    // === PASO 1: POSTERIZE ELIMINADO ===
    // posterizeImage(rgba, W, H, posterizeLevels);

    const gray = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const r = rgba[i*4], g = rgba[i*4+1], b = rgba[i*4+2];
      gray[i] = 0.299*r + 0.587*g + 0.114*b;
    }

    const blurred = gaussianBlur(gray, W, H);
    const { mag } = sobelGradientsSimple(blurred, W, H);

    const edgeThresholdPx = edgeThreshold * 255;
    const edges = new Float32Array(W * H);
    for (let i = 0; i < mag.length; i++) {
      if (mag[i] > edgeThresholdPx) edges[i] = mag[i];
    }

    const k = Math.max(3, Math.min(colorClusters, 10));
    
    const samples = [];
    const step = Math.max(1, Math.floor(Math.sqrt(W * H / 10000)));
    
    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        const i = (y * W + x) * 4;
        if (rgba[i + 3] < 128) continue;
        const r = rgba[i], g = rgba[i+1], b = rgba[i+2];
        samples.push({ idx: Math.floor(i / 4), rgb: [r, g, b], lab: rgbToLab(r, g, b) });
      }
    }

    if (samples.length === 0) return Response.json({ error: 'No foreground pixels' }, { status: 400 });

    let centroidsLab = [samples[Math.floor(Math.random() * samples.length)].lab];
    let centroidsRgb = [samples[Math.floor(Math.random() * samples.length)].rgb];
    
    while (centroidsLab.length < k) {
      const dists = samples.map(s => 
        Math.min(...centroidsLab.map(c => distSqLab(s.lab, c)))
      );
      const total = dists.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      for (let i = 0; i < dists.length; i++) {
        r -= dists[i];
        if (r <= 0) {
          centroidsLab.push([...samples[i].lab]);
          centroidsRgb.push([...samples[i].rgb]);
          break;
        }
      }
      if (centroidsLab.length < k) {
        centroidsLab.push([...samples[samples.length - 1].lab]);
        centroidsRgb.push([...samples[samples.length - 1].rgb]);
      }
    }

    const labels = new Int32Array(W * H).fill(-1);
    for (let iter = 0; iter < 15; iter++) {
      const sums = centroidsLab.map(() => [0, 0, 0, 0]);
      
      for (const s of samples) {
        const ci = nearestIdxLab(s.lab, centroidsLab);
        labels[s.idx] = ci;
        sums[ci][0] += s.rgb[0];
        sums[ci][1] += s.rgb[1];
        sums[ci][2] += s.rgb[2];
        sums[ci][3]++;
      }
      
      for (let ci = 0; ci < k; ci++) {
        const cnt = sums[ci][3];
        if (cnt > 0) {
          centroidsRgb[ci] = [sums[ci][0]/cnt, sums[ci][1]/cnt, sums[ci][2]/cnt];
          centroidsLab[ci] = rgbToLab(sums[ci][0]/cnt, sums[ci][1]/cnt, sums[ci][2]/cnt);
        }
      }
    }

    for (let i = 0; i < W * H; i++) {
      if (labels[i] === -1 && rgba[i*4+3] >= 128) {
        const r = rgba[i*4], g = rgba[i*4+1], b = rgba[i*4+2];
        labels[i] = nearestIdxLab(rgbToLab(r, g, b), centroidsLab);
      }
    }

    // === PASO 2: MERGE DE COLORES CORREGIDO ===
    mergeColorsConservative(labels, W, H, centroidsLab, centroidsRgb, mergeColorThreshold);

    for (let i = 0; i < W * H; i++) {
      if (edges[i] > 0 && labels[i] !== -1) {
        const x = i % W;
        const y = Math.floor(i / W);
        
        const neighborColors = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
            const ni = ny * W + nx;
            if (labels[ni] !== -1 && edges[ni] === 0) {
              neighborColors.push(labels[ni]);
            }
          }
        }
        
        if (neighborColors.length > 0) {
          const colorCounts = {};
          let bestColor = neighborColors[0];
          let bestCount = 0;
          for (const c of neighborColors) {
            colorCounts[c] = (colorCounts[c] || 0) + 1;
            if (colorCounts[c] > bestCount) {
              bestCount = colorCounts[c];
              bestColor = c;
            }
          }
          labels[i] = bestColor;
        }
      }
    }

    const minPx = Math.max(5, Math.round(minRegionArea / (mmPerPx * mmPerPx)));
    let regions = floodFillRegions(labels, W, H, centroidsLab.length, minPx, mmPerPx, rgba, centroidsRgb);

    // === PASO 3: MERGE POR PROXIMIDAD EN LUGAR DE SMALLEST ===
    if (regions.length > maxRegions) {
      regions = mergeRegionsByProximity(regions, 20); // 20px de distancia máxima
      // Si aún hay muchas, mergear las más pequeñas del mismo color que se tocan
      if (regions.length > maxRegions * 1.2) {
        regions = mergeSmallestSameColor(regions, maxRegions);
      }
    }

    const designContour = traceDesignContour(labels, W, H);

    const outputRegions = [];

    for (const reg of regions) {
      let contour = traceContour(reg.mask, W, H);
      if (contour.length < 3) continue;

      contour = smoothContour(contour, 2);

      const bbox = reg.bbox;
      const bboxW = bbox.maxX - bbox.minX;
      const bboxH = bbox.maxY - bbox.minY;

      const regionSize = Math.sqrt(bboxW * bboxW + bboxH * bboxH);
      const adaptiveEpsilon = Math.max(0.5, rdpEpsilon * (regionSize / 100));
      let simplified = rdp(contour, adaptiveEpsilon / mmPerPx);
      
      if (simplified.length < 6) {
        simplified = rdp(contour, (adaptiveEpsilon * 0.5) / mmPerPx);
      }
      if (simplified.length < 4) continue;

      simplified = closePolygon(simplified, 2.0);

      const polygon = simplified.map(([x, y]) => [
        parseFloat(((x - W/2) * mmPerPx).toFixed(4)),
        parseFloat(((y - H/2) * mmPerPx).toFixed(4)),
      ]);

      const areaMm2 = reg.pixelCount * mmPerPx * mmPerPx;
      const perimeterMm = contourPerimeterMm(simplified, mmPerPx);

      const isExternalBorder = isRegionOnDesignBorder(reg, designContour, W, H);

      // === CÁLCULO DE MOMENTOS Y MÉTRICAS ===
      let mu20 = 0, mu02 = 0, mu11 = 0;
      const cx = reg.centroid[0], cy = reg.centroid[1];
      for (const px of reg.pixels) {
        const px_x = px % W;
        const px_y = Math.floor(px / W);
        const dx = px_x - cx;
        const dy = px_y - cy;
        mu20 += dx * dx;
        mu02 += dy * dy;
        mu11 += dx * dy;
      }

      const trace = mu20 + mu02;
      const det = mu20 * mu02 - mu11 * mu11;
      const discriminant = Math.sqrt(Math.max(0, trace * trace - 4 * det));
      const lambda1 = (trace + discriminant) / 2;
      const lambda2 = (trace - discriminant) / 2;

      const inertiaRatio = lambda2 > 0.001 ? Math.sqrt(lambda1 / lambda2) : 1;

      const bboxWmm = bboxW * mmPerPx;
      const bboxHmm = bboxH * mmPerPx;
      const bboxAspect = Math.max(bboxWmm, bboxHmm) / Math.max(0.1, Math.min(bboxWmm, bboxHmm));

      // === COMPACIDAD: 1 = círculo, 0 = línea ===
      const perimeterPx = contourPerimeterPx(contour);
      const compacidad = perimeterPx > 0 ? (4 * Math.PI * reg.pixelCount) / (perimeterPx * perimeterPx) : 0;

      // === ÁREA RELATIVA AL DISEÑO ===
      const designAreaMm2 = W * H * mmPerPx * mmPerPx;
      const areaRelativa = areaMm2 / designAreaMm2;

      // === PASO 4: CLASIFICACIÓN MEJORADA ===
      let type = 'fill';

      if (compacidad < 0.2 && areaMm2 < 15) {
        type = 'running_stitch'; // Línea muy delgada y pequeña
      } else if ((compacidad < 0.45 && bboxAspect > 2.2) || (areaMm2 < 35 && inertiaRatio > 2.2 && bboxAspect > 1.6)) {
        type = 'satin'; // Forma alargada mediana, o borde delgado
      } else if (areaMm2 > 3) {
        type = 'fill'; // Zona compacta o grande
      } else {
        type = 'running_stitch'; // Demasiado pequeño para otra cosa
      }

      // Override: si es borde externo del diseño y es fill, convertir a satin
      if (isExternalBorder && type === 'fill' && areaMm2 < 80) {
        type = 'satin';
      }
      
      let stitches = [];
      let contourStitches = [];

      if (type === 'running_stitch') {
        stitches = generateRunContour(polygon, 0.5, mmPerPx);
        contourStitches = stitches;
      } else if (type === 'satin') {
        stitches = generateSatinStitches(polygon, 0.3, mmPerPx);
        contourStitches = stitches;
      } else if (type === 'fill') {
        const regionAngle = computeOptimalFillAngle(reg.mask, W, H);
        stitches = generateTatamiFill(polygon, tatamiDensity, tatamiStitchLength, regionAngle, areaMm2);
        if (isExternalBorder) {
          contourStitches = generateSatinContour(polygon, contourSatinWidth, mmPerPx);
        } else {
          contourStitches = generateRunContour(polygon, 0.5, mmPerPx);
        }
      }
      
      outputRegions.push({
        id: reg.id,
        color: reg.hex,
        type: type,
        path_points: polygon,
        stitches: stitches,
        contour_stitches: contourStitches,
        is_external_border: isExternalBorder,
        stitch_count: stitches.length,
        area_mm2: parseFloat(areaMm2.toFixed(2)),
        perimeter_mm: parseFloat(perimeterMm.toFixed(2)),
        centroid: [
          parseFloat(((reg.centroid[0] - W/2) * mmPerPx).toFixed(4)),
          parseFloat(((reg.centroid[1] - H/2) * mmPerPx).toFixed(4)),
        ],
        coverage: areaMm2 / (100 * 100),
        // === PASO 5: MÉTRICAS GEOMÉTRICAS AÑADIDAS ===
        inertia_ratio: parseFloat(inertiaRatio.toFixed(2)),
        bbox_aspect: parseFloat(bboxAspect.toFixed(2)),
        compacidad: parseFloat(compacidad.toFixed(3)),
        area_relativa: parseFloat(areaRelativa.toFixed(4)),
        fill_angle: type === 'fill' ? computeOptimalFillAngle(reg.mask, W, H) : undefined,
      });
    }

    optimizeRegionOrder(outputRegions);

    if (designContour && designContour.length > 3) {
      const designPolygon = designContour.map(([x, y]) => [
        parseFloat(((x - W/2) * mmPerPx).toFixed(4)),
        parseFloat(((y - H/2) * mmPerPx).toFixed(4)),
      ]);
      
      outputRegions.unshift({
        id: 'design_border',
        color: '#000000',
        type: 'border',
        path_points: designPolygon,
        stitches: generateSatinContour(designPolygon, contourSatinWidth, mmPerPx),
        contour_stitches: generateSatinContour(designPolygon, contourSatinWidth, mmPerPx),
        is_external_border: true,
        stitch_count: 0,
        area_mm2: 0,
        perimeter_mm: contourPerimeterMm(designContour, mmPerPx),
        centroid: [0, 0],
        coverage: 0,
        inertia_ratio: 1,
        bbox_aspect: 1,
        compacidad: 1,
        area_relativa: 0,
      });
    }

    return Response.json({
      regions: outputRegions,
      metadata: {
        totalRegions: outputRegions.length,
        processingTimeMs: Date.now() - startMs,
      }
    });

  } catch (error) {
    console.error('Vectorization error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// === POSTERIZE COMENTADO (opcional, se puede reactivar) ===
function posterizeImage(rgba, W, H, levels) {
  const step = 255 / (levels - 1);
  for (let i = 0; i < W * H * 4; i += 4) {
    if (rgba[i + 3] < 128) continue;
    rgba[i]     = Math.round(rgba[i]     / step) * step;
    rgba[i + 1] = Math.round(rgba[i + 1] / step) * step;
    rgba[i + 2] = Math.round(rgba[i + 2] / step) * step;
  }
}

// === PASO 2: MERGE DE COLORES CONSERVADOR ===
function mergeColorsConservative(labels, W, H, centroidsLab, centroidsRgb, mergeColorThreshold) {
  const k = centroidsLab.length;
  if (k <= 3) return;

  const colorCounts = new Array(k).fill(0);
  for (let i = 0; i < W * H; i++) {
    if (labels[i] !== -1) colorCounts[labels[i]]++;
  }
  const totalPixels = colorCounts.reduce((a, b) => a + b, 0);
  const minAreaThreshold = totalPixels * 0.015; // 1.5% del total (antes 2%)

  const forcedMerges = new Map();
  for (let i = 0; i < k; i++) {
    if (colorCounts[i] < minAreaThreshold) {
      let nearest = -1;
      let nearestDist = Infinity;
      for (let j = 0; j < k; j++) {
        if (i === j || colorCounts[j] < minAreaThreshold) continue;
        const dist = deltaE2000(centroidsLab[i], centroidsLab[j]);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = j;
        }
      }
      if (nearest !== -1) forcedMerges.set(i, nearest);
    }
  }

  const merges = new Map();
  
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const dist = deltaE2000(centroidsLab[i], centroidsLab[j]);
      
      // Solo mergear si:
      // - Ambas áreas son pequeñas (< 5% c/u), o
      // - Son casi idénticas (dist < threshold * 0.4)
      const bothSmall = colorCounts[i] < totalPixels * 0.05 && colorCounts[j] < totalPixels * 0.05;
      const verySimilar = dist < mergeColorThreshold * 0.4;
      
      if (bothSmall || verySimilar) {
        merges.set(j, i);
      }
    }
  }
  
  for (const [smallColor, targetColor] of forcedMerges) {
    merges.set(smallColor, targetColor);
  }
  
  if (merges.size === 0) return;

  const finalMerge = new Map();
  for (let i = 0; i < k; i++) {
    let current = i;
    while (merges.has(current)) {
      current = merges.get(current);
    }
    finalMerge.set(i, current);
  }

  for (let i = 0; i < W * H; i++) {
    if (labels[i] !== -1) labels[i] = finalMerge.get(labels[i]);
  }

  compactColorIndices(labels, W, H, centroidsLab, centroidsRgb);
}

function compactColorIndices(labels, W, H, centroidsLab, centroidsRgb) {
  const used = new Set();
  for (let i = 0; i < W * H; i++) {
    if (labels[i] !== -1) used.add(labels[i]);
  }
  
  const remap = new Map();
  let next = 0;
  for (const c of [...used].sort((a, b) => a - b)) {
    remap.set(c, next++);
  }
  
  for (let i = 0; i < W * H; i++) {
    if (labels[i] !== -1) labels[i] = remap.get(labels[i]);
  }

  const newLab = [];
  const newRgb = [];
  for (const [oldIdx, newIdx] of remap) {
    newLab[newIdx] = centroidsLab[oldIdx];
    newRgb[newIdx] = centroidsRgb[oldIdx];
  }
  
  centroidsLab.length = newLab.length;
  centroidsRgb.length = newRgb.length;
  for (let i = 0; i < newLab.length; i++) {
    centroidsLab[i] = newLab[i];
    centroidsRgb[i] = newRgb[i];
  }
}

// === MERGE POR PROXIMIDAD (mismo color, se tocan o están cerca) ===
function mergeRegionsByProximity(regions, maxDistance) {
  if (regions.length <= 1) return regions;

  const merged = [];
  const used = new Set();

  for (let i = 0; i < regions.length; i++) {
    if (used.has(i)) continue;

    const group = [i];
    used.add(i);

    for (let j = i + 1; j < regions.length; j++) {
      if (used.has(j)) continue;
      if (regions[i].hex !== regions[j].hex) continue;

      const dist = Math.hypot(
        regions[i].centroid[0] - regions[j].centroid[0],
        regions[i].centroid[1] - regions[j].centroid[1]
      );

      if (dist < maxDistance || areRegionsTouching(regions[i], regions[j])) {
        group.push(j);
        used.add(j);
      }
    }

    const base = regions[group[0]];
    const mergedReg = {
      id: base.id,
      colorIdx: base.colorIdx,
      hex: base.hex,
      mask: new Uint8Array(base.mask.length),
      pixels: [...base.pixels],
      pixelCount: base.pixelCount,
      centroid: [...base.centroid],
      bbox: { ...base.bbox }
    };

    for (let m = 0; m < base.mask.length; m++) mergedReg.mask[m] = base.mask[m];

    for (let j = 1; j < group.length; j++) {
      const reg = regions[group[j]];
      for (let m = 0; m < reg.mask.length; m++) mergedReg.mask[m] = mergedReg.mask[m] || reg.mask[m];
      mergedReg.pixels.push(...reg.pixels);
      mergedReg.pixelCount += reg.pixelCount;
      mergedReg.bbox.minX = Math.min(mergedReg.bbox.minX, reg.bbox.minX);
      mergedReg.bbox.maxX = Math.max(mergedReg.bbox.maxX, reg.bbox.maxX);
      mergedReg.bbox.minY = Math.min(mergedReg.bbox.minY, reg.bbox.minY);
      mergedReg.bbox.maxY = Math.max(mergedReg.bbox.maxY, reg.bbox.maxY);
    }

    mergedReg.centroid = [
      (mergedReg.bbox.minX + mergedReg.bbox.maxX) / 2,
      (mergedReg.bbox.minY + mergedReg.bbox.maxY) / 2
    ];

    merged.push(mergedReg);
  }

  return merged;
}

// === MERGE DE REGIONES PEQUEÑAS DEL MISMO COLOR QUE SE TOCAN ===
function mergeSmallestSameColor(regions, targetCount) {
  while (regions.length > targetCount) {
    let smallestIdx = 0;
    let smallestArea = Infinity;
    
    for (let i = 0; i < regions.length; i++) {
      const area = regions[i].pixelCount;
      if (area < smallestArea) {
        smallestArea = area;
        smallestIdx = i;
      }
    }

    const small = regions[smallestIdx];
    let nearestIdx = -1;
    let nearestDist = Infinity;

    // Primero: buscar del MISMO color que se toca
    for (let i = 0; i < regions.length; i++) {
      if (i === smallestIdx) continue;
      if (regions[i].hex !== small.hex) continue;
      if (!areRegionsTouching(regions[i], small)) continue;
      
      const dist = Math.hypot(
        regions[i].centroid[0] - small.centroid[0],
        regions[i].centroid[1] - small.centroid[1]
      );
      
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    // Si no hay del mismo color que toque, buscar el más cercano del mismo color
    if (nearestIdx === -1) {
      for (let i = 0; i < regions.length; i++) {
        if (i === smallestIdx) continue;
        if (regions[i].hex !== small.hex) continue;
        const dist = Math.hypot(
          regions[i].centroid[0] - small.centroid[0],
          regions[i].centroid[1] - small.centroid[1]
        );
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }
    }

    // Último recurso: cualquier color que se toque
    if (nearestIdx === -1) {
      for (let i = 0; i < regions.length; i++) {
        if (i === smallestIdx) continue;
        if (!areRegionsTouching(regions[i], small)) continue;
        const dist = Math.hypot(
          regions[i].centroid[0] - small.centroid[0],
          regions[i].centroid[1] - small.centroid[1]
        );
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }
    }

    if (nearestIdx === -1) break;

    const target = regions[nearestIdx];
    for (let m = 0; m < small.mask.length; m++) target.mask[m] = target.mask[m] || small.mask[m];
    target.pixels.push(...small.pixels);
    target.pixelCount += small.pixelCount;
    target.bbox.minX = Math.min(target.bbox.minX, small.bbox.minX);
    target.bbox.maxX = Math.max(target.bbox.maxX, small.bbox.maxX);
    target.bbox.minY = Math.min(target.bbox.minY, small.bbox.minY);
    target.bbox.maxY = Math.max(target.bbox.maxY, small.bbox.maxY);
    target.centroid = [
      (target.bbox.minX + target.bbox.maxX) / 2,
      (target.bbox.minY + target.bbox.maxY) / 2
    ];

    regions.splice(smallestIdx, 1);
  }

  return regions;
}

function areRegionsTouching(r1, r2) {
  const overlapX = !(r1.bbox.maxX < r2.bbox.minX - 1 || r2.bbox.maxX < r1.bbox.minX - 1);
  const overlapY = !(r1.bbox.maxY < r2.bbox.minY - 1 || r2.bbox.maxY < r1.bbox.minY - 1);
  return overlapX && overlapY;
}

function floodFillRegions(labels, W, H, k, minPx, mmPerPx, rgba, centroids) {
  const regions = [];
  let nextId = 0;

  for (let ci = 0; ci < k; ci++) {
    const visited = new Uint8Array(W * H);

    for (let start = 0; start < W * H; start++) {
      if (labels[start] !== ci || visited[start]) continue;

      const stack = [start];
      const pixelList = [];
      let minX = W, maxX = 0, minY = H, maxY = 0, sx = 0, sy = 0;

      while (stack.length > 0) {
        const idx = stack.pop();
        if (visited[idx] || labels[idx] !== ci) continue;
        visited[idx] = 1;
        pixelList.push(idx);

        const x = idx % W, y = Math.floor(idx / W);
        sx += x; sy += y;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;

        if (x > 0) stack.push(idx - 1);
        if (x < W - 1) stack.push(idx + 1);
        if (y > 0) stack.push(idx - W);
        if (y < H - 1) stack.push(idx + W);
      }

      if (pixelList.length < minPx) continue;

      const mask = new Uint8Array(W * H);
      for (const px of pixelList) mask[px] = 1;

      regions.push({
        id: `region_${String(nextId + 1).padStart(3, '0')}`,
        colorIdx: ci,
        hex: rgbToHex(centroids[ci]),
        mask,
        pixels: pixelList,
        pixelCount: pixelList.length,
        centroid: [sx / pixelList.length, sy / pixelList.length],
        bbox: { minX, maxX, minY, maxY }
      });
      nextId++;
    }
  }

  return regions;
}

function smoothContour(contour, windowSize) {
  if (contour.length < windowSize * 2) return contour;
  const smoothed = [];
  const n = contour.length;
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0, wSum = 0;
    for (let j = -windowSize; j <= windowSize; j++) {
      const idx = (i + j + n) % n;
      const w = 1.0 / (1.0 + Math.abs(j));
      sx += contour[idx][0] * w;
      sy += contour[idx][1] * w;
      wSum += w;
    }
    smoothed.push([sx / wSum, sy / wSum]);
  }
  return smoothed;
}

function traceDesignContour(labels, W, H) {
  const visited = new Uint8Array(W * H);
  let start = -1;
  for (let i = 0; i < W * H; i++) {
    if (labels[i] !== -1) { start = i; break; }
  }
  if (start === -1) return [];

  const stack = [start];
  const designPixels = new Set();
  
  while (stack.length > 0) {
    const idx = stack.pop();
    if (visited[idx] || labels[idx] === -1) continue;
    visited[idx] = 1;
    designPixels.add(idx);

    const x = idx % W, y = Math.floor(idx / W);
    const neighbors = [idx - 1, idx + 1, idx - W, idx + W];
    for (const n of neighbors) {
      const nx = n % W, ny = Math.floor(n / W);
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && !visited[n]) {
        stack.push(n);
      }
    }
  }

  const borderPixels = [];
  for (const idx of designPixels) {
    const x = idx % W, y = Math.floor(idx / W);
    const neighbors = [idx - 1, idx + 1, idx - W, idx + W];
    let isBorder = false;
    for (const n of neighbors) {
      const nx = n % W, ny = Math.floor(n / W);
      if (nx < 0 || nx >= W || ny < 0 || ny >= H || labels[n] === -1) {
        isBorder = true;
        break;
      }
    }
    if (isBorder) borderPixels.push([x, y]);
  }

  if (borderPixels.length === 0) return [];
  return rdp(smoothContour(borderPixels, 2), 1.0);
}

function isRegionOnDesignBorder(region, designContour, W, H) {
  if (!designContour || designContour.length === 0) return false;
  const { bbox } = region;
  const margin = 5;
  return bbox.minX <= margin || bbox.maxX >= W - margin ||
         bbox.minY <= margin || bbox.maxY >= H - margin;
}

function traceContour(mask, W, H) {
  let start = -1;
  for (let i = 0; i < mask.length; i++) { if (mask[i]) { start = i; break; } }
  if (start === -1) return [];
  const dirs = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const contour = [];
  let cx = start % W, cy = Math.floor(start / W);
  const sx = cx, sy = cy;
  let dir = 0;
  for (let step = 0; step < W * H; step++) {
    contour.push([cx, cy]);
    let moved = false;
    for (let d = 0; d < 8; d++) {
      const nd = (dir + 6 + d) % 8;
      const nx = cx + dirs[nd][0], ny = cy + dirs[nd][1];
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      if (mask[ny * W + nx]) { dir = nd; cx = nx; cy = ny; moved = true; break; }
    }
    if (!moved) break;
    if (step > 3 && cx === sx && cy === sy) break;
  }
  return contour;
}

function rdp(pts, eps) {
  if (pts.length <= 2) return pts;
  const result = new Uint8Array(pts.length);
  result[0] = 1;
  result[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop();
    let maxD = 0, maxI = start;
    for (let i = start + 1; i < end; i++) {
      const d = ptSegDist(pts[i], pts[start], pts[end]);
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > eps) {
      result[maxI] = 1;
      stack.push([start, maxI]);
      stack.push([maxI, end]);
    }
  }
  return pts.filter((_, i) => result[i]);
}

function ptSegDist([px,py],[ax,ay],[bx,by]) {
  const dx=bx-ax, dy=by-ay, len2=dx*dx+dy*dy;
  if (len2===0) return Math.hypot(px-ax,py-ay);
  const t = Math.max(0, Math.min(1, ((px-ax)*dx+(py-ay)*dy)/len2));
  return Math.hypot(px-(ax+t*dx), py-(ay+t*dy));
}

function closePolygon(polygon, threshold) {
  if (polygon.length < 3) return polygon;
  const first = polygon[0];
  const last = polygon[polygon.length - 1];
  const dist = Math.hypot(last[0] - first[0], last[1] - first[1]);
  if (dist > threshold) return [...polygon, [first[0], first[1]]];
  if (dist > 0.01) {
    const closed = [...polygon];
    closed[closed.length - 1] = [first[0], first[1]];
    return closed;
  }
  return polygon;
}

function contourPerimeterMm(pts, mmPerPx) {
  let p = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i+1) % pts.length];
    p += Math.hypot(b[0]-a[0], b[1]-a[1]);
  }
  return p * mmPerPx;
}

// === NUEVO: Perímetro en píxeles para compacidad ===
function contourPerimeterPx(pts) {
  let p = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i+1) % pts.length];
    p += Math.hypot(b[0]-a[0], b[1]-a[1]);
  }
  return p;
}

function optimizeRegionOrder(regions) {
  if (regions.length <= 2) return;
  const ordered = [regions[0]];
  const remaining = new Set(regions.slice(1).map((_, i) => i + 1));
  while (remaining.size > 0) {
    const last = ordered[ordered.length - 1];
    let nearestIdx = -1, nearestDist = Infinity;
    for (const idx of remaining) {
      const dist = Math.hypot(
        regions[idx].centroid[0] - last.centroid[0],
        regions[idx].centroid[1] - last.centroid[1]
      );
      if (dist < nearestDist) { nearestDist = dist; nearestIdx = idx; }
    }
    ordered.push(regions[nearestIdx]);
    remaining.delete(nearestIdx);
  }
  for (let i = 0; i < ordered.length; i++) regions[i] = ordered[i];
}

function generateSatinContour(polygon, width, mmPerPx) {
  const stitches = [];
  const baseHalfWidth = width / 2;
  let totalLength = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i], p2 = polygon[(i + 1) % polygon.length];
    totalLength += Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  }
  const density = Math.max(0.15, Math.min(0.4, totalLength / 200));
  const normals = [];
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const prev = polygon[(i - 1 + n) % n];
    const curr = polygon[i];
    const next = polygon[(i + 1) % n];
    const dx1 = curr[0] - prev[0], dy1 = curr[1] - prev[1];
    const len1 = Math.hypot(dx1, dy1);
    const dx2 = next[0] - curr[0], dy2 = next[1] - curr[1];
    const len2 = Math.hypot(dx2, dy2);
    let nx = 0, ny = 0;
    if (len1 > 0.001) { nx += (-dy1 / len1); ny += (dx1 / len1); }
    if (len2 > 0.001) { nx += (-dy2 / len2); ny += (dx2 / len2); }
    const nLen = Math.hypot(nx, ny);
    if (nLen > 0.001) normals.push([nx / nLen, ny / nLen]);
    else normals.push([0, 1]);
  }
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i], p2 = polygon[(i + 1) % n];
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
    const segLen = Math.hypot(dx, dy);
    if (segLen < 0.01) continue;
    const steps = Math.max(3, Math.floor(segLen / density));
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      const baseX = p1[0] + dx * t, baseY = p1[1] + dy * t;
      const n1 = normals[i], n2 = normals[(i + 1) % n];
      const nx = n1[0] * (1 - t) + n2[0] * t;
      const ny = n1[1] * (1 - t) + n2[1] * t;
      const nLen = Math.hypot(nx, ny);
      const nnx = nLen > 0 ? nx / nLen : 0;
      const nny = nLen > 0 ? ny / nLen : 1;
      const side = (j % 2 === 0) ? 1 : -1;
      stitches.push([
        baseX + nnx * baseHalfWidth * side,
        baseY + nny * baseHalfWidth * side
      ]);
    }
  }
  return stitches;
}

function generateRunContour(polygon, spacing, mmPerPx) {
  const stitches = [];
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i], p2 = polygon[(i + 1) % polygon.length];
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
    const len = Math.sqrt(dx*dx + dy*dy);
    const steps = Math.max(1, Math.floor(len / spacing));
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      stitches.push([p1[0] + dx * t, p1[1] + dy * t]);
    }
  }
  return stitches;
}

function generateTatamiFill(polygon, density = 0.4, stitchLength = 2.5, angleDeg = 45, areaMm2 = 0) {
  if (!polygon || polygon.length < 3) return [];
  
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i][0] * polygon[j][1];
    area -= polygon[j][0] * polygon[i][1];
  }
  area = Math.abs(area) / 2;
  
  const adaptiveDensity = area > 200 
    ? density * 1.5
    : area > 50 
      ? density * 1.2
      : density;
  
  const angle = angleDeg * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rotate = (p) => [p[0] * cos + p[1] * sin, -p[0] * sin + p[1] * cos];
  const unrotate = (p) => [p[0] * cos - p[1] * sin, p[0] * sin + p[1] * cos];
  const rotatedPolygon = polygon.map(rotate);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of rotatedPolygon) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
  }
  const stitches = [];
  const offsets = [0, 0.25, 0.5, 0.75];
  let rowIndex = 0;
  for (let y = minY; y <= maxY; y += adaptiveDensity) {
    const intersections = [];
    for (let i = 0; i < rotatedPolygon.length; i++) {
      const p1 = rotatedPolygon[i], p2 = rotatedPolygon[(i + 1) % rotatedPolygon.length];
      if ((p1[1] <= y && p2[1] > y) || (p2[1] <= y && p1[1] > y)) {
        const t = (y - p1[1]) / (p2[1] - p1[1]);
        intersections.push(p1[0] + t * (p2[0] - p1[0]));
      }
    }
    intersections.sort((a, b) => a - b);
    const filtered = [];
    for (let i = 0; i < intersections.length; i++) {
      if (i === 0 || Math.abs(intersections[i] - intersections[i-1]) > 0.5) {
        filtered.push(intersections[i]);
      }
    }
    const offset = offsets[rowIndex % 4] * stitchLength;
    const reverse = (rowIndex % 2 === 1);
    for (let i = 0; i < filtered.length - 1; i += 2) {
      let xStart = filtered[i] + offset, xEnd = filtered[i + 1];
      if (xStart >= xEnd) continue;
      const segmentLength = xEnd - xStart;
      const numStitches = Math.max(1, Math.floor(segmentLength / stitchLength));
      if (segmentLength < stitchLength * 0.5) continue;
      if (reverse) {
        for (let j = numStitches; j >= 0; j--) {
          const x = Math.min(xStart + j * stitchLength, xEnd);
          stitches.push(unrotate([x, y]));
        }
      } else {
        for (let j = 0; j <= numStitches; j++) {
          const x = Math.min(xStart + j * stitchLength, xEnd);
          stitches.push(unrotate([x, y]));
        }
      }
    }
    rowIndex++;
  }
  return stitches;
}

function generateSatinStitches(polygon, density = 0.3, mmPerPx) {
  const stitches = [];
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i], p2 = polygon[(i + 1) % polygon.length];
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
    const len = Math.sqrt(dx*dx + dy*dy);
    const steps = Math.max(1, Math.floor(len / density));
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      stitches.push([p1[0] + dx * t, p1[1] + dy * t]);
    }
  }
  return stitches;
}

function gaussianBlur(gray, W, H) {
  const kernel = [1,4,6,4,1, 4,16,24,16,4, 6,24,36,24,6, 4,16,24,16,4, 1,4,6,4,1];
  const ksum = 256;
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (let ky = -2; ky <= 2; ky++) {
        for (let kx = -2; kx <= 2; kx++) {
          const ny = Math.max(0, Math.min(H-1, y+ky));
          const nx = Math.max(0, Math.min(W-1, x+kx));
          v += gray[ny*W+nx] * kernel[(ky+2)*5+(kx+2)];
        }
      }
      out[y*W+x] = v / ksum;
    }
  }
  return out;
}

function sobelGradientsSimple(gray, W, H) {
  const mag = new Float32Array(W * H);
  for (let y = 1; y < H-1; y++) {
    for (let x = 1; x < W-1; x++) {
      const g = (r,c) => gray[r*W+c];
      const sx = -g(y-1,x-1) + g(y-1,x+1) - 2*g(y,x-1) + 2*g(y,x+1) - g(y+1,x-1) + g(y+1,x+1);
      const sy = -g(y-1,x-1) - 2*g(y-1,x) - g(y-1,x+1) + g(y+1,x-1) + 2*g(y+1,x) + g(y+1,x+1);
      mag[y*W+x] = Math.sqrt(sx*sx+sy*sy);
    }
  }
  return { mag };
}

function rgbToHex([r,g,b]) {
  return '#'+[r,g,b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
}

function computeOptimalFillAngle(mask, W, H) {
  const pixels = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) pixels.push({ x: i % W, y: Math.floor(i / W) });
  }
  if (pixels.length < 2) return 45;
  let cx = 0, cy = 0;
  for (const p of pixels) { cx += p.x; cy += p.y; }
  cx /= pixels.length; cy /= pixels.length;
  let mu20 = 0, mu02 = 0, mu11 = 0;
  for (const p of pixels) {
    const dx = p.x - cx, dy = p.y - cy;
    mu20 += dx * dx; mu02 += dy * dy; mu11 += dx * dy;
  }
  const theta = 0.5 * Math.atan2(2 * mu11, mu20 - mu02);
  let fillAngle = (theta * 180 / Math.PI) + 90;
  fillAngle = fillAngle % 180;
  if (fillAngle < 0) fillAngle += 180;
  return Math.round(fillAngle / 15) * 15;
}

function rgbToLab(r, g, b) {
  let rNorm = r / 255, gNorm = g / 255, bNorm = b / 255;
  rNorm = rNorm > 0.04045 ? Math.pow((rNorm + 0.055) / 1.055, 2.4) : rNorm / 12.92;
  gNorm = gNorm > 0.04045 ? Math.pow((gNorm + 0.055) / 1.055, 2.4) : gNorm / 12.92;
  bNorm = bNorm > 0.04045 ? Math.pow((bNorm + 0.055) / 1.055, 2.4) : bNorm / 12.92;
  let x = (rNorm * 0.4124564 + gNorm * 0.3575761 + bNorm * 0.1804375) / 0.95047;
  let y = (rNorm * 0.2126729 + gNorm * 0.7151522 + bNorm * 0.0721750) / 1.00000;
  let z = (rNorm * 0.0193339 + gNorm * 0.1191920 + bNorm * 0.9503041) / 1.08883;
  x = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x + 16/116);
  y = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y + 16/116);
  z = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z + 16/116);
  return [(116 * y) - 16, 500 * (x - y), 200 * (y - z)];
}

function distSqLab(a, b) {
  const dL = (a[0]-b[0]) * 1.5;
  const da = a[1]-b[1];
  const db = a[2]-b[2];
  return dL*dL + da*da + db*db;
}

function nearestIdxLab(lab, palette) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const d = distSqLab(lab, palette[i]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function deltaE2000(lab1, lab2) {
  const dL = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dL*dL + da*da + db*db);
}
