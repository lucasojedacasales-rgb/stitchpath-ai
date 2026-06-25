import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function reuploadForClaude(imageUrl, base44) {
  const res = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching image`);
  const contentType = res.headers.get('content-type') || 'image/png';
  const buffer = await res.arrayBuffer();
  const ext = contentType.includes('png') ? 'png' : contentType.includes('gif') ? 'gif' : contentType.includes('webp') ? 'webp' : 'jpg';
  const file = new File([buffer], `image.${ext}`, { type: contentType });
  const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });
  return uploaded.file_url;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROCESAMIENTO DE IMÁGENES PARA CONTORNOS PRECISOS
// ═══════════════════════════════════════════════════════════════════════════

async function extractPreciseContours(imageUrl, targetColors = 8) {
  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) throw new Error('Could not fetch image');
  
  const arrayBuffer = await imgResp.arrayBuffer();
  const { Jimp } = await import('npm:jimp@1.6.0');
  const image = await Jimp.fromBuffer(Buffer.from(arrayBuffer));

  const origW = image.width;
  const origH = image.height;
  
  // Redimensionar para procesamiento (alta resolución para detalles)
  const scale = Math.min(800 / origW, 800 / origH, 1);
  const W = Math.round(origW * scale);
  const H = Math.round(origH * scale);
  
  image.resize({ w: W, h: H });

  // Extraer píxeles
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

  // Posterizar para colores planos
  posterizeImage(rgba, W, H, 6);

  // K-means para reducir a targetColors
  const colors = extractDominantColors(rgba, W, H, targetColors);
  
  // Generar máscaras por color y extraer contornos
  const regions = [];
  for (let ci = 0; ci < colors.length; ci++) {
    const mask = createColorMask(rgba, W, H, colors[ci], 30); // threshold 30
    const contours = extractContoursFromMask(mask, W, H);
    
    for (const contour of contours) {
      if (contour.length < 10) continue; // Filtrar ruido
      
      // Simplificar con RDP
      const simplified = rdp(contour, 1.5);
      if (simplified.length < 6) continue;
      
      // Suavizar
      const smoothed = smoothContour(simplified, 2);
      
      // Normalizar a 0-1
      const pathPoints = smoothed.map(([x, y]) => [
        parseFloat((x / W).toFixed(4)),
        parseFloat((y / H).toFixed(4))
      ]);
      
      // Cerrar polígono
      if (pathPoints.length > 0) {
        const first = pathPoints[0];
        const last = pathPoints[pathPoints.length - 1];
        if (Math.abs(first[0] - last[0]) > 0.01 || Math.abs(first[1] - last[1]) > 0.01) {
          pathPoints.push([first[0], first[1]]);
        }
      }

      regions.push({
        color: colors[ci].hex,
        path_points: pathPoints,
        pixelCount: contour.length,
        centroid: calculateCentroid(smoothed, W, H),
        area: calculatePolygonArea(pathPoints)
      });
    }
  }

  // Merge regiones del mismo color cercanas
  const merged = mergeRegionsByColorAndProximity(regions, 0.05);
  
  return {
    regions: merged,
    analysisW: W,
    analysisH: H
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES DE PROCESAMIENTO DE IMÁGENES
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

function extractDominantColors(rgba, W, H, k) {
  // Muestrear píxeles
  const samples = [];
  const step = Math.max(1, Math.floor(Math.sqrt(W * H / 5000)));
  
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      const i = (y * W + x) * 4;
      if (rgba[i + 3] < 128) continue;
      samples.push([rgba[i], rgba[i+1], rgba[i+2]]);
    }
  }

  if (samples.length === 0) return [];

  // K-means simple
  let centroids = [samples[Math.floor(Math.random() * samples.length)]];
  
  while (centroids.length < k) {
    const dists = samples.map(s => 
      Math.min(...centroids.map(c => colorDistance(s, c)))
    );
    const total = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i];
      if (r <= 0) { centroids.push([...samples[i]]); break; }
    }
    if (centroids.length < k) centroids.push([...samples[samples.length - 1]]);
  }

  // Iteraciones
  for (let iter = 0; iter < 10; iter++) {
    const sums = centroids.map(() => [0, 0, 0, 0]);
    for (const s of samples) {
      const ci = nearestColor(s, centroids);
      sums[ci][0] += s[0]; sums[ci][1] += s[1]; sums[ci][2] += s[2]; sums[ci][3]++;
    }
    for (let ci = 0; ci < k; ci++) {
      if (sums[ci][3] > 0) {
        centroids[ci] = [sums[ci][0]/sums[ci][3], sums[ci][1]/sums[ci][3], sums[ci][2]/sums[ci][3]];
      }
    }
  }

  return centroids.map(c => ({
    r: Math.round(c[0]), g: Math.round(c[1]), b: Math.round(c[2]),
    hex: rgbToHex([Math.round(c[0]), Math.round(c[1]), Math.round(c[2])])
  }));
}

function colorDistance(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return dr*dr + dg*dg + db*db;
}

function nearestColor(rgb, palette) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const d = colorDistance(rgb, palette[i]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function createColorMask(rgba, W, H, targetColor, threshold) {
  const mask = new Uint8Array(W * H);
  const t2 = threshold * threshold;
  
  for (let i = 0; i < W * H; i++) {
    const r = rgba[i*4], g = rgba[i*4+1], b = rgba[i*4+2];
    const d = (r - targetColor.r)**2 + (g - targetColor.g)**2 + (b - targetColor.b)**2;
    if (d < t2) mask[i] = 1;
  }
  
  return mask;
}

function extractContoursFromMask(mask, W, H) {
  const contours = [];
  const visited = new Uint8Array(W * H);
  
  for (let start = 0; start < W * H; start++) {
    if (!mask[start] || visited[start]) continue;
    
    // Flood fill para encontrar componente conectado
    const stack = [start];
    const pixels = [];
    visited[start] = 1;
    
    while (stack.length > 0) {
      const idx = stack.pop();
      pixels.push(idx);
      
      const x = idx % W, y = Math.floor(idx / W);
      const neighbors = [
        { nx: x-1, ny: y }, { nx: x+1, ny: y },
        { nx: x, ny: y-1 }, { nx: x, ny: y+1 }
      ];
      
      for (const { nx, ny } of neighbors) {
        if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
          const ni = ny * W + nx;
          if (mask[ni] && !visited[ni]) {
            visited[ni] = 1;
            stack.push(ni);
          }
        }
      }
    }
    
    if (pixels.length < 20) continue; // Filtrar ruido
    
    // Encontrar borde del componente
    const borderPixels = [];
    for (const idx of pixels) {
      const x = idx % W, y = Math.floor(idx / W);
      const neighbors = [idx-1, idx+1, idx-W, idx+W];
      let isBorder = false;
      for (const n of neighbors) {
        const nx = n % W, ny = Math.floor(n / W);
        if (nx < 0 || nx >= W || ny < 0 || ny >= H || !mask[n]) {
          isBorder = true;
          break;
        }
      }
      if (isBorder) borderPixels.push([x, y]);
    }
    
    if (borderPixels.length > 0) contours.push(borderPixels);
  }
  
  return contours;
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
      const d = pointToSegmentDistance(pts[i], pts[start], pts[end]);
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

function pointToSegmentDistance([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx*dx + dy*dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function smoothContour(contour, iterations) {
  let smoothed = [...contour];
  const n = smoothed.length;
  
  for (let iter = 0; iter < iterations; iter++) {
    const newSmoothed = [];
    for (let i = 0; i < n; i++) {
      const prev = smoothed[(i - 1 + n) % n];
      const curr = smoothed[i];
      const next = smoothed[(i + 1) % n];
      newSmoothed.push([
        (prev[0] + curr[0] + next[0]) / 3,
        (prev[1] + curr[1] + next[1]) / 3
      ]);
    }
    smoothed = newSmoothed;
  }
  
  return smoothed;
}

function calculateCentroid(points, W, H) {
  let sx = 0, sy = 0;
  for (const [x, y] of points) { sx += x; sy += y; }
  return [sx / points.length / W, sy / points.length / H];
}

function calculatePolygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i][0] * points[j][1] - points[j][0] * points[i][1];
  }
  return Math.abs(area) / 2;
}

function mergeRegionsByColorAndProximity(regions, proximityThreshold) {
  if (regions.length <= 1) return regions;
  
  const merged = [];
  const used = new Set();
  
  for (let i = 0; i < regions.length; i++) {
    if (used.has(i)) continue;
    
    const group = [i];
    used.add(i);
    
    for (let j = i + 1; j < regions.length; j++) {
      if (used.has(j)) continue;
      if (regions[i].color !== regions[j].color) continue;
      
      const dist = Math.hypot(
        regions[i].centroid[0] - regions[j].centroid[0],
        regions[i].centroid[1] - regions[j].centroid[1]
      );
      
      if (dist < proximityThreshold) {
        group.push(j);
        used.add(j);
      }
    }
    
    // Mergear grupo
    const base = regions[group[0]];
    const allPoints = [];
    for (const idx of group) {
      allPoints.push(...regions[idx].path_points);
    }
    
    // Recalcular contorno del grupo mergeado (usando convex hull simple)
    const mergedContour = simplifyMergedContour(allPoints);
    
    merged.push({
      ...base,
      path_points: mergedContour,
      area: calculatePolygonArea(mergedContour)
    });
  }
  
  return merged;
}

function simplifyMergedContour(points) {
  // Eliminar duplicados y ordenar por ángulo alrededor del centroide
  const unique = [];
  const seen = new Set();
  for (const [x, y] of points) {
    const key = `${x.toFixed(3)},${y.toFixed(3)}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push([x, y]);
    }
  }
  
  if (unique.length < 3) return unique;
  
  // Calcular centroide
  let cx = 0, cy = 0;
  for (const [x, y] of unique) { cx += x; cy += y; }
  cx /= unique.length; cy /= unique.length;
  
  // Ordenar por ángulo
  unique.sort((a, b) => {
    const angleA = Math.atan2(a[1] - cy, a[0] - cx);
    const angleB = Math.atan2(b[1] - cy, b[0] - cx);
    return angleA - angleB;
  });
  
  // Cerrar
  if (unique.length > 0) {
    const first = unique[0];
    const last = unique[unique.length - 1];
    if (Math.abs(first[0] - last[0]) > 0.001 || Math.abs(first[1] - last[1]) > 0.001) {
      unique.push([first[0], first[1]]);
    }
  }
  
  return rdp(unique, 0.02);
}

function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { 
      image_url, 
      mode, 
      width_mm, 
      height_mm, 
      color_count, 
      use_ia_vision, 
      image_analysis, 
      traced_contours 
    } = await req.json();

    if (!image_url) return Response.json({ error: 'image_url required' }, { status: 400 });

    const maxColors = Math.min(color_count || 8, 20);
    const w = width_mm || 100;
    const h = height_mm || 100;

    const imageDataUrl = await reuploadForClaude(image_url, base44);

    // ═══════════════════════════════════════════════════════════════════════
    // PATH A: Contornos precisos del cliente + Claude para clasificación
    // ═══════════════════════════════════════════════════════════════════════
    if (traced_contours && traced_contours.regions && traced_contours.regions.length > 0) {
      const clientRegions = traced_contours.regions;

      const regionDescriptions = clientRegions.slice(0, 40).map((r, i) => {
        const bbox = r.bbox;
        const cx = ((bbox.minX + bbox.maxX) / 2 / (traced_contours.analysisW || 512)).toFixed(3);
        const cy = ((bbox.minY + bbox.maxY) / 2 / (traced_contours.analysisH || 512)).toFixed(3);
        const areaPct = (r.coverage * 100).toFixed(1);
        return `Región ${i}: color=${r.hex} centro=(${cx},${cy}) cobertura=${areaPct}%`;
      }).join('\n');

      const labelPrompt = `Eres un experto digitalizador de bordados. Analiza la imagen.

Tengo ${Math.min(clientRegions.length, 40)} regiones detectadas píxel a píxel:
${regionDescriptions}

Para CADA región asigna (en orden 0, 1, 2...):
- name: nombre descriptivo (ej: "cuerpo_principal", "ojo_izquierdo")
- stitch_type: "fill" zonas grandes, "satin" bordes medianos, "running_stitch" detalles finos
- density: 0.4-0.9
- angle: 0-180 (ángulo puntadas)
- layer_order: 1=primero (fills grandes antes que contornos)
- underlay: true para fill/satin grandes, false para detalles
- pull_compensation: 0.1-0.2

Responde SOLO JSON:
{"labels":[{"index":0,"name":"...","stitch_type":"fill","density":0.7,"angle":45,"layer_order":1,"underlay":true,"pull_compensation":0.15}],"estimated_time_min":12}`;

      const labelResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: labelPrompt,
        file_urls: [imageDataUrl],
        model: 'claude_sonnet_4_6',
        response_json_schema: {
          type: 'object',
          properties: {
            labels: { type: 'array', items: { type: 'object' } },
            estimated_time_min: { type: 'number' }
          }
        }
      });

      const labels = labelResult.labels || [];
      const labelMap = {};
      for (const l of labels) labelMap[l.index] = l;

      const finalRegions = clientRegions.slice(0, 40).map((r, i) => {
        const label = labelMap[i] || {};
        const stitch_type = label.stitch_type || (r.coverage > 0.05 ? 'fill' : r.coverage > 0.01 ? 'satin' : 'running_stitch');
        const stitch_count = Math.round((r.area_px || r.pixelCount || 100) * (label.density || 0.7) * 0.4);
        return {
          id: `r${i + 1}`,
          name: label.name || `region_${r.hex.replace('#', '')}_${i}`,
          color: r.hex,
          stitch_type,
          density: label.density || 0.7,
          angle: label.angle || (i * 17 % 180),
          layer_order: label.layer_order || (i + 1),
          pull_compensation: label.pull_compensation || 0.15,
          underlay: label.underlay !== undefined ? label.underlay : stitch_type !== 'running_stitch',
          area_mm2: Math.round(r.coverage * w * h),
          stitch_count,
          is_auto_contour: false,
          visible: true,
          path_points: r.path_points,
        };
      });

      const total_stitches = finalRegions.reduce((s, r) => s + r.stitch_count, 0);
      return Response.json({
        success: true,
        data: {
          regions: finalRegions,
          total_stitches,
          estimated_time_min: labelResult.estimated_time_min || Math.round(total_stitches / 800),
          colors_used: new Set(finalRegions.map(r => r.color)).size,
          width_mm: w,
          height_mm: h,
        }
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PATH B: HÍBRIDO V2 - Claude analiza + procesamiento de píxeles para contornos
    // ═══════════════════════════════════════════════════════════════════════
    
    // 1. Extraer contornos precisos con procesamiento de píxeles
    const preciseContours = await extractPreciseContours(image_url, maxColors);
    
    // 2. Claude clasifica las regiones detectadas
    const regionDescriptions = preciseContours.regions.slice(0, 40).map((r, i) => {
      const cx = r.centroid[0].toFixed(3);
      const cy = r.centroid[1].toFixed(3);
      const areaPct = (r.area * 100).toFixed(1);
      return `Región ${i}: color=${r.color} centro=(${cx},${cy}) cobertura=${areaPct}%`;
    }).join('\n');

    const classifyPrompt = `Eres un experto digitalizador de bordados. Analiza la imagen.

He detectado ${Math.min(preciseContours.regions.length, 40)} regiones automáticamente:
${regionDescriptions}

Para CADA región asigna:
- name: nombre descriptivo
- stitch_type: "fill" (zonas grandes >5%), "satin" (bordes medianos 1-5%), "running_stitch" (detalles <1%)
- density: 0.4-0.9
- angle: 0-180 (ángulo óptimo para puntadas)
- layer_order: 1=primero (fills grandes), luego medianos, luego contornos
- underlay: true para fill/satin grandes
- pull_compensation: 0.1-0.2

Responde SOLO JSON:
{"labels":[{"index":0,"name":"...","stitch_type":"fill","density":0.7,"angle":45,"layer_order":1,"underlay":true,"pull_compensation":0.15}],"estimated_time_min":12}`;

    const classifyResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: classifyPrompt,
      file_urls: [imageDataUrl],
      model: 'claude_sonnet_4_6',
      response_json_schema: {
        type: 'object',
        properties: {
          labels: { type: 'array', items: { type: 'object' } },
          estimated_time_min: { type: 'number' }
        }
      }
    });

    const labels = classifyResult.labels || [];
    const labelMap = {};
    for (const l of labels) labelMap[l.index] = l;

    // 3. Combinar contornos precisos + clasificación de Claude
    const finalRegions = preciseContours.regions.slice(0, 40).map((r, i) => {
      const label = labelMap[i] || {};
      const coverage = r.area;
      const stitch_type = label.stitch_type || (coverage > 0.05 ? 'fill' : coverage > 0.01 ? 'satin' : 'running_stitch');
      const stitch_count = Math.round((r.pixelCount || 100) * (label.density || 0.7) * 0.4);
      
      return {
        id: `r${i + 1}`,
        name: label.name || `region_${r.color.replace('#', '')}_${i}`,
        color: r.color,
        stitch_type,
        density: label.density || 0.7,
        angle: label.angle || (i * 17 % 180),
        layer_order: label.layer_order || (i + 1),
        pull_compensation: label.pull_compensation || 0.15,
        underlay: label.underlay !== undefined ? label.underlay : stitch_type !== 'running_stitch',
        area_mm2: Math.round(coverage * w * h),
        stitch_count,
        is_auto_contour: true,
        visible: true,
        path_points: r.path_points,
      };
    });

    const total_stitches = finalRegions.reduce((s, r) => s + r.stitch_count, 0);
    
    return Response.json({
      success: true,
      data: {
        regions: finalRegions,
        total_stitches,
        estimated_time_min: classifyResult.estimated_time_min || Math.round(total_stitches / 800),
        colors_used: new Set(finalRegions.map(r => r.color)).size,
        width_mm: w,
        height_mm: h,
      }
    });

  } catch (error) {
    console.error('Hybrid digitization error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
