import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { 
      imageUrl, 
      colorClusters = 8,
      edgeThreshold = 0.12,
      minRegionArea = 5,
      detailThreshold = 15,
      tatamiDensity = 0.4,
      tatamiStitchLength = 2.5,
      tatamiAngle = 45,
      contourSatinWidth = 0.6,
      rdpEpsilon = 0.15,
      posterizeLevels = 8,
      enableRegionMerge = true,
      mergeColorThreshold = 25,
      smoothIterations = 2,
      preserveDetails = true
    } = await req.json();
    
    if (!imageUrl) return Response.json({ error: 'imageUrl required' }, { status: 400 });

    const startMs = Date.now();

    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) return Response.json({ error: 'Could not fetch image' }, { status: 400 });
    
    const arrayBuffer = await imgResp.arrayBuffer();
    const { Jimp } = await import('npm:jimp@1.6.0');
    const image = await Jimp.fromBuffer(Buffer.from(arrayBuffer));

    const origW = image.width;
    const origH = image.height;

    // Aumentar resolución para capturar más detalles
    const scale = Math.min(800 / origW, 800 / origH, 1);
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

    // ═══════════════════════════════════════════════════════════════════════
    // 1. PRE-PROCESAMIENTO: Posterización + Suavizado selectivo
    // ═══════════════════════════════════════════════════════════════════════
    posterizeImage(rgba, W, H, posterizeLevels);
    
    // Suavizado selectivo: solo en áreas planas, no en bordes
    if (smoothIterations > 0) {
      selectiveSmooth(rgba, W, H, smoothIterations, edgeThreshold);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. DETECCIÓN DE BORDES MEJORADA
    // ═══════════════════════════════════════════════════════════════════════
    const gray = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const r = rgba[i*4], g = rgba[i*4+1], b = rgba[i*4+2];
      gray[i] = 0.299*r + 0.587*g + 0.114*b;
    }

    const blurred = gaussianBlur(gray, W, H);
    const { gx, gy, mag } = sobelGradients(blurred, W, H);

    // Umbral adaptativo más fino
    let sum = 0, sum2 = 0;
    for (let i = 0; i < mag.length; i++) { 
      sum += mag[i]; 
      sum2 += mag[i] * mag[i]; 
    }
    const mean = sum / mag.length;
    const stddev = Math.sqrt(sum2 / mag.length - mean * mean);
    const highT = edgeThreshold * (mean + 1.5 * stddev);
    const lowT  = highT * 0.3;
    const edges = cannyNMS(mag, gx, gy, W, H, lowT, highT);

    // ═══════════════════════════════════════════════════════════════════════
    // 3. CLUSTERING K-MEANS++ EN ESPACIO LAB CON PESOS
    // ═══════════════════════════════════════════════════════════════════════
    const k = Math.max(3, Math.min(colorClusters, 20));
    const samples = [];
    for (let i = 0; i < W * H; i++) {
      if (rgba[i*4+3] < 128) continue;
      const r = rgba[i*4], g = rgba[i*4+1], b = rgba[i*4+2];
      const lab = rgbToLab(r, g, b);
      const isEdge = edges[i] > 0;
      
      // Peso: píxeles de borde tienen menos peso para no contaminar clusters
      const weight = isEdge ? 0.3 : 1.0;
      
      samples.push({ 
        idx: i, 
        rgb: [r, g, b], 
        lab: lab,
        isEdge,
        weight
      });
    }

    const nonEdge = samples.filter(s => !s.isEdge);
    const seed = nonEdge.length > 0 ? nonEdge : samples;
    if (seed.length === 0) return Response.json({ error: 'No foreground pixels' }, { status: 400 });
    
    // K-means++ con pesos
    let centroidsLab = [];
    let centroidsRgb = [];
    
    // Primer centroide aleatorio ponderado
    const firstIdx = weightedRandom(seed);
    centroidsLab.push([...seed[firstIdx].lab]);
    centroidsRgb.push([...seed[firstIdx].rgb]);
    
    while (centroidsLab.length < k) {
      const dists = samples.map(s => {
        const minDist = Math.min(...centroidsLab.map(c => distSqLab(s.lab, c)));
        return minDist * s.weight;
      });
      const total = dists.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      let selected = 0;
      for (let i = 0; i < dists.length; i++) {
        r -= dists[i];
        if (r <= 0) { selected = i; break; }
      }
      centroidsLab.push([...samples[selected].lab]);
      centroidsRgb.push([...samples[selected].rgb]);
    }

    // Iteraciones con pesos
    const labels = new Int32Array(W * H).fill(-1);
    for (let iter = 0; iter < 25; iter++) {
      const sums = centroidsLab.map(() => [0, 0, 0, 0]);
      
      for (const s of samples) {
        const ci = nearestIdxLabWeighted(s.lab, centroidsLab, s.weight);
        labels[s.idx] = ci;
        if (!s.isEdge) {
          const w = s.weight;
          sums[ci][0] += s.rgb[0] * w; 
          sums[ci][1] += s.rgb[1] * w; 
          sums[ci][2] += s.rgb[2] * w; 
          sums[ci][3] += w;
        }
      }
      
      for (let ci = 0; ci < k; ci++) {
        const cnt = sums[ci][3];
        if (cnt > 0) {
          centroidsRgb[ci] = [sums[ci][0]/cnt, sums[ci][1]/cnt, sums[ci][2]/cnt];
          centroidsLab[ci] = rgbToLab(sums[ci][0]/cnt, sums[ci][1]/cnt, sums[ci][2]/cnt);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. MERGE DE REGIONES MEJORADO (espacial + color)
    // ═══════════════════════════════════════════════════════════════════════
    if (enableRegionMerge) {
      mergeRegionsSpatialColor(labels, W, H, centroidsLab, centroidsRgb, mergeColorThreshold);
    }

    // Marcar bordes como sin región
    for (let i = 0; i < W * H; i++) {
      if (edges[i] > 0) labels[i] = -1;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 5. FLOOD FILL CON DETECCIÓN DE DETALLES
    // ═══════════════════════════════════════════════════════════════════════
    const minPx = Math.max(2, Math.round(minRegionArea / (mmPerPx * mmPerPx)));
    let regions = floodFillRegionsAdvanced(labels, W, H, centroidsLab.length, minPx, mmPerPx, rgba, centroidsRgb, detailThreshold);

    // Merge post-flood mejorado
    if (enableRegionMerge) {
      regions = mergeRegionsBySpatialProximity(regions, mergeColorThreshold);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6. DETECTAR CONTORNO EXTERNO
    // ═══════════════════════════════════════════════════════════════════════
    const designContour = traceDesignContour(labels, W, H);

    // ═══════════════════════════════════════════════════════════════════════
    // 7. PROCESAR CADA REGIÓN CON MEJORAS
    // ═══════════════════════════════════════════════════════════════════════
    const outputRegions = [];

    for (const reg of regions) {
      let contour = traceContour(reg.mask, W, H);
      if (contour.length < 3) continue;

      // Suavizado adaptativo
      contour = smoothContourAdaptive(contour, reg.isDetail ? 1 : 3);

      const bbox = reg.bbox;
      const bboxW = bbox.maxX - bbox.minX;
      const bboxH = bbox.maxY - bbox.minY;
      const regionAspect = bboxW / Math.max(1, bboxH);
      const isValidShape = regionAspect >= 0.1 && regionAspect <= 10.0;
      if (!isValidShape) continue;

      // RDP adaptativo por curvatura
      const regionSize = Math.sqrt(bboxW * bboxW + bboxH * bboxH);
      const baseEpsilon = Math.max(0.3, rdpEpsilon * (regionSize / 100));
      const curvatureFactor = estimateAverageCurvature(contour);
      const adaptiveEpsilon = baseEpsilon * (0.5 + 0.5 * (1 - curvatureFactor));
      
      let simplified = rdp(contour, adaptiveEpsilon / mmPerPx);
      
      if (simplified.length < 6 && contour.length > 20) {
        simplified = rdp(contour, (adaptiveEpsilon * 0.2) / mmPerPx);
      }

      if (simplified.length < 4) continue;

      // Cerrar polígono con tolerancia adaptativa
      simplified = closePolygon(simplified, reg.isDetail ? 0.5 : 2.0);

      const polygon = simplified.map(([x, y]) => [
        parseFloat(((x - W/2) * mmPerPx).toFixed(4)),
        parseFloat(((y - H/2) * mmPerPx).toFixed(4)),
      ]);

      const areaMm2 = reg.pixelCount * mmPerPx * mmPerPx;
      const perimeterMm = contourPerimeterMm(simplified, mmPerPx);

      const isExternalBorder = isRegionOnDesignBorder(reg, designContour, W, H);

      const isLargeRegion = areaMm2 > 15;
      const isThinRegion = (bboxW < 10 || bboxH < 10) && perimeterMm > 12;
      const isDetail = reg.isDetail || (areaMm2 < 30 && perimeterMm > 20);
      
      let type;
      let stitches = [];
      let contourStitches = [];
      
      if (isDetail && !isLargeRegion) {
        // Detalles pequeños: usar satin fino o running stitch
        type = 'satin';
        stitches = generateSatinStitches(polygon, 0.2, mmPerPx);
        contourStitches = stitches;
      } else if (isLargeRegion && !isThinRegion) {
        type = 'fill';
        const regionAngle = computeOptimalFillAngle(reg.mask, W, H);
        stitches = generateTatamiFill(polygon, tatamiDensity, tatamiStitchLength, regionAngle);
        
        if (isExternalBorder) {
          contourStitches = generateSatinContour(polygon, contourSatinWidth, mmPerPx);
        } else {
          contourStitches = generateRunContour(polygon, 0.5, mmPerPx);
        }
      } else if (isThinRegion || (perimeterMm > 20 && areaMm2 < 30)) {
        type = 'satin';
        stitches = generateSatinStitches(polygon, 0.25, mmPerPx);
        contourStitches = stitches;
      } else {
        type = 'run';
        stitches = polygon.map(p => [p[0], p[1]]);
        contourStitches = stitches;
      }

      outputRegions.push({
        id: reg.id,
        color: reg.hex,
        type: type,
        path_points: polygon,
        stitches: stitches,
        contour_stitches: contourStitches,
        is_external_border: isExternalBorder,
        is_detail: isDetail,
        stitch_count: stitches.length,
        area_mm2: parseFloat(areaMm2.toFixed(2)),
        perimeter_mm: parseFloat(perimeterMm.toFixed(2)),
        centroid: [
          parseFloat(((reg.centroid[0] - W/2) * mmPerPx).toFixed(4)),
          parseFloat(((reg.centroid[1] - H/2) * mmPerPx).toFixed(4)),
        ],
        coverage: areaMm2 / (100 * 100),
      });
    }

    // Ordenar por proximidad
    optimizeRegionOrder(outputRegions);

    // Contorno del diseño
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

// ═══════════════════════════════════════════════════════════════════════════
// NUEVAS FUNCIONES DE PRE-PROCESAMIENTO
// ═══════════════════════════════════════════════════════════════════════════

function selectiveSmooth(rgba, W, H, iterations, edgeThreshold) {
  for (let iter = 0; iter < iterations; iter++) {
    const newRgba = new Uint8Array(rgba);
    
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = (y * W + x) * 4;
        if (rgba[i + 3] < 128) continue;
        
        // Detectar si es borde
        const gx = Math.abs(rgba[i + 4] - rgba[i - 4]) + 
                   Math.abs(rgba[i + 5] - rgba[i - 3]) + 
                   Math.abs(rgba[i + 6] - rgba[i - 2]);
        const gy = Math.abs(rgba[(y+1)*W*4 + x*4] - rgba[(y-1)*W*4 + x*4]) +
                   Math.abs(rgba[(y+1)*W*4 + x*4 + 1] - rgba[(y-1)*W*4 + x*4 + 1]) +
                   Math.abs(rgba[(y+1)*W*4 + x*4 + 2] - rgba[(y-1)*W*4 + x*4 + 2]);
        
        const edgeStrength = (gx + gy) / 3;
        if (edgeStrength > edgeThreshold * 255) continue; // No suavizar bordes
        
        // Suavizado bilateral (preserva bordes)
        let rSum = 0, gSum = 0, bSum = 0, wSum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const ni = ((y + ky) * W + (x + kx)) * 4;
            const weight = 1.0 / (1.0 + Math.abs(kx) + Math.abs(ky));
            rSum += rgba[ni] * weight;
            gSum += rgba[ni + 1] * weight;
            bSum += rgba[ni + 2] * weight;
            wSum += weight;
          }
        }
        
        newRgba[i] = Math.round(rSum / wSum);
        newRgba[i + 1] = Math.round(gSum / wSum);
        newRgba[i + 2] = Math.round(bSum / wSum);
      }
    }
    
    rgba.set(newRgba);
  }
}

function weightedRandom(items) {
  const totalWeight = items.reduce((sum, item) => sum + (item.weight || 1), 0);
  let r = Math.random() * totalWeight;
  for (let i = 0; i < items.length; i++) {
    r -= (items[i].weight || 1);
    if (r <= 0) return i;
  }
  return 0;
}

function nearestIdxLabWeighted(lab, palette, weight) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const d = distSqLab(lab, palette[i]) / weight;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════════════════
// MERGE ESPACIAL + COLOR MEJORADO
// ═══════════════════════════════════════════════════════════════════════════

function mergeRegionsSpatialColor(labels, W, H, centroidsLab, centroidsRgb, threshold) {
  const k = centroidsLab.length;
  if (k <= 3) return;
  
  // Calcular conectividad espacial
  const adjacency = new Map(); // colorIdx -> Set(colorIdx adyacentes)
  
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const ci = labels[i];
      if (ci === -1) continue;
      
      const neighbors = [
        y > 0 ? labels[i - W] : -1,
        y < H - 1 ? labels[i + W] : -1,
        x > 0 ? labels[i - 1] : -1,
        x < W - 1 ? labels[i + 1] : -1
      ];
      
      if (!adjacency.has(ci)) adjacency.set(ci, new Set());
      for (const nj of neighbors) {
        if (nj !== -1 && nj !== ci) {
          adjacency.get(ci).add(nj);
        }
      }
    }
  }
  
  // Encontrar pares mergeables (adyacentes + color similar)
  const merges = new Map();
  const processed = new Set();
  
  for (const [ci, neighbors] of adjacency) {
    if (processed.has(ci)) continue;
    
    for (const cj of neighbors) {
      if (processed.has(cj)) continue;
      
      const colorDist = deltaE2000(centroidsLab[ci], centroidsLab[cj]);
      if (colorDist < threshold) {
        // Mergear el más pequeño al más grande
        const target = ci < cj ? ci : cj;
        const source = ci < cj ? cj : ci;
        merges.set(source, target);
        processed.add(source);
        processed.add(target);
      }
    }
  }
  
  if (merges.size === 0) return;
  
  // Resolver transitividad
  const finalMerge = new Map();
  for (let i = 0; i < k; i++) {
    let current = i;
    const visited = new Set();
    while (merges.has(current) && !visited.has(current)) {
      visited.add(current);
      current = merges.get(current);
    }
    finalMerge.set(i, current);
  }
  
  // Actualizar labels
  for (let i = 0; i < W * H; i++) {
    if (labels[i] === -1) continue;
    labels[i] = finalMerge.get(labels[i]);
  }
  
  // Compactar
  compactColorIndices(labels, W, H, centroidsLab, centroidsRgb);
}

function compactColorIndices(labels, W, H, centroidsLab, centroidsRgb) {
  const usedColors = new Set();
  for (let i = 0; i < W * H; i++) {
    if (labels[i] !== -1) usedColors.add(labels[i]);
  }
  
  const colorRemap = new Map();
  let nextIdx = 0;
  for (const c of [...usedColors].sort((a, b) => a - b)) {
    colorRemap.set(c, nextIdx++);
  }
  
  for (let i = 0; i < W * H; i++) {
    if (labels[i] !== -1) labels[i] = colorRemap.get(labels[i]);
  }
  
  const newCentroidsLab = [];
  const newCentroidsRgb = [];
  for (const [oldIdx, newIdx] of colorRemap) {
    newCentroidsLab[newIdx] = centroidsLab[oldIdx];
    newCentroidsRgb[newIdx] = centroidsRgb[oldIdx];
  }
  
  centroidsLab.length = newCentroidsLab.length;
  centroidsRgb.length = newCentroidsRgb.length;
  for (let i = 0; i < newCentroidsLab.length; i++) {
    centroidsLab[i] = newCentroidsLab[i];
    centroidsRgb[i] = newCentroidsRgb[i];
  }
}

function mergeRegionsBySpatialProximity(regions, threshold) {
  if (regions.length <= 1) return regions;
  
  // Agrupar por color hex
  const colorGroups = new Map();
  for (let i = 0; i < regions.length; i++) {
    const hex = regions[i].hex;
    if (!colorGroups.has(hex)) colorGroups.set(hex, []);
    colorGroups.get(hex).push(i);
  }
  
  const merged = [];
  const mergedIndices = new Set();
  
  for (const [hex, indices] of colorGroups) {
    if (indices.length === 1) {
      merged.push(regions[indices[0]]);
      continue;
    }
    
    // Mergear regiones del mismo color que están cerca espacialmente
    const groups = [];
    const used = new Set();
    
    for (const idx of indices) {
      if (used.has(idx)) continue;
      
      const group = [idx];
      used.add(idx);
      
      const cx = regions[idx].centroid[0];
      const cy = regions[idx].centroid[1];
      
      for (const otherIdx of indices) {
        if (used.has(otherIdx)) continue;
        const other = regions[otherIdx];
        const dist = Math.hypot(other.centroid[0] - cx, other.centroid[1] - cy);
        
        // Si están cerca (menos de 50 píxeles) o se tocan
        if (dist < 50 || areRegionsAdjacent(regions[idx], other)) {
          group.push(otherIdx);
          used.add(otherIdx);
        }
      }
      
      groups.push(group);
    }
    
    // Crear regiones mergeadas
    for (const group of groups) {
      if (group.length === 1) {
        merged.push(regions[group[0]]);
        continue;
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
        bbox: { ...base.bbox },
        isDetail: base.isDetail
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
  }
  
  return merged;
}

function areRegionsAdjacent(r1, r2) {
  // Verificar si los bounding boxes se solapan o están muy cerca
  const overlapX = !(r1.bbox.maxX < r2.bbox.minX - 2 || r2.bbox.maxX < r1.bbox.minX - 2);
  const overlapY = !(r1.bbox.maxY < r2.bbox.minY - 2 || r2.bbox.maxY < r1.bbox.minY - 2);
  return overlapX && overlapY;
}

// ═══════════════════════════════════════════════════════════════════════════
// FLOOD FILL AVANZADO CON DETECCIÓN DE DETALLES
// ═══════════════════════════════════════════════════════════════════════════

function floodFillRegionsAdvanced(labels, W, H, k, minPx, mmPerPx, rgba, centroids, detailThreshold) {
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
        if (x < W-1) stack.push(idx + 1);
        if (y > 0) stack.push(idx - W);
        if (y < H-1) stack.push(idx + W);
      }
      
      if (pixelList.length < minPx) continue;
      
      const mask = new Uint8Array(W * H);
      for (const px of pixelList) mask[px] = 1;
      
      // Detectar si es un detalle (perímetro grande relativo al área)
      const bboxW = maxX - minX;
      const bboxH = maxY - minY;
      const perimeter = 2 * (bboxW + bboxH);
      const area = pixelList.length;
      const isDetail = (perimeter / Math.sqrt(area)) > detailThreshold;
      
      regions.push({
        id: `region_${String(nextId + 1).padStart(3, '0')}`,
        colorIdx: ci,
        hex: rgbToHex(centroids[ci]),
        mask,
        pixels: pixelList,
        pixelCount: pixelList.length,
        centroid: [sx / pixelList.length, sy / pixelList.length],
        bbox: { minX, maxX, minY, maxY },
        isDetail
      });
      nextId++;
    }
  }
  
  return regions;
}

// ═══════════════════════════════════════════════════════════════════════════
// SMOOTHING Y CURVATURA
// ═══════════════════════════════════════════════════════════════════════════

function smoothContourAdaptive(contour, windowSize) {
  if (contour.length < windowSize * 2) return contour;
  
  const smoothed = [];
  const n = contour.length;
  
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0, weightSum = 0;
    
    for (let j = -windowSize; j <= windowSize; j++) {
      const idx = (i + j + n) % n;
      const dist = Math.abs(j);
      const weight = 1.0 / (1.0 + dist * dist * 0.5);
      sx += contour[idx][0] * weight;
      sy += contour[idx][1] * weight;
      weightSum += weight;
    }
    
    smoothed.push([sx / weightSum, sy / weightSum]);
  }
  
  return smoothed;
}

function estimateAverageCurvature(contour) {
  if (contour.length < 5) return 0;
  
  let totalCurvature = 0;
  const n = contour.length;
  
  for (let i = 2; i < n - 2; i++) {
    const p0 = contour[i - 2];
    const p1 = contour[i - 1];
    const p2 = contour[i];
    const p3 = contour[i + 1];
    const p4 = contour[i + 2];
    
    // Calcular ángulo de curvatura
    const v1 = [p1[0] - p0[0], p1[1] - p0[1]];
    const v2 = [p2[0] - p1[0], p2[1] - p1[1]];
    const v3 = [p3[0] - p2[0], p3[1] - p2[1]];
    const v4 = [p4[0] - p3[0], p4[1] - p3[1]];
    
    const len1 = Math.hypot(v1[0], v1[1]);
    const len2 = Math.hypot(v2[0], v2[1]);
    const len3 = Math.hypot(v3[0], v3[1]);
    const len4 = Math.hypot(v4[0], v4[1]);
    
    if (len1 < 0.001 || len2 < 0.001 || len3 < 0.001 || len4 < 0.001) continue;
    
    const dot1 = (v1[0]*v2[0] + v1[1]*v2[1]) / (len1*len2);
    const dot2 = (v2[0]*v3[0] + v2[1]*v3[1]) / (len2*len3);
    const dot3 = (v3[0]*v4[0] + v3[1]*v4[1]) / (len3*len4);
    
    const curvature = Math.abs(Math.acos(Math.max(-1, Math.min(1, dot2))) - 
                                 Math.acos(Math.max(-1, Math.min(1, (dot1 + dot3)/2))));
    totalCurvature += curvature;
  }
  
  return Math.min(1, totalCurvature / (n - 4));
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES EXISTENTES (sin cambios o con mejoras menores)
// ═══════════════════════════════════════════════════════════════════════════

function posterizeImage(rgba, W, H, levels) {
  const step = 255 / (levels - 1);
  for (let i = 0; i < W * H * 4; i += 4) {
    if (rgba[i + 3] < 128) continue;
    rgba[i]     = Math.round(rgba[i]     / step) * step;
    rgba[i + 1] = Math.round(rgba[i + 1] / step) * step;
    rgba[i + 2] = Math.round(rgba[i + 2] / step) * step;
  }
}

function deltaE2000(lab1, lab2) {
  const dL = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dL*dL + da*da + db*db);
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

function sobelGradients(gray, W, H) {
  const gx = new Float32Array(W * H);
  const gy = new Float32Array(W * H);
  const mag = new Float32Array(W * H);
  for (let y = 1; y < H-1; y++) {
    for (let x = 1; x < W-1; x++) {
      const g = (r,c) => gray[r*W+c];
      const sx = -g(y-1,x-1) + g(y-1,x+1) - 2*g(y,x-1) + 2*g(y,x+1) - g(y+1,x-1) + g(y+1,x+1);
      const sy = -g(y-1,x-1) - 2*g(y-1,x) - g(y-1,x+1) + g(y+1,x-1) + 2*g(y+1,x) + g(y+1,x+1);
      const i = y*W+x;
      gx[i] = sx; gy[i] = sy; mag[i] = Math.sqrt(sx*sx+sy*sy);
    }
  }
  return { gx, gy, mag };
}

function cannyNMS(mag, gx, gy, W, H, lowT, highT) {
  const nms = new Float32Array(W * H);
  for (let y = 1; y < H-1; y++) {
    for (let x = 1; x < W-1; x++) {
      const i = y*W+x;
      if (mag[i] < lowT) continue;
      const angle = Math.atan2(gy[i], gx[i]) * 180 / Math.PI;
      const a = ((angle + 180) % 180);
      let n1, n2;
      if (a < 22.5 || a >= 157.5)  { n1 = mag[i-1]; n2 = mag[i+1]; }
      else if (a < 67.5)           { n1 = mag[(y-1)*W+x+1]; n2 = mag[(y+1)*W+x-1]; }
      else if (a < 112.5)          { n1 = mag[(y-1)*W+x]; n2 = mag[(y+1)*W+x]; }
      else                         { n1 = mag[(y-1)*W+x-1]; n2 = mag[(y+1)*W+x+1]; }
      if (mag[i] >= n1 && mag[i] >= n2 && mag[i] >= highT) nms[i] = mag[i];
    }
  }
  return nms;
}

function traceDesignContour(labels, W, H) {
  const visited = new Uint8Array(W * H);
  const contour = [];
  
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
    const neighbors = [
      idx - 1, idx + 1, idx - W, idx + W,
      idx - W - 1, idx - W + 1, idx + W - 1, idx + W + 1
    ];
    
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
  
  const smoothed = smoothContourAdaptive(borderPixels, 2);
  return rdp(smoothed, 1.0);
}

function isRegionOnDesignBorder(region, designContour, W, H) {
  if (!designContour || designContour.length === 0) return false;
  
  const { bbox } = region;
  const margin = 5;
  
  const touchesLeft = bbox.minX <= margin;
  const touchesRight = bbox.maxX >= W - margin;
  const touchesTop = bbox.minY <= margin;
  const touchesBottom = bbox.maxY >= H - margin;
  
  return touchesLeft || touchesRight || touchesTop || touchesBottom;
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
  
  if (dist > threshold) {
    return [...polygon, [first[0], first[1]]];
  } else if (dist > 0.01) {
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

function optimizeRegionOrder(regions) {
  if (regions.length <= 2) return;
  
  const ordered = [regions[0]];
  const remaining = new Set(regions.slice(1).map((_, i) => i + 1));
  
  while (remaining.size > 0) {
    const last = ordered[ordered.length - 1];
    let nearestIdx = -1;
    let nearestDist = Infinity;
    
    for (const idx of remaining) {
      const dist = Math.hypot(
        regions[idx].centroid[0] - last.centroid[0],
        regions[idx].centroid[1] - last.centroid[1]
      );
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = idx;
      }
    }
    
    ordered.push(regions[nearestIdx]);
    remaining.delete(nearestIdx);
  }
  
  for (let i = 0; i < ordered.length; i++) {
    regions[i] = ordered[i];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERACIÓN DE PUNTADAS (sin cambios significativos)
// ═══════════════════════════════════════════════════════════════════════════

function generateSatinContour(polygon, width, mmPerPx) {
  const stitches = [];
  const baseHalfWidth = width / 2;
  
  let totalLength = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    totalLength += Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  }
  
  const density = Math.max(0.15, Math.min(0.4, totalLength / 200));
  
  const normals = [];
  const n = polygon.length;
  
  for (let i = 0; i < n; i++) {
    const prev = polygon[(i - 1 + n) % n];
    const curr = polygon[i];
    const next = polygon[(i + 1) % n];
    
    const dx1 = curr[0] - prev[0];
    const dy1 = curr[1] - prev[1];
    const len1 = Math.hypot(dx1, dy1);
    
    const dx2 = next[0] - curr[0];
    const dy2 = next[1] - curr[1];
    const len2 = Math.hypot(dx2, dy2);
    
    let nx = 0, ny = 0;
    if (len1 > 0.001) {
      nx += (-dy1 / len1);
      ny += (dx1 / len1);
    }
    if (len2 > 0.001) {
      nx += (-dy2 / len2);
      ny += (dx2 / len2);
    }
    
    const nLen = Math.hypot(nx, ny);
    if (nLen > 0.001) {
      normals.push([nx / nLen, ny / nLen]);
    } else {
      normals.push([0, 1]);
    }
  }
  
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];
    
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const segLen = Math.hypot(dx, dy);
    
    if (segLen < 0.01) continue;
    
    const curvature = estimateCurvature(polygon, i);
    const adaptiveWidth = baseHalfWidth * (0.5 + 0.5 * (1 - curvature));
    
    const steps = Math.max(3, Math.floor(segLen / density));
    
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      const baseX = p1[0] + dx * t;
      const baseY = p1[1] + dy * t;
      
      const n1 = normals[i];
      const n2 = normals[(i + 1) % n];
      const nx = n1[0] * (1 - t) + n2[0] * t;
      const ny = n1[1] * (1 - t) + n2[1] * t;
      const nLen = Math.hypot(nx, ny);
      const nnx = nLen > 0 ? nx / nLen : 0;
      const nny = nLen > 0 ? ny / nLen : 1;
      
      const side = (j % 2 === 0) ? 1 : -1;
      
      stitches.push([
        baseX + nnx * adaptiveWidth * side,
        baseY + nny * adaptiveWidth * side
      ]);
    }
  }
  
  return stitches;
}

function estimateCurvature(polygon, idx) {
  const n = polygon.length;
  const prev = polygon[(idx - 1 + n) % n];
  const curr = polygon[idx];
  const next = polygon[(idx + 1) % n];
  
  const dx1 = curr[0] - prev[0];
  const dy1 = curr[1] - prev[1];
  const len1 = Math.hypot(dx1, dy1);
  
  const dx2 = next[0] - curr[0];
  const dy2 = next[1] - curr[1];
  const len2 = Math.hypot(dx2, dy2);
  
  if (len1 < 0.001 || len2 < 0.001) return 0;
  
  const dot = (dx1 * dx2 + dy1 * dy2) / (len1 * len2);
  const cross = Math.abs(dx1 * dy2 - dy1 * dx2) / (len1 * len2);
  
  return Math.min(1, cross / (1 + Math.abs(dot)));
}

function generateRunContour(polygon, spacing, mmPerPx) {
  const stitches = [];
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const len = Math.sqrt(dx*dx + dy*dy);
    const steps = Math.max(1, Math.floor(len / spacing));
    
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      stitches.push([p1[0] + dx * t, p1[1] + dy * t]);
    }
  }
  return stitches;
}

function generateTatamiFill(polygon, density = 0.4, stitchLength = 2.5, angleDeg = 45) {
  if (!polygon || polygon.length < 3) return [];
  
  const angle = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  
  const rotate = (p) => [p[0] * cos + p[1] * sin, -p[0] * sin + p[1] * cos];
  const unrotate = (p) => [p[0] * cos - p[1] * sin, p[0] * sin + p[1] * cos];
  
  const rotatedPolygon = polygon.map(rotate);
  
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  
  for (const p of rotatedPolygon) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  
  const stitches = [];
  const offsets = [0, 0.25, 0.5, 0.75];
  let rowIndex = 0;
  
  for (let y = minY; y <= maxY; y += density) {
    const intersections = [];
    
    for (let i = 0; i < rotatedPolygon.length; i++) {
      const p1 = rotatedPolygon[i];
      const p2 = rotatedPolygon[(i + 1) % rotatedPolygon.length];
      
      if ((p1[1] <= y && p2[1] > y) || (p2[1] <= y && p1[1] > y)) {
        const t = (y - p1[1]) / (p2[1] - p1[1]);
        const x = p1[0] + t * (p2[0] - p1[0]);
        intersections.push(x);
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
      let xStart = filtered[i] + offset;
      let xEnd = filtered[i + 1];
      
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
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const len = Math.sqrt(dx*dx + dy*dy);
    const steps = Math.max(1, Math.floor(len / density));
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      stitches.push([p1[0] + dx * t, p1[1] + dy * t]);
    }
  }
  return stitches;
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════════════════════

function rgbToHex([r,g,b]) {
  return '#'+[r,g,b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
}

function computeOptimalFillAngle(mask, W, H) {
  const pixels = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) {
      pixels.push({ x: i % W, y: Math.floor(i / W) });
    }
  }
  
  if (pixels.length < 2) return 45;
  
  let cx = 0, cy = 0;
  for (const p of pixels) { cx += p.x; cy += p.y; }
  cx /= pixels.length;
  cy /= pixels.length;
  
  let mu20 = 0, mu02 = 0, mu11 = 0;
  for (const p of pixels) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    mu20 += dx * dx;
    mu02 += dy * dy;
    mu11 += dx * dy;
  }
  
  const theta = 0.5 * Math.atan2(2 * mu11, mu20 - mu02);
  let fillAngle = (theta * 180 / Math.PI) + 90;
  fillAngle = fillAngle % 180;
  if (fillAngle < 0) fillAngle += 180;
  const snapped = Math.round(fillAngle / 15) * 15;
  
  return snapped;
}

function rgbToLab(r, g, b) {
  let rNorm = r / 255;
  let gNorm = g / 255;
  let bNorm = b / 255;

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
