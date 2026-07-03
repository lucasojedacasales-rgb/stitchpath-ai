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
function blockTier(commands) {
  // max priority in the block defines its tier
  let max = 0;
  for (const c of commands) if (c.type === 'stitch') max = Math.max(max, professionalPriority(c));
  return max;
}
export function reorderProfessionalLayers(commands) {
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
  const sortedBlocks = blocks.map(b => b.slice().sort((a, b2) => professionalPriority(a) - professionalPriority(b2)));
  // Sort blocks by tier (fills first, contours last), stable
  const indexed = sortedBlocks.map((b, i) => ({ b, i, tier: blockTier(b) }));
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
    { name: 'visibleDiagonalStitches', fail: vis.report.visibleDiagonalStitches > 0, value: vis.report.visibleDiagonalStitches, limit: 0 },
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
  if (vis.report.visibleDiagonalStitches > 0) score -= 30;
  if (contourMissingOnOneFoot) score -= 20;
  if (fillAfterContour) score -= 15;
  if (colorCount > p.maxColors) score -= 10;
  if (duplicateStitches > 200) score -= 5;
  if (shortStitches > 300) score -= 5;
  if (jumps > 250) score -= 5;
  score = Math.max(0, score);

  return {
    visibleDiagonalStitches: vis.report.visibleDiagonalStitches,
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

  // FASE 5 — reducción de colores primero (afecta colores de commands)
  const colorRes = professionalColorReducer(regions, commands, config);
  let procCommands = colorRes.reducedCommands;
  const procRegions = colorRes.reducedRegions;

  // FASE 2 — reordenar capas
  procCommands = reorderProfessionalLayers(procCommands);

  // FASE 1 — eliminar diagonales visibles
  const vis = validateVisibleStitchesBeforeExport(procCommands, procRegions, darkStroke, config);
  procCommands = vis.commands;

  // FASE 6 — quality gate
  const gate = professionalEmbroideryQualityGate(procCommands, objects, procRegions, darkStroke, config);
  gate.colorCountBefore = colorRes.report.originalColorCount;
  gate.colorCountAfter = colorRes.report.reducedColorCount;

  return {
    commands: procCommands,
    objects,
    regions: procRegions,
    report: {
      color: colorRes.report,
      visible: vis.report,
      gate,
    },
  };
}

export function getProfessionalPanelMetrics(commands, objects, regions, exportCommands, darkStroke, config) {
  const gate = professionalEmbroideryQualityGate(commands, objects, regions, darkStroke, config);
  const cmp = compareFinalLookVsExport(commands, exportCommands || commands);
  return { gate, cmp };
}