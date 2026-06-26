import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { regions, stitchParams = {}, sequencingMode = 'optimize', format, width_mm, height_mm, machine_name, speed_rpm, cuts, project_name } = await req.json();
    
    if (!regions || !Array.isArray(regions)) {
      return Response.json({ error: 'regions array required' }, { status: 400 });
    }

    // ── Parámetros de puntada ─────────────────────────────────────────────
    const sp = {
      tatamiDensityMm: 0.4,
      fillAngle: null,
      fillDensity: 1.0,
      satinWidth: 3.0,
      runningStitchLength: 2.5,
      pullCompensation: 0.15,
      underlay: true,
      underlayDensity: 0.5,
      underlayAngle: -45,
      ...stitchParams,
      tatamiDensityMm: stitchParams?.tatami_density || stitchParams?.tatamiDensityMm || 0.4,
      fillAngle: stitchParams?.fill_angle !== undefined ? stitchParams.fill_angle : (stitchParams?.fillAngle !== undefined ? stitchParams.fillAngle : null),
    };

    // ── Generar puntadas por región ────────────────────────────────────────
    const stitchPaths = [];

    for (const region of regions) {
      const poly = region.polygon;
      if (!poly || poly.length < 3) continue;

      const area = region.area || 0;
      const compactness = region.compactness || 0;

      // Determinar tipo de puntada automáticamente si no está asignado
      let type = region.stitch_type;
      if (!type) {
        if (area > 300 || compactness < 15) type = 'fill';
        else if (area >= 50 || compactness >= 15) type = 'satin';
        else type = 'running_stitch';
      }

      let points = [];
      let jumps = 0;

      if (type === 'fill') {
        const polyAngleDeg = sp.fillAngle !== null && sp.fillAngle !== undefined
          ? sp.fillAngle
          : (region.angle !== undefined ? region.angle : dominantAngleDeg(poly));
        const perpAngle = polyAngleDeg + 90;

        // Underlay primero (perpendicular, más espaciado)
        if (sp.underlay) {
          const underlaySpacingMm = sp.tatamiDensityMm * 2;
          const underlayResult = generateFillLines(poly, perpAngle, underlaySpacingMm, sp.pullCompensation);
          points.push(...underlayResult.points);
          jumps += underlayResult.jumps;
          if (underlayResult.points.length > 0) jumps++;
        }

        const fillResult = generateFillLines(poly, polyAngleDeg, sp.tatamiDensityMm, sp.pullCompensation);
        points.push(...fillResult.points);
        jumps += fillResult.jumps;

      } else if (type === 'satin') {
        const satinResult = generateSatinStitches(poly, sp.satinWidth, sp.pullCompensation);
        points = satinResult.points;
        jumps = satinResult.jumps;

      } else {
        // running_stitch
        const isInner = region.isEdgeRegion === false && area < 50;
        const offset = isInner ? -0.3 : 0.5;
        const runResult = generateRunningStitch(poly, sp.runningStitchLength, offset);
        points = runResult.points;
        jumps = runResult.jumps;
      }

      const stitchCount = points.length;
      const estimatedTimeSec = parseFloat(((stitchCount / 800) * 60).toFixed(1));

      stitchPaths.push({
        regionId: region.id,
        type,
        color: region.color,
        layerOrder: region.layer_order || region.layerOrder || 999,
        points,
        stitchCount,
        jumps,
        estimatedTimeSec,
      });
    }

    // ── Secuenciación ────────────────────────────────────────────────────────
    const sequenced = sequencePaths(stitchPaths, sequencingMode);

    // ── Estadísticas ─────────────────────────────────────────────────────────
    const totalStitches = sequenced.reduce((s, p) => s + p.stitchCount, 0);
    const totalJumps = sequenced.reduce((s, p) => s + p.jumps, 0);
    const totalColors = new Set(sequenced.map(p => p.color)).size;
    const estimatedTimeMin = parseFloat((sequenced.reduce((s, p) => s + p.estimatedTimeSec, 0) / 60).toFixed(1));
    const threadLengthMeters = parseFloat(((totalStitches * 2) / 1000).toFixed(1));

    // ── Generar archivo de bordado si se solicita formato ──────────────────
    let fileData = null;
    if (format) {
      const stitchData = convertToStitchFormat(sequenced, width_mm || 100, height_mm || 100);
      const fileBuffer = generateEmbroideryFile(stitchData, format, width_mm, height_mm, machine_name, speed_rpm, regions);
      const base64 = arrayBufferToBase64(fileBuffer);
      
      fileData = {
        file_base64: base64,
        file_name: `${sanitizeFileName(project_name) || 'design'}.${format.toLowerCase()}`,
        format: format.toUpperCase(),
      };
    }

    // Strip internal fields
    const outputPaths = sequenced.map(({ layerOrder, ...rest }) => rest);

    return Response.json({
      stitchPaths: outputPaths,
      totalStats: {
        totalStitches,
        totalJumps,
        totalColors,
        estimatedTimeMin,
        threadLengthMeters,
      },
      ...(fileData && { file: fileData }),
    });

  } catch (error) {
    console.error('Embroidery generation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GENERADORES DE PUNTADAS
// ═══════════════════════════════════════════════════════════════════════════

// ── TATAMI FILL ─────────────────────────────────────────────────────────────
function generateFillLines(poly, angleDeg, spacingMm, pullComp) {
  const expanded = expandPolygon(poly, pullComp);
  const angle = angleDeg * Math.PI / 180;
  const rowSpacing = Math.max(0.15, spacingMm || 0.4);
  const stitchPitch = rowSpacing;
  const OFFSETS = [0, 0.25, 0.5, 0.75];
  const MAX_STITCH = 2.5;

  const cos = Math.cos(-angle), sin = Math.sin(-angle);
  const cosR = Math.cos(angle), sinR = Math.sin(angle);

  const rotated = expanded.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);
  const minY = Math.min(...rotated.map(p => p[1]));
  const maxY = Math.max(...rotated.map(p => p[1]));

  const allPoints = [];
  let jumps = 0;
  let rowIdx = 0;

  for (let y = minY + rowSpacing / 2; y <= maxY; y += rowSpacing) {
    const xs = scanLineIntersect(rotated, y);
    if (xs.length < 2) { rowIdx++; continue; }
    xs.sort((a, b) => a - b);

    const cycleOffset = OFFSETS[rowIdx % 4] * stitchPitch;
    const forward = rowIdx % 2 === 0;
    const rowPoints = [];

    for (let i = 0; i < xs.length - 1; i += 2) {
      const xL = xs[i], xR = xs[i + 1];
      const segLen = xR - xL;
      if (segLen < 0.1) continue;

      rowPoints.push(forward ? [xL, y] : [xR, y]);

      const firstX = xL + ((cycleOffset % stitchPitch + stitchPitch) % stitchPitch);
      for (let x = firstX; x < xR - 0.05; x += stitchPitch) {
        if (x > xL + 0.05) rowPoints.push([x, y]);
      }

      const exitPt = forward ? [xR, y] : [xL, y];
      const lastAdded = rowPoints[rowPoints.length - 1];
      if (Math.hypot(exitPt[0] - lastAdded[0], exitPt[1] - lastAdded[1]) > 0.05) {
        rowPoints.push(exitPt);
      }
    }

    if (rowPoints.length === 0) { rowIdx++; continue; }

    const orderedPts = forward ? rowPoints : rowPoints.slice().reverse();

    if (allPoints.length > 0) {
      const last = allPoints[allPoints.length - 1];
      const first = orderedPts[0];
      const jumpDist = Math.hypot(first[0] - last[0], first[1] - last[1]);
      if (jumpDist > 5.0) jumps++;
    }

    for (let j = 0; j < orderedPts.length; j++) {
      if (j > 0) {
        const prev = orderedPts[j - 1];
        const curr = orderedPts[j];
        const segLen = Math.hypot(curr[0] - prev[0], curr[1] - prev[1]);
        if (segLen > MAX_STITCH) {
          const steps = Math.ceil(segLen / MAX_STITCH);
          for (let s = 1; s < steps; s++) {
            const t = s / steps;
            allPoints.push([prev[0] + t * (curr[0] - prev[0]), prev[1] + t * (curr[1] - prev[1])]);
          }
        }
      }
      allPoints.push(orderedPts[j]);
    }

    rowIdx++;
  }

  const finalPoints = allPoints.map(([x, y]) => [
    parseFloat((x * cosR - y * sinR).toFixed(3)),
    parseFloat((x * sinR + y * cosR).toFixed(3)),
  ]);

  return { points: finalPoints, jumps };
}

function scanLineIntersect(poly, y) {
  const xs = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
      const t = (y - a[1]) / (b[1] - a[1]);
      xs.push(a[0] + t * (b[0] - a[0]));
    }
  }
  return xs;
}

// ── SATIN ───────────────────────────────────────────────────────────────────
function generateSatinStitches(poly, satinWidth, pullComp) {
  const expanded = expandPolygon(poly, pullComp);
  const cx = expanded.reduce((s, p) => s + p[0], 0) / expanded.length;
  const cy = expanded.reduce((s, p) => s + p[1], 0) / expanded.length;

  const points = [];
  let jumps = 0;

  const angle = dominantAngle(expanded);
  const axisDir = [Math.cos(angle), Math.sin(angle)];
  const perpDir = [-Math.sin(angle), Math.cos(angle)];

  const projAxis = expanded.map(p => (p[0] - cx) * axisDir[0] + (p[1] - cy) * axisDir[1]);
  const tMin = Math.min(...projAxis), tMax = Math.max(...projAxis);

  const stitchSpacing = 0.25;
  let stitchIdx = 0;

  for (let t = tMin; t <= tMax; t += stitchSpacing) {
    const mx = cx + t * axisDir[0];
    const my = cy + t * axisDir[1];

    const intersections = linePolyIntersectPerp(expanded, mx, my, perpDir);
    if (intersections.length < 2) continue;
    intersections.sort((a, b) => a.t - b.t);

    const p0 = intersections[0], p1 = intersections[intersections.length - 1];
    const len = Math.abs(p1.t - p0.t);
    const segments = Math.ceil(len / satinWidth);
    const step = (p1.t - p0.t) / segments;

    for (let s = 0; s < segments; s++) {
      const ta = p0.t + s * step;
      const tb = p0.t + (s + 1) * step;
      const forward = stitchIdx % 2 === 0;
      const startT = forward ? ta : tb;
      const endT = forward ? tb : ta;
      points.push([
        parseFloat((mx + startT * perpDir[0]).toFixed(3)),
        parseFloat((my + startT * perpDir[1]).toFixed(3)),
      ]);
      points.push([
        parseFloat((mx + endT * perpDir[0]).toFixed(3)),
        parseFloat((my + endT * perpDir[1]).toFixed(3)),
      ]);
      stitchIdx++;
    }
  }

  return { points, jumps };
}

function linePolyIntersectPerp(poly, mx, my, perpDir) {
  const results = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const denom = perpDir[0] * dy - perpDir[1] * dx;
    if (Math.abs(denom) < 1e-10) continue;
    const t_seg = ((mx - a[0]) * dy - (my - a[1]) * dx) / denom;
    const u_seg = ((mx - a[0]) * perpDir[1] - (my - a[1]) * perpDir[0]) / denom;
    if (u_seg >= 0 && u_seg <= 1) results.push({ t: t_seg });
  }
  return results;
}

function dominantAngle(poly) {
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  let cxx = 0, cxy = 0, cyy = 0;
  for (const [x, y] of poly) {
    const dx = x - cx, dy = y - cy;
    cxx += dx * dx; cxy += dx * dy; cyy += dy * dy;
  }
  return 0.5 * Math.atan2(2 * cxy, cxx - cyy);
}

// ── RUNNING STITCH ──────────────────────────────────────────────────────────
function generateRunningStitch(poly, stitchLength, offsetMm) {
  const offsetPoly = offsetMm !== 0 ? expandPolygon(poly, offsetMm) : poly;
  const points = [];
  let dist = 0;
  points.push([parseFloat(offsetPoly[0][0].toFixed(3)), parseFloat(offsetPoly[0][1].toFixed(3))]);

  for (let i = 0; i < offsetPoly.length; i++) {
    const a = offsetPoly[i], b = offsetPoly[(i + 1) % offsetPoly.length];
    const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (segLen < 1e-10) continue;
    const dx = (b[0] - a[0]) / segLen, dy = (b[1] - a[1]) / segLen;
    let d = stitchLength - dist;
    while (d < segLen) {
      points.push([
        parseFloat((a[0] + dx * d).toFixed(3)),
        parseFloat((a[1] + dy * d).toFixed(3)),
      ]);
      d += stitchLength;
    }
    dist = segLen - (d - stitchLength);
  }

  points.push([parseFloat(offsetPoly[0][0].toFixed(3)), parseFloat(offsetPoly[0][1].toFixed(3))]);
  return { points, jumps: 0 };
}

// ── SEQUENCING ───────────────────────────────────────────────────────────────
function sequencePaths(paths, mode) {
  if (mode === 'layerOrder') {
    return [...paths].sort((a, b) => (a.layerOrder || 999) - (b.layerOrder || 999));
  }

  if (mode === 'colorGroup' || mode === 'optimize') {
    // Agrupar por color
    const byColor = {};
    for (const p of paths) {
    const normalizedColor = (p.color || '').toLowerCase().trim();
if (!byColor[normalizedColor]) byColor[normalizedColor] = [];
 byColor[normalizedColor].push(p);
    }

    const result = [];
    const colorKeys = Object.keys(byColor);

    // Ordenar colores por cantidad de puntadas (más grandes primero)
    colorKeys.sort((a, b) => {
      const stitchesA = byColor[a].reduce((s, p) => s + p.stitchCount, 0);
      const stitchesB = byColor[b].reduce((s, p) => s + p.stitchCount, 0);
      return stitchesB - stitchesA;
    });

    for (const color of colorKeys) {
      const group = byColor[color];
      
      // Ordenar regiones del mismo color por vecino más cercano
      const ordered = [group[0]];
      const remaining = new Set(group.slice(1));
      
      while (remaining.size > 0) {
        const last = ordered[ordered.length - 1];
        const lastPt = last.points[last.points.length - 1] || [0, 0];
        
        let bestIdx = null;
        let bestDist = Infinity;
        
        for (const path of remaining) {
          const firstPt = path.points[0] || [0, 0];
          const dist = Math.hypot(firstPt[0] - lastPt[0], firstPt[1] - lastPt[1]);
          
          // Bonus si la distancia es pequeña (menos de 5mm = conectable sin jump)
          const bonus = dist < 5 ? 1000 : 0;
          const score = dist - bonus;
          
          if (score < bestDist) {
            bestDist = score;
            bestIdx = path;
          }
        }
        
        ordered.push(bestIdx);
        remaining.delete(bestIdx);
      }
      
      result.push(...ordered);
    }
    
    return result;
  }

  if (mode === 'minTravel') {
    const remaining = [...paths];
    const result = [];
    let current = remaining.splice(0, 1)[0];
    result.push(current);

    while (remaining.length > 0) {
      const lastPt = current.points[current.points.length - 1] || [0, 0];
      let bestIdx = 0;
      let bestDist = Infinity;
      
      for (let i = 0; i < remaining.length; i++) {
        const firstPt = remaining[i].points[0] || [0, 0];
        const dist = Math.hypot(firstPt[0] - lastPt[0], firstPt[1] - lastPt[1]);
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      }
      
      current = remaining.splice(bestIdx, 1)[0];
      result.push(current);
    }
    return result;
  }

  return paths;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSIÓN A FORMATOS DE ARCHIVO
// ═══════════════════════════════════════════════════════════════════════════

function convertToStitchFormat(sequencedPaths, width_mm, height_mm) {
  const stitches = [];
  const scale = 10;

  for (let i = 0; i < sequencedPaths.length; i++) {
  const path = sequencedPaths[i];
  if (path.points.length === 0) continue;

  // Color change solo si es diferente al anterior
  const prevPath = i > 0 ? sequencedPaths[i - 1] : null;
  const needsColorChange = !prevPath || prevPath.color !== path.color;
  
  if (needsColorChange) {
    stitches.push({ type: 'color_change', color: hexToRgb(path.color || '#000000') });
  } else {
    // Mismo color: verificar si hay que hacer jump o se puede conectar
    const lastPt = stitches[stitches.length - 1];
    const firstPt = path.points[0];
    const jumpDist = Math.hypot(firstPt[0] - lastPt.x / scale, firstPt[1] - lastPt.y / scale);
    
    if (jumpDist > 5.0) {
      // Distancia grande: trim y jump
      stitches.push({ type: 'trim' });
    }
    // Si está cerca, no hacemos nada (se conecta automáticamente)
  }

  for (const [x, y] of path.points) {
    stitches.push({ type: 'stitch', x: Math.round(x * scale), y: Math.round(y * scale) });
  }

  // Trim solo al final de todo o si el siguiente es color diferente
  const nextPath = i < sequencedPaths.length - 1 ? sequencedPaths[i + 1] : null;
  if (!nextPath || nextPath.color !== path.color) {
    stitches.push({ type: 'trim' });
  }
}

  stitches.push({ type: 'end' });
  return stitches;
}

function generateEmbroideryFile(stitchData, format, width_mm, height_mm, machine_name, speed_rpm, regions) {
  switch (format.toUpperCase()) {
    case 'DST':
      return generateDST(stitchData, width_mm, height_mm, machine_name, speed_rpm);
    case 'PES':
      return generatePES(stitchData, width_mm, height_mm, machine_name, regions);
    case 'JEF':
      return generateJEF(stitchData, width_mm, height_mm, machine_name, regions);
    case 'DSB':
      return generateDSB(stitchData, width_mm, height_mm, machine_name);
    default:
      return generateDST(stitchData, width_mm, height_mm, machine_name, speed_rpm);
  }
}

// ── DST GENERATOR ───────────────────────────────────────────────────────────
function generateDST(stitches, width_mm, height_mm, machine, speed) {
  const header = new Uint8Array(512);
  const enc = new TextEncoder();

  const stitchCount = stitches.filter(s => s.type === 'stitch').length;
  const colorChanges = stitches.filter(s => s.type === 'color_change').length;

  const headerLines = [
    `LA:${(machine || 'StitchFlow').padEnd(16, ' ')}`,
    `ST:${stitchCount.toString().padEnd(7, ' ')}`,
    `CO:${colorChanges.toString().padEnd(3, ' ')}`,
    `+X:${Math.round((width_mm || 100) * 10).toString().padEnd(5, ' ')}`,
    `-X:0    `,
    `+Y:${Math.round((height_mm || 100) * 10).toString().padEnd(5, ' ')}`,
    `-Y:0    `,
    `AX:+0   `,
    `AY:+0   `,
    `MX:+0   `,
    `MY:+0   `,
    `PD:******`,
    `\x1a`
  ];

  const headerStr = headerLines.join('\r') + ' '.repeat(512);
  const headerBytes = enc.encode(headerStr.slice(0, 512));
  header.set(headerBytes);

  const dataBytes = [];
  let cx = 0, cy = 0;

  for (const s of stitches) {
    if (s.type === 'stitch') {
      let dx = s.x - cx;
      let dy = s.y - cy;

      while (Math.abs(dx) > 121 || Math.abs(dy) > 121) {
        const stepX = Math.sign(dx) * Math.min(Math.abs(dx), 121);
        const stepY = Math.sign(dy) * Math.min(Math.abs(dy), 121);
        const [b1, b2, b3] = encodeDSTStitch(stepX, stepY, 0x80);
        dataBytes.push(b1, b2, b3);
        cx += stepX;
        cy += stepY;
        dx = s.x - cx;
        dy = s.y - cy;
      }

      const [b1, b2, b3] = encodeDSTStitch(dx, dy, 0);
      dataBytes.push(b1, b2, b3);
      cx = s.x;
      cy = s.y;
    } else if (s.type === 'color_change') {
      dataBytes.push(0xC3, 0xC3, 0xC3);
    } else if (s.type === 'trim') {
      dataBytes.push(0xC3, 0xC3, 0xC3);
    } else if (s.type === 'end') {
      dataBytes.push(0xF3, 0xF3, 0xF3);
    }
  }

  const result = new Uint8Array(512 + dataBytes.length);
  result.set(header);
  result.set(new Uint8Array(dataBytes), 512);
  return result.buffer;
}

function encodeDSTStitch(dx, dy, flag) {
  let b1 = 0, b2 = 0, b3 = flag & 0x03;

  if (dx > 40) { b3 |= 0x04; dx -= 81; }
  if (dx < -40) { b3 |= 0x08; dx += 81; }
  if (dx < 0) { dx = -dx; b1 |= 0x80; }

  if (dy > 40) { b3 |= 0x20; dy -= 81; }
  if (dy < -40) { b3 |= 0x40; dy += 81; }
  if (dy < 0) { dy = -dy; b2 |= 0x80; }

  b1 |= (dx & 0x7F);
  b2 |= (dy & 0x7F);

  return [b1, b2, b3];
}

// ── PES GENERATOR ───────────────────────────────────────────────────────────
function generatePES(stitches, width_mm, height_mm, machine, regions) {
  const enc = new TextEncoder();
  const pecData = generatePECData(stitches, width_mm, height_mm);
  
  const header = new Uint8Array(8);
  header.set(enc.encode('#PES0001'));
  
  const totalLength = header.length + pecData.length;
  const result = new Uint8Array(totalLength);
  result.set(header);
  result.set(pecData, header.length);
  
  return result.buffer;
}

function generatePECData(stitches, width_mm, height_mm) {
  const header = new Uint8Array(512);
  const enc = new TextEncoder();
  
  header.set(enc.encode('LA:'), 0);
  header.set(enc.encode('StitchFlow'.padEnd(16, ' ')), 3);
  
  const view = new DataView(header.buffer);
  view.setInt16(19, 0, true);
  view.setInt16(21, 0, true);
  view.setInt16(23, Math.round(width_mm * 10), true);
  view.setInt16(25, Math.round(height_mm * 10), true);
  
  const stitchBytes = [];
  let lastX = 0, lastY = 0;
  
  for (const s of stitches) {
    if (s.type === 'stitch') {
      const dx = s.x - lastX;
      const dy = s.y - lastY;
      
      if (Math.abs(dx) <= 63 && Math.abs(dy) <= 63) {
        stitchBytes.push((dx + 63) & 0x7F, (dy + 63) & 0x7F);
      } else {
        stitchBytes.push(0x80, 0x01,
          (dx >> 8) & 0xFF, dx & 0xFF,
          (dy >> 8) & 0xFF, dy & 0xFF);
      }
      lastX = s.x;
      lastY = s.y;
    } else if (s.type === 'color_change') {
      stitchBytes.push(0xFE, 0xB0);
    } else if (s.type === 'end') {
      stitchBytes.push(0xFF);
    }
  }
  
  const result = new Uint8Array(512 + stitchBytes.length);
  result.set(header);
  result.set(new Uint8Array(stitchBytes), 512);
  return result;
}

// ── JEF GENERATOR ───────────────────────────────────────────────────────────
function generateJEF(stitches, width_mm, height_mm, machine, regions) {
  const enc = new TextEncoder();
  const stitchBytes = [];
  let lastX = 0, lastY = 0;
  
  const header = new Uint8Array(80);
  header.set(enc.encode('JEF'), 0);
  
  const view = new DataView(header.buffer);
  view.setInt32(4, stitches.filter(s => s.type === 'stitch').length, true);
  view.setInt32(8, stitches.filter(s => s.type === 'color_change').length, true);
  view.setInt32(12, Math.round(width_mm * 10), true);
  view.setInt32(16, Math.round(height_mm * 10), true);
  
  for (const s of stitches) {
    if (s.type === 'stitch') {
      const dx = s.x - lastX;
      const dy = s.y - lastY;
      stitchBytes.push(dx & 0xFF, dy & 0xFF);
      lastX = s.x;
      lastY = s.y;
    } else if (s.type === 'color_change') {
      stitchBytes.push(0x80, 0x01);
    } else if (s.type === 'end') {
      stitchBytes.push(0x80, 0x10);
    }
  }
  
  const result = new Uint8Array(80 + stitchBytes.length);
  result.set(header);
  result.set(new Uint8Array(stitchBytes), 80);
  return result.buffer;
}

// ── DSB GENERATOR ───────────────────────────────────────────────────────────
function generateDSB(stitches, width_mm, height_mm, machine) {
  const enc = new TextEncoder();
  const stitchBytes = [];
  let lastX = 0, lastY = 0;
  
  const header = new Uint8Array(512);
  header.set(enc.encode('DSB'), 0);
  header.set(enc.encode((machine || 'StitchFlow').padEnd(16, ' ')), 3);
  
  for (const s of stitches) {
    if (s.type === 'stitch') {
      const dx = s.x - lastX;
      const dy = s.y - lastY;
      stitchBytes.push((dx >> 8) & 0xFF, dx & 0xFF, (dy >> 8) & 0xFF, dy & 0xFF, 0x00);
      lastX = s.x;
      lastY = s.y;
    } else if (s.type === 'color_change') {
      stitchBytes.push(0x00, 0x00, 0x00, 0x00, 0x01);
    } else if (s.type === 'end') {
      stitchBytes.push(0x00, 0x00, 0x00, 0x00, 0xFF);
    }
  }
  
  const result = new Uint8Array(512 + stitchBytes.length);
  result.set(header);
  result.set(new Uint8Array(stitchBytes), 512);
  return result.buffer;
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════════════════════

function dominantAngleDeg(poly) {
  if (!poly || poly.length < 2) return 45;
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  let cxx = 0, cxy = 0, cyy = 0;
  for (const [x, y] of poly) {
    const dx = x - cx, dy = y - cy;
    cxx += dx * dx; cxy += dx * dy; cyy += dy * dy;
  }
  return parseFloat((0.5 * Math.atan2(2 * cxy, cxx - cyy) * 180 / Math.PI).toFixed(1));
}

function expandPolygon(poly, amount) {
  if (!amount || amount === 0) return poly;
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  return poly.map(([x, y]) => {
    const dx = x - cx, dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return [x + (dx / len) * amount, y + (dy / len) * amount];
  });
}

function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return { r: 0, g: 0, b: 0 };
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return { r: 0, g: 0, b: 0 };
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return {
    r: isNaN(r) ? 0 : r,
    g: isNaN(g) ? 0 : g,
    b: isNaN(b) ? 0 : b
  };
}

function sanitizeFileName(name) {
  if (!name) return null;
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.length;
  const chunkSize = 65536;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
