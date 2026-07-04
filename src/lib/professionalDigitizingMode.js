/**
 * professionalDigitizingMode.js — StitchPath AI
 * ─────────────────────────────────────────────────────────────────────────────
 * "Professional Digitizing Mode": post-procesa la secuencia de bordado para
 * acercarla a la calidad Wilcom:
 *   FASE 1 — elimina puntadas diagonales visibles (travel → jump/trim)
 *   FASE 2 — reordena capas (underlay → rellenos → sombras → contornos → detalles)
 *   FASE 3 — contornos satinados con parámetros profesionales
 *   FASE 4 — rellenos con ángulo coherente + underlay
 *   FASE 5 — reducción inteligente de colores
 *   FASE 6 — quality gate profesional
 *   FASE 7 — comparación Final Look vs Export
 *
 * No toca: DST/DSB encoder, CE01 validator, detector universal, exportación base.
 * Solo post-procesa la lista de comandos/objetos que produce buildFinalCommands.
 */

import { detectVisibleDiagonalStitches } from '@/lib/exportRepair/visibleDiagonalDetector';
import { validateCE01 } from '@/lib/ce01Validator';

export const PROFESSIONAL_PARAMS = {
  minStitchMm: 0.7,
  maxVisibleStitchMm: 4.0,
  longDiagonalMm: 3.0,
  shortStitchMm: 0.7,
  duplicateMm: 0.3,
  satinWidthMm: 1.2,
  satinDensityMm: 0.4,
  pullCompMm: 0.3,
  fillDensityMm: 0.42,
  fillStitchLenMm: 3.5,
  underlayMinAreaMm2: 80,
  maxColors: 8,
  colorMergeLabDelta: 12,
  travelVisibleMm: 0, // max travel visible = 0 → todo travel debe ocultarse
  // ── Diagonal repair (FASE 1 real) ──
  suspiciousDiagonalMinMm: 2.5,   // longitud mínima para considerar una puntada sospechosa
  longConnectorMm: 6.0,          // > este umbral se considera "conector entre objetos" aunque no sea negro/contorno
  contourDarkSupportMin: 0.5,    // contornos con soporte de línea negra real >= esto se conservan
  diagonalAngleMin: 20,          // ángulo diagonal marcado (desde horizontal)
  diagonalAngleMax: 70,
};

// ── Color helpers ────────────────────────────────────────────────────────────
export function hexToRgb(hex) {
  const h = (hex || '#000000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToLab([r, g, b]) {
  const f = v => { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; };
  let R = f(r), G = f(g), B = f(b);
  let X = R * 0.4124 + G * 0.3576 + B * 0.1805;
  let Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let Z = R * 0.0193 + G * 0.1192 + B * 0.9505;
  X /= 0.95047; Y /= 1.0; Z /= 1.08883;
  const fx = X > 0.008856 ? Math.cbrt(X) : 7.787 * X + 16 / 116;
  const fy = Y > 0.008856 ? Math.cbrt(Y) : 7.787 * Y + 16 / 116;
  const fz = Z > 0.008856 ? Math.cbrt(Z) : 7.787 * Z + 16 / 116;
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export function colorDistance(a, b) {
  const la = rgbToLab(hexToRgb(a)), lb = rgbToLab(hexToRgb(b));
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

// ── Point-in-polygon (normalized path_points) ────────────────────────────────
function pointInPolygonMm(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function regionSupportForPoint(x, y, regions) {
  for (const r of regions || []) {
    const pp = r.path_points;
    if (!pp || pp.length < 3) continue;
    const w = 100, h = 100;
    const nx = (x / w + 0.5), ny = (y / h + 0.5);
    if (pointInPolygonMm(nx, ny, pp)) return r;
  }
  return null;
}

// ── Dark-mask segment support ────────────────────────────────────────────────
function segmentDarkSupport(ax, ay, bx, by, darkStroke) {
  if (!darkStroke?.strictMask) return 0;
  const W = darkStroke.width, H = darkStroke.height, mask = darkStroke.strictMask;
  const w = 100, h = 100;
  const len = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(2, Math.ceil(len));
  let hits = 0;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const mx = ax + (bx - ax) * t, my = ay + (by - ay) * t;
    const px = Math.round((mx / w + 0.5) * W), py = Math.round((my / h + 0.5) * H);
    let on = false;
    for (let dy = -2; dy <= 2 && !on; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = px + dx, ny = py + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (mask[ny * W + nx]) { on = true; break; }
    }
    if (on) hits++;
  }
  return hits / (steps + 1);
}

function isDarkColor(c) {
  const [r, g, b] = hexToRgb(c || '#000000');
  return (0.299 * r + 0.587 * g + 0.114 * b) < 80;
}

// ═══════════════════════════════════════════════════════════════════════════
//  FASE 1 — Validar / corregir puntadas visibles antes de exportar
// ═══════════════════════════════════════════════════════════════════════════
export function validateVisibleStitchesBeforeExport(commands, regions = [], darkStroke, config = {}) {
  const p = { ...PROFESSIONAL_PARAMS, ...(config.professionalParams || {}) };
  const report = {
    visibleDiagonalStitches: 0,
    unsupportedTravelStitches: 0,
    longBlackCrossingStitches: 0,
    stitchWithoutRegionSupport: 0,
    stitchWithoutDarkMaskSupport: 0,
    convertedToJump: 0,
    cutsApplied: 0,
  };

  // Need a "previous stitched point" to measure each stitch length
  const out = [];
  let prev = null;
  for (const c of commands) {
    if (c.type !== 'stitch') { out.push(c); if (c.type === 'jump') prev = { x: c.x, y: c.y }; continue; }
    const x = c.x, y = c.y;
    const dist = prev ? Math.hypot(x - prev.x, y - prev.y) : 0;

    const dark = isDarkColor(c.color);
    const regionSup = regionSupportForPoint(x, y, regions);
    const maskSup = dark ? segmentDarkSupport(prev ? prev.x : x, prev ? prev.y : y, x, y, darkStroke) : 0;

    if (dist >= p.longDiagonalMm && dark) {
      report.longBlackCrossingStitches++;
      report.visibleDiagonalStitches++;
    }
    if (dist > p.maxVisibleStitchMm && dark && maskSup < 0.5 && !regionSup) {
      report.visibleDiagonalStitches++;
      report.stitchWithoutDarkMaskSupport += maskSup < 0.5 ? 1 : 0;
      report.stitchWithoutRegionSupport += !regionSup ? 1 : 0;
      // FIX: convert to trim + jump (do not sew the diagonal)
      out.push({ type: 'trim' });
      out.push({ type: 'jump', x, y, color: c.color, layerType: c.layerType, regionId: c.regionId });
      report.convertedToJump++;
      report.cutsApplied++;
      prev = { x, y };
      continue;
    }
    // unsupported travel: long stitch of a fill color crossing outside any region
    if (dist > p.maxVisibleStitchMm && !dark && !regionSup) {
      report.unsupportedTravelStitches++;
      out.push({ type: 'trim' });
      out.push({ type: 'jump', x, y, color: c.color, layerType: c.layerType, regionId: c.regionId });
      report.convertedToJump++;
      prev = { x, y };
      continue;
    }
    out.push(c);
    prev = { x, y };
  }
  return { commands: out, report };
}

// ── Clasificador de puntada diagonal visible sospechosa ──────────────────────
// Devuelve { dist, suspicious, reason } para una puntada dada su punto anterior.
// Una puntada es sospechosa si:
//  - longitud > suspiciousDiagonalMinMm
//  - ángulo diagonal marcado (20-70° o 110-160°)
//  - cruza regiones (start/end en regiones distintas o sale a exterior)
//  - NO es relleno tatami válido (misma región en ambos extremos)
//  - es negra/contorno O es un conector largo (> longConnectorMm)
//  - si es contorno, NO tiene soporte de línea negra real (máscara)
function classifyVisibleDiagonalStitch(c, prev, regions, darkStroke, p) {
  if (!prev) return { dist: 0, suspicious: false };
  const dx = (c.x || 0) - prev.x, dy = (c.y || 0) - prev.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= p.suspiciousDiagonalMinMm) return { dist, suspicious: false };
  // ángulo normalizado a 0-180°
  let deg = Math.atan2(dy, dx) * 180 / Math.PI;
  deg = ((deg % 180) + 180) % 180;
  const isDiagonal = (deg >= p.diagonalAngleMin && deg <= p.diagonalAngleMax) ||
                     (deg >= 180 - p.diagonalAngleMax && deg <= 180 - p.diagonalAngleMin);
  if (!isDiagonal) return { dist, suspicious: false, reason: 'not-diagonal-angle' };
  const regionPrev = regionSupportForPoint(prev.x, prev.y, regions);
  const regionCur = regionSupportForPoint(c.x || 0, c.y || 0, regions);
  const crosses = !regionPrev || !regionCur || regionPrev.id !== regionCur.id;
  const sameRegionFill = c.stitchType === 'fill' && regionPrev && regionCur && regionPrev.id === regionCur.id;
  if (!crosses || sameRegionFill) return { dist, suspicious: false, reason: 'same-region-fill' };
  const lt = (c.layerType || '').toLowerCase();
  const isContour = lt.includes('outline') || lt.includes('contour') || lt.includes('detail') || lt.includes('facial');
  const isBlack = isDarkColor(c.color);
  const longConnector = dist > p.longConnectorMm;
  if (!(isBlack || isContour || longConnector)) return { dist, suspicious: false, reason: 'not-connector-color' };
  if (isContour) {
    const maskSup = segmentDarkSupport(prev.x, prev.y, c.x || 0, c.y || 0, darkStroke);
    if (maskSup >= p.contourDarkSupportMin) return { dist, suspicious: false, reason: 'contour-has-dark-support' };
  }
  return { dist, suspicious: true, reason: 'crossing-diagonal' };
}

// ── FASE 1 (real): reparar puntadas diagonales visibles ──────────────────────
// Convierte cada puntada diagonal sospechosa en trim + jump al punto destino,
// de modo que la aguja viaja sin coser la diagonal. Las puntadas de relleno
// tatami válidas (misma región) y los contornos con soporte de línea negra real
// se conservan intactos.
export function repairVisibleDiagonalStitches(commands = [], regions = [], darkStroke, config = {}) {
  // Detector ÚNICO compartido — mismos offenders que gate + export repair
  const detection = detectVisibleDiagonalStitches(commands, [], regions, darkStroke, config);
  const offenderByIdx = new Map();
  for (const o of detection.offenders) if (o.repairable) offenderByIdx.set(o.commandIndex, o);
  const out = [];
  let removed = 0, converted = 0, longest = 0;
  const sourceIdx = [];
  for (let i = 0; i < commands.length; i++) {
    const c = commands[i];
    const off = offenderByIdx.get(i);
    if (!off) { out.push(c); continue; }
    removed++; converted++;
    longest = Math.max(longest, off.lengthMm);
    sourceIdx.push(i);
    if (off.reason === 'crossesEmptySpace') {
      out.push({ type: 'jump', x: c.x, y: c.y, color: c.color, layerType: c.layerType, regionId: c.regionId, stitchType: c.stitchType, source: c.source });
    } else {
      out.push({ type: 'trim' });
      out.push({ type: 'jump', x: c.x, y: c.y, color: c.color, layerType: c.layerType, regionId: c.regionId, stitchType: c.stitchType, source: c.source });
    }
  }
  const afterDetection = detectVisibleDiagonalStitches(out, [], regions, darkStroke, config);
  return {
    commands: out,
    report: {
      visibleDiagonalStitchesBefore: detection.count,
      visibleDiagonalStitchesAfter: afterDetection.count,
      removedVisibleDiagonalStitches: removed,
      convertedDiagonalToJump: converted,
      longestRemovedDiagonalMm: longest,
      sourceCommandIndex: sourceIdx,
      preservedTatamiDiagonal: detection.preservedTatamiDiagonal,
      preservedContourWithMask: detection.preservedContourWithMask,
    },
  };
}

// Conteo aislado de diagonales visibles — delega al detector ÚNICO compartido
export function countVisibleDiagonalStitches(commands = [], regions = [], darkStroke, config = {}) {
  return detectVisibleDiagonalStitches(commands, [], regions, darkStroke, config).count;
}

// ═══════════════════════════════════════════════════════════════════════════
//  FASE 2 — Reordenar capas profesionalmente (respeta bloques de color)
// ═══════════════════════════════════════════════════════════════════════════
function professionalPriority(cmd) {
  const lt = (cmd.layerType || '').toLowerCase();
  const st = (cmd.stitchType || '').toLowerCase();
  const src = (cmd.source || '').toLowerCase();
  if (lt.includes('underlay') || src.includes('underlay')) return 10;
  if (st === 'fill' && !lt.includes('shadow')) return 20;
  if (lt.includes('shadow') || lt.includes('detail_color')) return 30;
  if (st === 'fill' && lt.includes('small')) return 40;
  if (lt === 'outer_outline' || lt === 'outer_silhouette' || lt === 'limb_contour' || lt === 'real_outline_lower') return 50;
  if (lt === 'inner_outline' || lt === 'dark_stroke_outline') return 60;
  if (lt.includes('mouth') || lt.includes('facial') || lt.includes('eye') || lt === 'detail_run' || lt === 'detail_open_curve') return 70;
  return 25;
}
function blockTier(commands, pri) {
  // max priority in the block defines its tier
  const fn = typeof pri === 'function' ? pri : professionalPriority;
  let max = 0;
  for (const c of commands) if (c.type === 'stitch') max = Math.max(max, fn(c));
  return max;
}
export function reorderProfessionalLayers(commands, params = {}) {
  // contourAfterFill default true: contorno tras relleno (comportamiento profesional).
  // Si el preset pone false → contorno ANTES del relleno (efecto real en el gate).
  // detailsLast default true: detalles al final. false → detalles no forzados al final.
  const contourAfterFill = params.contourAfterFill !== false;
  const detailsLast = params.detailsLast !== false;
  const pri = (cmd) => {
    let base = professionalPriority(cmd);
    const lt = (cmd.layerType || '').toLowerCase();
    const isContour = lt.includes('outline') || lt.includes('contour');
    const isDetail = lt.includes('detail') || lt.includes('facial') || lt.includes('mouth') || lt.includes('eye');
    if (!contourAfterFill && isContour) base -= 45; // contorno antes del relleno
    if (!detailsLast && isDetail) base -= 55;       // detalles no al final
    return base;
  };
  // Split into color-blocks (a color change starts a new block)
  const blocks = [];
  let cur = [];
  let curColor = null;
  for (const c of commands) {
    if (c.type === 'color_change' || (c.color && c.color !== curColor && cur.length > 0)) {
      if (cur.length) blocks.push(cur);
      cur = [];
    }
    cur.push(c);
    if (c.color) curColor = c.color;
  }
  if (cur.length) blocks.push(cur);
  // Stable-sort within each block by priority (underlay → fill → contour → detail)
  const sortedBlocks = blocks.map(b => b.slice().sort((a, b2) => pri(a) - pri(b2)));
  // Sort blocks by tier (fills first, contours last), stable
  const indexed = sortedBlocks.map((b, i) => ({ b, i, tier: blockTier(b, pri) }));
  indexed.sort((a, b) => a.tier - b.tier || a.i - b.i);
  const out = [];
  for (let k = 0; k < indexed.length; k++) {
    if (k > 0) out.push({ type: 'color_change' });
    out.push(...indexed[k].b);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
//  FASE 5 — Reducción inteligente de colores
// ═══════════════════════════════════════════════════════════════════════════
export function professionalColorReducer(regions = [], commands = [], config = {}) {
  const p = { ...PROFESSIONAL_PARAMS, ...(config.professionalParams || {}) };
  // Collect colors with area weight
  const colorArea = new Map();
  for (const r of regions) {
    const c = (r.color || '#ffffff').toLowerCase();
    colorArea.set(c, (colorArea.get(c) || 0) + (r.area_mm2 || 100));
  }
  const colors = [...colorArea.keys()].sort((a, b) => (colorArea.get(b) || 0) - (colorArea.get(a) || 0));
  // Preserve dark detail colors (black) and small detail colors
  const preserve = new Set(colors.filter(c => isDarkColor(c)));
  // Small-area detail colors (<= 2% of total) preserved if distinct
  const totalArea = [...colorArea.values()].reduce((s, v) => s + v, 0) || 1;
  for (const c of colors) {
    if ((colorArea.get(c) || 0) / totalArea < 0.02) preserve.add(c);
  }
  // Greedy merge similar (skip preserved)
  const remap = new Map();
  const targets = [];
  for (const c of colors) {
    if (preserve.has(c)) { remap.set(c, c); targets.push(c); continue; }
    let best = null, bestD = Infinity;
    for (const t of targets) {
      if (preserve.has(t) && !isDarkColor(c)) { // don't merge a normal color into a preserved dark
        continue;
      }
      const d = colorDistance(c, t);
      if (d < bestD) { bestD = d; best = t; }
    }
    if (best && bestD < p.colorMergeLabDelta && (targets.filter(t => !preserve.has(t)).length + preserve.size) >= 1) {
      remap.set(c, best);
    } else {
      remap.set(c, c);
      targets.push(c);
    }
  }
  // Enforce maxColors: if still too many, force-merge closest non-preserved pairs
  let distinct = new Set(remap.values());
  let guard = 0;
  while (distinct.size > p.maxColors && guard++ < 50) {
    const arr = [...distinct].filter(c => !preserve.has(c));
    if (arr.length < 2) break;
    let a0 = arr[0], b0 = arr[1], d0 = colorDistance(a0, b0);
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const d = colorDistance(arr[i], arr[j]);
      if (d < d0) { d0 = d; a0 = arr[i]; b0 = arr[j]; }
    }
    // merge b0 → a0
    for (const [k, v] of remap) if (v === b0) remap.set(k, a0);
    distinct = new Set(remap.values());
  }
  const reducedRegions = regions.map(r => ({ ...r, color: remap.get((r.color || '#ffffff').toLowerCase()) || r.color }));
  const reducedCommands = commands.map(c => c.color ? { ...c, color: remap.get(c.color.toLowerCase()) || c.color } : c);
  const mergedSimilarColors = colors.filter(c => remap.get(c) !== c).length;
  const preservedDetailColors = [...preserve];
  return {
    reducedRegions, reducedCommands, remap,
    report: {
      originalColorCount: colors.length,
      reducedColorCount: new Set(remap.values()).size,
      mergedSimilarColors,
      preservedDetailColors,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  FASE 7 — Comparación Final Look vs Export
// ═══════════════════════════════════════════════════════════════════════════
export function compareFinalLookVsExport(finalLookCommands = [], exportCommands = []) {
  const countStitches = cmds => cmds.filter(c => c.type === 'stitch').length;
  const idsOf = cmds => new Set(cmds.filter(c => c.regionId).map(c => c.regionId));
  const simIds = idsOf(finalLookCommands), expIds = idsOf(exportCommands);
  const inSimNotExport = [...simIds].filter(id => !expIds.has(id));
  const inExportNotSim = [...expIds].filter(id => !simIds.has(id));
  return {
    finalLookStitches: countStitches(finalLookCommands),
    exportStitches: countStitches(exportCommands),
    stitchDelta: countStitches(finalLookCommands) - countStitches(exportCommands),
    simulationExportMismatch: countStitches(finalLookCommands) !== countStitches(exportCommands) || inSimNotExport.length > 0,
    objectsInSimNotExport: inSimNotExport,
    objectsInExportNotSim: inExportNotSim,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  FASE 6 — Quality Gate profesional
// ═══════════════════════════════════════════════════════════════════════════
export function professionalEmbroideryQualityGate(commands = [], objects = [], regions = [], darkStroke, config = {}) {
  const p = { ...PROFESSIONAL_PARAMS, ...(config.professionalParams || {}) };
  const vis = validateVisibleStitchesBeforeExport(commands, regions, darkStroke, config);
  // visibleDiagonalStitches: usa el clasificador de reparación (consistente con
  // repairVisibleDiagonalStitches) en lugar del contador legacy que solo medía
  // longitud+color. Esto refleja exactamente lo que el modo profesional repara.
  const visibleDiagonalStitches = countVisibleDiagonalStitches(commands, regions, darkStroke, config);
  const colorCount = new Set(commands.filter(c => c.color).map(c => c.color.toLowerCase())).size;

  let shortStitches = 0, duplicateStitches = 0, jumps = 0, trims = 0, fillAfterContour = false;
  let prev = null, firstContour = -1, lastFill = -1;
  for (let i = 0; i < commands.length; i++) {
    const c = commands[i];
    if (c.type === 'jump') jumps++;
    if (c.type === 'trim') trims++;
    if (c.type === 'stitch') {
      if (prev) {
        const d = Math.hypot((c.x || 0) - prev.x, (c.y || 0) - prev.y);
        if (d < p.shortStitchMm && d > 0) shortStitches++;
        if (d < p.duplicateMm) duplicateStitches++;
      }
      prev = { x: c.x || 0, y: c.y || 0 };
      const lt = (c.layerType || '').toLowerCase();
      const isContour = lt.includes('outline') || lt.includes('contour') || lt.includes('facial') || lt.includes('detail');
      const isFill = c.stitchType === 'fill' || c.source === 'clipped_fill_optimized';
      if (isContour && firstContour < 0) firstContour = i;
      if (isFill) lastFill = i;
    }
  }
  fillAfterContour = firstContour >= 0 && lastFill > firstContour;

  // contour missing on one foot
  const w = 100, h = 100;
  const footZone = (x, y) => { if (y < h * 0.2) return null; if (x < -w * 0.05) return 'left'; if (x > w * 0.05) return 'right'; return null; };
  const footContour = { left: false, right: false };
  for (const o of objects) {
    const pts = o.points || [];
    if (pts.length < 2) continue;
    let cx = 0, cy = 0;
    for (const pt of pts) { cx += pt[0]; cy += pt[1]; }
    cx /= pts.length; cy /= pts.length;
    const z = footZone(cx, cy);
    if (z) footContour[z] = true;
  }
  const contourMissingOnOneFoot = footContour.left !== footContour.right;

  const satinContourCount = objects.filter(o => (o.layerType || '').toLowerCase().includes('outline') && o.stitch_type === 'satin').length;
  const runningContourCount = objects.filter(o => (o.layerType || '').toLowerCase().includes('outline') && o.stitch_type !== 'satin').length + objects.filter(o => (o.layerType || '').toLowerCase().includes('detail')).length;
  const fillRegionCount = (regions || []).filter(r => r.stitch_type === 'fill').length;
  const underlayCount = commands.filter(c => (c.layerType || '').toLowerCase().includes('underlay') || (c.source || '').toLowerCase().includes('underlay')).length;

  const blocks = [
    { name: 'visibleDiagonalStitches', fail: visibleDiagonalStitches > 0, value: visibleDiagonalStitches, limit: 0 },
    { name: 'unsupportedLongStitches', fail: vis.report.stitchWithoutDarkMaskSupport > 0, value: vis.report.stitchWithoutDarkMaskSupport, limit: 0 },
    { name: 'contourMissingOnOneFoot', fail: contourMissingOnOneFoot, value: contourMissingOnOneFoot, limit: 0 },
    { name: 'fillAfterContour', fail: fillAfterContour, value: fillAfterContour, limit: 0 },
    { name: 'colorCountOver8', fail: colorCount > p.maxColors, value: colorCount, limit: p.maxColors },
    { name: 'duplicateStitches', fail: duplicateStitches > 200, value: duplicateStitches, limit: 200 },
    { name: 'shortStitches', fail: shortStitches > 300, value: shortStitches, limit: 300 },
    { name: 'jumps', fail: jumps > 250, value: jumps, limit: 250 },
    { name: 'trims', fail: trims > 80, value: trims, limit: 80 },
  ];
  const failed = blocks.filter(b => b.fail).map(b => b.name);
  let score = 100;
  if (visibleDiagonalStitches > 0) score -= 30;
  if (contourMissingOnOneFoot) score -= 20;
  if (fillAfterContour) score -= 15;
  if (colorCount > p.maxColors) score -= 10;
  if (duplicateStitches > 200) score -= 5;
  if (shortStitches > 300) score -= 5;
  if (jumps > 250) score -= 5;
  score = Math.max(0, score);

  return {
    visibleDiagonalStitches,
    unsupportedTravelStitches: vis.report.unsupportedTravelStitches,
    satinContourCount, runningContourCount, fillRegionCount, underlayCount,
    colorCount, colorCountBefore: colorCount, colorCountAfter: colorCount,
    shortStitches, duplicateStitches, jumps, trims,
    fillAfterContour, contourMissingOnOneFoot,
    professionalScore: score,
    failedBlocks: failed,
    blocks,
    passed: failed.length === 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  PIPELINE — aplica todas las fases al output de buildFinalCommands
// ═══════════════════════════════════════════════════════════════════════════
export function applyProfessionalPipeline({ commands, objects, regions, config, darkStroke }) {
  if (!config?.professionalMode) return { commands, objects, report: null };

  // ── Reference Learning Engine v2: apply learned preset (gated) ──────────────
  // When the project config carries learned* keys (from applyLearnedProfileToMotor),
  // project them onto professionalParams so the existing phases use professional
  // values mined from the corpus. Absent keys → default behavior unchanged
  // (regression suite runs without learned config).
  const learnedParams = {};
  if (config.learnedMaxVisibleStitchMm != null) {
    learnedParams.maxVisibleStitchMm = config.learnedMaxVisibleStitchMm;
    learnedParams.suspiciousDiagonalMinMm = Math.min(
      PROFESSIONAL_PARAMS.suspiciousDiagonalMinMm,
      config.learnedMaxVisibleStitchMm,
    );
  }
  if (config.learnedMaxColorCount != null) learnedParams.maxColors = config.learnedMaxColorCount;
  if (config.learnedSatinWidthMm != null) learnedParams.satinWidthMm = config.learnedSatinWidthMm;
  if (config.learnedFillStitchLengthMm != null) learnedParams.fillStitchLenMm = config.learnedFillStitchLengthMm;
  // ── Density / angle / pull-compensation (auto-applied from reference corpus) ──
  if (config.learnedFillDensityMm != null) learnedParams.fillDensityMm = config.learnedFillDensityMm;
  if (config.learnedFillAngleDeg != null) learnedParams.fillAngleDeg = config.learnedFillAngleDeg;
  if (config.learnedSatinColumnSpacingMm != null) learnedParams.satinDensityMm = config.learnedSatinColumnSpacingMm;
  if (config.learnedPullCompensationMm != null) learnedParams.pullCompMm = config.learnedPullCompensationMm;
  // ── Travel rules from learned preset (FASE 6) ──
  // convertTravelAboveMmToJump → cualquier stitch > este umbral sin soporte de
  //   región se convierte en jump+trim (travel oculto). Mapea a longConnectorMm
  //   que usa el clasificador de diagonales.
  if (config.learnedConvertTravelAboveMmToJump != null) {
    learnedParams.longConnectorMm = config.learnedConvertTravelAboveMmToJump;
  }
  // trimBeforeTravelMm → inserta trim antes de cualquier salto > este umbral.
  //   Se aplica como un pase adicional en el pipeline.
  if (config.learnedTrimBeforeTravelMm != null) {
    learnedParams.trimBeforeTravelMm = config.learnedTrimBeforeTravelMm;
  }
  // ── Capa / contorno (CARTOON_OUTLINE_PROFESSIONAL_OVERRIDE + preset) ──
  // Estas keys controlan orden de capas (contourAfterFill, detailsLast) y la
  // conversión satin↔running del contorno exterior. Sin learned* → default
  // (contour tras fill, satin outer, details al final) → regresión intacta.
  if (config.learnedContourAfterFill != null) learnedParams.contourAfterFill = config.learnedContourAfterFill;
  if (config.learnedUseSatinForOuterContours != null) learnedParams.useSatinForOuterContours = config.learnedUseSatinForOuterContours;
  if (config.learnedDetailsLast != null) learnedParams.detailsLast = config.learnedDetailsLast;
  const effectiveConfig = Object.keys(learnedParams).length
    ? { ...config, professionalParams: { ...(config.professionalParams || {}), ...learnedParams } }
    : config;

  // FASE 5 — reducción de colores primero (afecta colores de commands)
  const colorRes = professionalColorReducer(regions, commands, effectiveConfig);
  let procCommands = colorRes.reducedCommands;
  const procRegions = colorRes.reducedRegions;

  // FASE 2 — reordenar capas (respeta contourAfterFill + detailsLast del preset)
  procCommands = reorderProfessionalLayers(procCommands, {
    contourAfterFill: effectiveConfig.professionalParams?.contourAfterFill,
    detailsLast: effectiveConfig.professionalParams?.detailsLast,
  });

  // FASE 1 (real) — reparar diagonales visibles ANTES del gate y de exportar.
  // Cuenta las diagonales sospechosas en bruto, repara (trim+jump) y luego el
  // gate se evalúa sobre los comandos ya reparados.
  const diagonalBefore = countVisibleDiagonalStitches(procCommands, procRegions, darkStroke, effectiveConfig);
  const repair = repairVisibleDiagonalStitches(procCommands, procRegions, darkStroke, effectiveConfig);
  procCommands = repair.commands;
  // Mantener el sanitize legacy para travel/long-black restante (no toca diagonales ya reparadas)
  const vis = validateVisibleStitchesBeforeExport(procCommands, procRegions, darkStroke, effectiveConfig);
  procCommands = vis.commands;

  // ── CARTOON_OUTLINE_PROFESSIONAL_OVERRIDE / preset flags — efecto real ──
  // useSatinForOuterContours=false → convierte satin de contorno exterior en
  //   running stitch (centerline). useSatinForOuterContours=true (override
  //   cartoon) → mantiene satin (default). Afecta a objects + commands reales.
  if (effectiveConfig.professionalParams?.useSatinForOuterContours === false) {
    procCommands = convertOuterSatinToRunning(procCommands);
    objects = markOuterObjectsAsRunning(objects);
  }

  // ── FASE 6 — trim antes de saltos largos (regla aprendida J002) ──
  // REFERENCE_TRIM_GUARD_V1: versión protegida — mide, presupuesta, filtra y
  // revierte la fase completa si empeora métricas críticas. No elimina
  // insertTrimBeforeLongJumps (legacy intacto).
  const trimBeforeMm = effectiveConfig.professionalParams?.trimBeforeTravelMm;
  let trimGuard = null;
  if (trimBeforeMm && trimBeforeMm > 0) {
    const guardRes = insertTrimBeforeLongJumpsGuarded(procCommands, trimBeforeMm, {
      objects, regions: procRegions, config: effectiveConfig, darkStroke,
    });
    procCommands = guardRes.commands;
    trimGuard = guardRes.report;
  }

  // FASE 6 — quality gate (sobre comandos reparados)
  const gate = professionalEmbroideryQualityGate(procCommands, objects, procRegions, darkStroke, effectiveConfig);
  gate.colorCountBefore = colorRes.report.originalColorCount;
  gate.colorCountAfter = colorRes.report.reducedColorCount;
  // Métricas de reparación de diagonales (FASE 1 real)
  gate.visibleDiagonalStitchesBefore = diagonalBefore;
  gate.visibleDiagonalStitchesAfter = gate.visibleDiagonalStitches;
  gate.removedVisibleDiagonalStitches = repair.report.removedVisibleDiagonalStitches;
  gate.convertedDiagonalToJump = repair.report.convertedDiagonalToJump;
  gate.longestRemovedDiagonalMm = repair.report.longestRemovedDiagonalMm;
  gate.repairedCommandsUsedForExport = true;

  return {
    commands: procCommands,
    objects,
    regions: procRegions,
    report: {
      color: colorRes.report,
      visible: vis.report,
      repair: repair.report,
      gate,
      trimGuard,
    },
  };
}

// ── Trim antes de saltos largos (regla aprendida J002) ─────────────────────────
// Inserta un trim antes de cualquier jump > trimBeforeMm si no hay ya un trim
// inmediatamente antes. No duplica trims existentes.
function insertTrimBeforeLongJumps(commands, trimBeforeMm) {
  const out = [];
  let prev = null;
  for (let i = 0; i < commands.length; i++) {
    const c = commands[i];
    if (c.type === 'jump' && prev) {
      const d = Math.hypot((c.x ?? 0) - prev.x, (c.y ?? 0) - prev.y);
      if (d > trimBeforeMm) {
        // solo insertar si el comando anterior no es ya un trim
        const prevCmd = out[out.length - 1];
        if (!prevCmd || prevCmd.type !== 'trim') {
          out.push({ type: 'trim' });
        }
      }
    }
    out.push(c);
    if (c.type === 'stitch' || c.type === 'jump') prev = { x: c.x, y: c.y };
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
//  REFERENCE_TRIM_GUARD_V1 — versión protegida de insertTrimBeforeLongJumps
// ═══════════════════════════════════════════════════════════════════════════
// Evita que learnedTrimBeforeTravelMm dispare trimCount de forma descontrolada.
// 1) mide before, 2) presupuesto maxNewTrims, 3) detecta/filtra candidatos,
// 4) ordena por distancia desc y aplica solo hasta el presupuesto,
// 5) guard transaccional: revierte la fase completa si empeora métricas críticas.
// No elimina insertTrimBeforeLongJumps (legacy intacto).
function countTrimJumpTotal(commands) {
  let trims = 0, jumps = 0, total = 0;
  for (const c of commands) {
    total++;
    if (c.type === 'trim') trims++;
    else if (c.type === 'jump') jumps++;
  }
  return { trims, jumps, total };
}

function countEmptyColorBlocks(commands) {
  let empty = 0, hasStitch = false, hasAny = false;
  for (const c of commands) {
    if (c.type === 'color_change' || c.type === 'colorChange') {
      if (hasAny && !hasStitch) empty++;
      hasStitch = false; hasAny = false; continue;
    }
    hasAny = true;
    if (c.type === 'stitch') hasStitch = true;
  }
  if (hasAny && !hasStitch) empty++;
  return empty;
}

function measureGuardHealth(commands, objects, regions, config, darkStroke) {
  const ce01 = validateCE01(commands, objects || [], regions || [], config || {}, {});
  const gate = professionalEmbroideryQualityGate(commands, objects || [], regions || [], darkStroke, config || {});
  return {
    ce01Status: ce01.status,
    ce01Score: ce01.score,
    exportAllowed: ce01.ce01Ready,
    emptyBlocks: countEmptyColorBlocks(commands),
    visibleDiagonalStitches: gate.visibleDiagonalStitches ?? 0,
    unsupportedLongStitches: ce01.rawMetrics?.longStitches ?? 0,
    professionalScore: gate.professionalScore ?? 0,
  };
}

export function insertTrimBeforeLongJumpsGuarded(commands, trimBeforeMm, options = {}) {
  const beforeMetrics = countTrimJumpTotal(commands);
  const beforeHealth = measureGuardHealth(commands, options.objects, options.regions, options.config, options.darkStroke);
  const beforeTrimCount = beforeMetrics.trims;

  // Presupuesto máximo de trims nuevos (techo 40, suelo 12, 35% del baseline).
  const maxNewTrims = Math.max(12, Math.min(40, Math.ceil(beforeTrimCount * 0.35)));

  // ── Detectar candidatos: jumps con distancia > trimBeforeMm ──────────────
  const candidates = [];
  let prev = null;
  for (let i = 0; i < commands.length; i++) {
    const c = commands[i];
    if (c.type === 'jump' && prev) {
      const d = Math.hypot((c.x ?? 0) - prev.x, (c.y ?? 0) - prev.y);
      if (d > trimBeforeMm) candidates.push({ index: i, dist: d });
    }
    if (c.type === 'stitch' || c.type === 'jump') prev = { x: c.x ?? 0, y: c.y ?? 0 };
  }
  const candidatesFound = candidates.length;

  // ── Filtrar candidatos inseguros ─────────────────────────────────────────
  const skip = { nearbyTrim: 0, colorChange: 0, microBlock: 0, unsafeCoords: 0, budgetExceeded: 0 };
  const accepted = [];
  for (const cand of candidates) {
    const i = cand.index;
    const jc = commands[i];
    // unsafe coords
    if (!jc || typeof jc.x !== 'number' || typeof jc.y !== 'number' ||
        Number.isNaN(jc.x) || Number.isNaN(jc.y)) { skip.unsafeCoords++; continue; }
    // trim anterior inmediato
    const prevCmd = i > 0 ? commands[i - 1] : null;
    if (prevCmd && prevCmd.type === 'trim') { skip.nearbyTrim++; continue; }
    // trim en los 2 comandos anteriores
    if (i >= 2 && commands[i - 2] && commands[i - 2].type === 'trim') { skip.nearbyTrim++; continue; }
    // trim en los 2 comandos posteriores
    if (commands[i + 1] && commands[i + 1].type === 'trim') { skip.nearbyTrim++; continue; }
    if (commands[i + 2] && commands[i + 2].type === 'trim') { skip.nearbyTrim++; continue; }
    // colorChange cerca (±3) — el cambio de color ya actúa como parada
    let colorNear = false;
    for (let k = Math.max(0, i - 3); k <= Math.min(commands.length - 1, i + 3); k++) {
      const cc = commands[k];
      if (cc && (cc.type === 'color_change' || cc.type === 'colorChange')) { colorNear = true; break; }
    }
    if (colorNear) { skip.colorChange++; continue; }
    // microbloque protegido: < 4 comandos entre límites (trim/colorChange)
    let bs = i;
    while (bs > 0) { const p = commands[bs - 1]; if (!p || p.type === 'trim' || p.type === 'color_change' || p.type === 'colorChange') break; bs--; }
    let be = i;
    while (be < commands.length - 1) { const n = commands[be + 1]; if (!n || n.type === 'trim' || n.type === 'color_change' || n.type === 'colorChange') break; be++; }
    if (be - bs + 1 < 4) { skip.microBlock++; continue; }
    accepted.push(cand);
  }

  // ── Ordenar por distancia desc y aplicar hasta maxNewTrims ────────────────
  accepted.sort((a, b) => b.dist - a.dist);
  const applySet = new Set();
  let applied = 0;
  for (const cand of accepted) {
    if (applied >= maxNewTrims) { skip.budgetExceeded++; continue; }
    applySet.add(cand.index);
    applied++;
  }

  // ── Construir salida insertando trim solo en los seleccionados ───────────
  const out = [];
  for (let i = 0; i < commands.length; i++) {
    if (applySet.has(i)) {
      const pc = out[out.length - 1];
      if (!pc || pc.type !== 'trim') out.push({ type: 'trim' });
    }
    out.push(commands[i]);
  }

  const afterMetrics = countTrimJumpTotal(out);
  const afterHealth = measureGuardHealth(out, options.objects, options.regions, options.config, options.darkStroke);

  // ── Guard transaccional: revertir si empeora métricas críticas ────────────
  let revertReason = null;
  if (afterMetrics.trims > beforeTrimCount + maxNewTrims)
    revertReason = `afterTrimCount (${afterMetrics.trims}) > before+maxNewTrims (${beforeTrimCount}+${maxNewTrims})`;
  else if (afterMetrics.trims > beforeTrimCount * 1.5)
    revertReason = `afterTrimCount (${afterMetrics.trims}) > before*1.5 (${(beforeTrimCount * 1.5).toFixed(0)})`;
  else if (afterHealth.visibleDiagonalStitches > beforeHealth.visibleDiagonalStitches)
    revertReason = `visibleDiagonalStitches subió (${beforeHealth.visibleDiagonalStitches} → ${afterHealth.visibleDiagonalStitches})`;
  else if (afterHealth.emptyBlocks > beforeHealth.emptyBlocks)
    revertReason = `emptyBlocks subió (${beforeHealth.emptyBlocks} → ${afterHealth.emptyBlocks})`;
  else if (afterHealth.unsupportedLongStitches > beforeHealth.unsupportedLongStitches)
    revertReason = `unsupportedLongStitches subió (${beforeHealth.unsupportedLongStitches} → ${afterHealth.unsupportedLongStitches})`;
  else if (afterHealth.ce01Status === 'INVALID' && beforeHealth.ce01Status !== 'INVALID')
    revertReason = `CE01 pasó a INVALID (${beforeHealth.ce01Status} → INVALID)`;
  else if (afterHealth.exportAllowed === false && beforeHealth.exportAllowed === true)
    revertReason = `exportAllowed pasó a false`;
  else if (afterHealth.professionalScore < beforeHealth.professionalScore - 3)
    revertReason = `professionalScore bajó más de 3 (${beforeHealth.professionalScore} → ${afterHealth.professionalScore})`;

  const phaseAccepted = !revertReason;
  const finalCommands = phaseAccepted ? out : commands;

  const report = {
    version: 'REFERENCE_TRIM_GUARD_V1',
    trimBeforeMm,
    beforeTrimCount,
    afterTrimCount: phaseAccepted ? afterMetrics.trims : beforeTrimCount,
    beforeJumpCount: beforeMetrics.jumps,
    afterJumpCount: phaseAccepted ? afterMetrics.jumps : beforeMetrics.jumps,
    beforeCommandCount: beforeMetrics.total,
    afterCommandCount: phaseAccepted ? afterMetrics.total : beforeMetrics.total,
    maxNewTrims,
    candidatesFound,
    candidatesApplied: applied,
    candidatesSkippedBecauseNearbyTrim: skip.nearbyTrim,
    candidatesSkippedBecauseColorChange: skip.colorChange,
    candidatesSkippedBecauseMicroBlock: skip.microBlock,
    candidatesSkippedBecauseUnsafeCoords: skip.unsafeCoords,
    candidatesSkippedBecauseBudgetExceeded: skip.budgetExceeded,
    phaseAccepted,
    revertReason,
    ce01StatusBefore: beforeHealth.ce01Status,
    ce01StatusAfter: phaseAccepted ? afterHealth.ce01Status : beforeHealth.ce01Status,
    ce01ScoreBefore: beforeHealth.ce01Score,
    ce01ScoreAfter: phaseAccepted ? afterHealth.ce01Score : beforeHealth.ce01Score,
    professionalScoreBefore: beforeHealth.professionalScore,
    professionalScoreAfter: phaseAccepted ? afterHealth.professionalScore : beforeHealth.professionalScore,
    visibleDiagonalStitchesBefore: beforeHealth.visibleDiagonalStitches,
    visibleDiagonalStitchesAfter: phaseAccepted ? afterHealth.visibleDiagonalStitches : beforeHealth.visibleDiagonalStitches,
    emptyBlocksBefore: beforeHealth.emptyBlocks,
    emptyBlocksAfter: phaseAccepted ? afterHealth.emptyBlocks : beforeHealth.emptyBlocks,
    unsupportedLongStitchesBefore: beforeHealth.unsupportedLongStitches,
    unsupportedLongStitchesAfter: phaseAccepted ? afterHealth.unsupportedLongStitches : beforeHealth.unsupportedLongStitches,
  };
  report.md = buildTrimGuardReportMd(report);

  return { commands: finalCommands, report };
}

// ── Generador del informe REFERENCE_TRIM_GUARD_REPORT_V1.md ──────────────────
function buildTrimGuardReportMd(r) {
  const md = [];
  md.push('# REFERENCE_TRIM_GUARD_REPORT_V1 — StitchPath AI\n');
  md.push(`> Generado: ${new Date().toISOString()}`);
  md.push('> REFERENCE_TRIM_GUARD_V1 — guard transaccional sobre `insertTrimBeforeLongJumps`.');
  md.push('> Evita que `learnedTrimBeforeTravelMm` dispare `trimCount` de forma descontrolada.\n');
  md.push('## Parámetros');
  md.push(`- **trimBeforeMm**: ${r.trimBeforeMm}`);
  md.push(`- **maxNewTrims** (presupuesto): ${r.maxNewTrims} = max(12, min(40, ceil(${r.beforeTrimCount} * 0.35)))`);
  md.push('\n## Conteo antes/después');
  md.push('| Métrica | Antes | Después |');
  md.push('|---|---|---|');
  md.push(`| trimCount | ${r.beforeTrimCount} | ${r.afterTrimCount} |`);
  md.push(`| jumpCount | ${r.beforeJumpCount} | ${r.afterJumpCount} |`);
  md.push(`| commandCount | ${r.beforeCommandCount} | ${r.afterCommandCount} |`);
  md.push('\n## Candidatos');
  md.push(`- **candidatesFound**: ${r.candidatesFound}`);
  md.push(`- **candidatesApplied**: ${r.candidatesApplied}`);
  md.push(`- candidatesSkippedBecauseNearbyTrim: ${r.candidatesSkippedBecauseNearbyTrim}`);
  md.push(`- candidatesSkippedBecauseColorChange: ${r.candidatesSkippedBecauseColorChange}`);
  md.push(`- candidatesSkippedBecauseMicroBlock: ${r.candidatesSkippedBecauseMicroBlock}`);
  md.push(`- candidatesSkippedBecauseUnsafeCoords: ${r.candidatesSkippedBecauseUnsafeCoords}`);
  md.push(`- candidatesSkippedBecauseBudgetExceeded: ${r.candidatesSkippedBecauseBudgetExceeded}`);
  md.push('\n## Veredicto de fase');
  md.push(`- **phaseAccepted**: ${r.phaseAccepted}`);
  if (r.phaseAccepted) {
    md.push('- La fase se aplicó (mejora o neutro en métricas críticas).');
  } else {
    md.push(`- **revertReason**: ${r.revertReason}`);
    md.push('- La fase se revirtió — se conservan los comandos originales.');
  }
  md.push('\n## Salud crítica antes/después');
  md.push('| Métrica | Antes | Después |');
  md.push('|---|---|---|');
  md.push(`| CE01 status | ${r.ce01StatusBefore} | ${r.ce01StatusAfter} |`);
  md.push(`| professionalScore | ${r.professionalScoreBefore} | ${r.professionalScoreAfter} |`);
  md.push(`| visibleDiagonalStitches | ${r.visibleDiagonalStitchesBefore} | ${r.visibleDiagonalStitchesAfter} |`);
  md.push(`| emptyBlocks | ${r.emptyBlocksBefore} | ${r.emptyBlocksAfter} |`);
  md.push(`| unsupportedLongStitches | ${r.unsupportedLongStitchesBefore} | ${r.unsupportedLongStitchesAfter} |`);
  md.push('\n## Criterios de revertido');
  md.push('- afterTrimCount > beforeTrimCount + maxNewTrims');
  md.push('- afterTrimCount > beforeTrimCount * 1.5');
  md.push('- visibleDiagonalStitches sube');
  md.push('- emptyBlocks sube');
  md.push('- unsupportedLongStitches sube');
  md.push('- CE01 pasa a INVALID');
  md.push('- exportAllowed pasa a false');
  md.push('- professionalScore baja más de 3 puntos');
  md.push('\n---');
  md.push('_REFERENCE_TRIM_GUARD_V1 — fix reversible. No toca V5.1, Safe Tie, encoders, ni exportación._');
  return md.join('\n');
}

export function getProfessionalPanelMetrics(commands, objects, regions, exportCommands, darkStroke, config) {
  const gate = professionalEmbroideryQualityGate(commands, objects, regions, darkStroke, config);
  const cmp = compareFinalLookVsExport(commands, exportCommands || commands);
  return { gate, cmp };
}

// ── Conversión outer satin → running (useSatinForOuterContours=false) ──────────
// Efecto REAL: el contorno exterior deja de ser zigzag satin y pasa a ser una
// línea running (centerline). Se reconstruye el centerline como el punto medio
// de cada par de puntadas opuestas (left/right rail). Se etiqueta stitchType
// como running_stitch. Es una conversión geométrica, no solo un relabel.
function convertOuterSatinToRunning(commands) {
  const out = [];
  let i = 0;
  while (i < commands.length) {
    const c = commands[i];
    const isOuterSatin = c.type === 'stitch' &&
      (c.layerType || '').toLowerCase().includes('outer_outline') &&
      ((c.stitchType || '').toLowerCase().includes('satin') || (c.source || '').toLowerCase().includes('satin'));
    if (!isOuterSatin) { out.push(c); i++; continue; }
    // recolectar run de satin outer continuo
    const run = [];
    while (i < commands.length) {
      const cc = commands[i];
      if (cc.type === 'stitch' &&
        (cc.layerType || '').toLowerCase().includes('outer_outline') &&
        ((cc.stitchType || '').toLowerCase().includes('satin') || (cc.source || '').toLowerCase().includes('satin'))) {
        run.push(cc); i++;
      } else break;
    }
    // centerline = punto medio de cada par (left/right rail)
    const mid = [];
    for (let k = 0; k + 1 < run.length; k += 2) {
      const a = run[k], b = run[k + 1];
      mid.push({ ...a, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, stitchType: 'running_stitch', source: 'satin_to_running' });
    }
    if (run.length % 2 === 1) {
      // puntada impar residual: proyectar al último punto del run
      const last = run[run.length - 1];
      mid.push({ ...last, stitchType: 'running_stitch', source: 'satin_to_running' });
    }
    if (mid.length) out.push(...mid);
  }
  return out;
}

// Marca los objetos de contorno exterior como running para que el gate cuente
// satinContourCount/runningContourCount de forma coherente con los comandos.
function markOuterObjectsAsRunning(objects) {
  if (!Array.isArray(objects)) return objects;
  return objects.map((o) => {
    if ((o.layerType || '').toLowerCase().includes('outer_outline') && o.stitch_type === 'satin') {
      return { ...o, stitch_type: 'running_stitch' };
    }
    return o;
  });
}