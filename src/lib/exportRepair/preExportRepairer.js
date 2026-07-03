/**
 * preExportRepairer.js — Reparaciones técnicas reales (v2 transaccional)
 * ─────────────────────────────────────────────────────────────────────────────
 * Cada función opera SOBRE la lista de comandos plana. No toca regiones,
 * formas, colores principales, el detector de contornos, el Final Look visual,
 * los encoders ni el CE01 loader. Preserva boca/ojos/pies/contornos y detalles.
 *
 * Cada fase devuelve comandos nuevos + rellena `report` con contadores reales.
 * El orquestador mide métricas antes/después y revierte la fase si empeora.
 *
 * Orden (orquestador transaccional):
 *   1. removeEmptyBlocks
 *   2. repairVisibleDiagonalStitches
 *   3. splitUnsafeLongStitches
 *   4. removeDuplicateStitches
 *   5. mergeShortStitches
 *   6. optimizeTrimsAndJumps
 *   7. addTieInTieOff            (siempre al final, sobre bloques consolidados)
 *   8. reduceColorChangesIfSafe
 */

const DUP_TOL_MM = 0.1;          // duplicada consecutiva si dist < esto
const SHORT_MERGE_MM = 0.6;      // fusionar si el segmento es menor a esto
const MAX_STITCH_MM = 8.0;       // puntada larga insegura
const SPLIT_SEG_MM = 7.5;        // dividir en segmentos de este tamaño
const MAX_JUMP_MM = 12.1;        // salto máximo CE01
const TRIM_JUMP_MM = 3.5;        // trim antes de saltos > esto
const TIE_LEN_MM = 0.4;          // longitud de puntada de anclaje (tie)
const TIE_COUNT = 2;             // 2 tie-in + 2 tie-off por bloque
const MIN_BLOCK_FOR_TIE = 8;     // no añadir ties a micro-bloques
const TINY_OBJECT_STITCHES = 3;

// ── helpers ──────────────────────────────────────────────────────────────────
function isDetailLayer(cmd) {
  const lt = String(cmd.layerType || '').toLowerCase();
  const rc = String(cmd.region_class || '').toLowerCase();
  return lt.includes('mouth') || lt.includes('eye') || lt.includes('facial') ||
    lt.includes('detail') || rc.includes('detail') || rc.includes('mouth') || rc.includes('eye');
}
function isDarkColor(hex) {
  if (!hex) return false;
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) < 80;
}
function isContourLayer(cmd) {
  const lt = String(cmd.layerType || '').toLowerCase();
  return lt.includes('outline') || lt.includes('contour');
}
function isImportantDetail(cmd) {
  return isDetailLayer(cmd) || isContourLayer(cmd);
}
function lastStitch(arr) {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i].type === 'stitch') return arr[i];
  return null;
}
function nextStitch(commands, from) {
  for (let i = from; i < commands.length; i++) if (commands[i].type === 'stitch') return commands[i];
  return null;
}

// ── point-in-polygon (coordenadas normalizadas path_points) ──────────────────
function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
const NORM_W = 100, NORM_H = 100;
function regionAt(x, y, regions) {
  if (!regions || !regions.length) return null;
  const nx = (x / NORM_W + 0.5), ny = (y / NORM_H + 0.5);
  for (const r of regions) {
    const pp = r.path_points;
    if (!pp || pp.length < 3) continue;
    if (pointInPolygon(nx, ny, pp)) return r;
  }
  return null;
}

// ── soporte de máscara dark stroke para un segmento ───────────────────────────
function segmentDarkSupport(ax, ay, bx, by, darkStroke) {
  if (!darkStroke?.strictMask) return 0;
  const W = darkStroke.width, H = darkStroke.height, mask = darkStroke.strictMask;
  const len = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(2, Math.ceil(len));
  let hits = 0;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const mx = ax + (bx - ax) * t, my = ay + (by - ay) * t;
    const px = Math.round((mx / NORM_W + 0.5) * W), py = Math.round((my / NORM_H + 0.5) * H);
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

// ═══════════════════════════════════════════════════════════════════════════
//  FASE 1 — removeEmptyBlocks
// ═══════════════════════════════════════════════════════════════════════════
// Detecta bloques de color sin stitches reales y elimina el colorChange (y
// trims redundantes) que los introduce. Conserva bloques con detalles pequeños
// reales. No elimina jumps de posicionamiento (se reasocian al color previo).
export function removeEmptyBlocks(commands, _objects, _regions, report = {}) {
  let removed = 0;
  const dropIdx = new Set();
  for (let i = 0; i < commands.length; i++) {
    if (commands[i].type !== 'colorChange') continue;
    let hasStitch = false;
    for (let j = i + 1; j < commands.length; j++) {
      if (commands[j].type === 'colorChange') break;
      if (commands[j].type === 'stitch') { hasStitch = true; break; }
    }
    if (!hasStitch) { dropIdx.add(i); removed++; }
  }
  // también elimina trims redundantes que quedan colgados sin stitches después
  for (let i = 0; i < commands.length; i++) {
    if (commands[i].type !== 'trim') continue;
    // trim seguido solo de jumps/trim/colorChange hasta fin o siguiente colorChange sin stitches → redundante
    let hasStitchAfter = false;
    for (let j = i + 1; j < commands.length; j++) {
      if (commands[j].type === 'stitch') { hasStitchAfter = true; break; }
    }
    if (!hasStitchAfter && i === commands.length - 1) { dropIdx.add(i); }
  }
  if (removed === 0 && dropIdx.size === 0) { report.emptyBlocksRemoved = 0; return commands; }
  const out = commands.filter((_, i) => !dropIdx.has(i));
  report.emptyBlocksRemoved = removed;
  report.redundantTrimsRemoved = dropIdx.size - removed;
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
//  FASE 2 — repairVisibleDiagonalStitches
// ═══════════════════════════════════════════════════════════════════════════
// Para cada stitch: longitud, ángulo, cruce de región, soporte darkStroke.
// Si es diagonal visible sospechosa → trim + jump (no coser la diagonal).
export function repairVisibleDiagonalStitches(commands, _objects, regions, report = {}) {
  const darkStroke = report?.darkStroke || null;
  const out = [];
  let removed = 0, converted = 0;
  let prev = null;
  for (let i = 0; i < commands.length; i++) {
    const c = commands[i];
    if (c.type !== 'stitch') {
      out.push(c);
      if (c.type === 'jump') prev = { x: c.x, y: c.y };
      continue;
    }
    const info = classifyDiagonal(c, prev, regions, darkStroke);
    if (info.suspicious) {
      removed++;
      converted++;
      out.push({ type: 'trim' });
      out.push({
        type: 'jump', x: c.x, y: c.y, color: c.color, layerType: c.layerType,
        regionId: c.regionId, stitchType: c.stitchType, source: c.source,
      });
      prev = { x: c.x, y: c.y };
      continue;
    }
    out.push(c);
    prev = { x: c.x, y: c.y };
  }
  report.visibleDiagonalStitchesRemoved = removed;
  report.convertedDiagonalToJump = converted;
  return out;
}

function classifyDiagonal(c, prev, regions, darkStroke) {
  if (!prev) return { suspicious: false };
  const dx = (c.x ?? 0) - prev.x, dy = (c.y ?? 0) - prev.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= 2.5) return { suspicious: false };
  if (dist > 8.0) return { suspicious: false }; // handled by splitUnsafeLongStitches
  let deg = Math.atan2(dy, dx) * 180 / Math.PI;
  deg = ((deg % 180) + 180) % 180;
  const isDiag = (deg >= 20 && deg <= 70) || (deg >= 110 && deg <= 160);
  if (!isDiag) return { suspicious: false };
  const rPrev = regionAt(prev.x, prev.y, regions);
  const rCur = regionAt(c.x ?? 0, c.y ?? 0, regions);
  const crosses = !rPrev || !rCur || rPrev.id !== rCur.id;
  const sameRegionFill = c.stitchType === 'fill' && rPrev && rCur && rPrev.id === rCur.id;
  if (!crosses || sameRegionFill) return { suspicious: false };
  const lt = String(c.layerType || '').toLowerCase();
  const isContour = lt.includes('outline') || lt.includes('contour') || lt.includes('detail') || lt.includes('facial');
  const isBlack = isDarkColor(c.color);
  const longConnector = dist > 6.0;
  if (!(isBlack || isContour || longConnector)) return { suspicious: false };
  if (isContour) {
    const sup = segmentDarkSupport(prev.x, prev.y, c.x ?? 0, c.y ?? 0, darkStroke);
    if (sup >= 0.5) return { suspicious: false };
  }
  return { suspicious: true, dist };
}

// ═══════════════════════════════════════════════════════════════════════════
//  FASE 3 — splitUnsafeLongStitches
// ═══════════════════════════════════════════════════════════════════════════
// Puntada > 8mm: con soporte de región/dark → dividir; sin soporte → trim+jump.
export function splitUnsafeLongStitches(commands, _objects, regions, report = {}) {
  const darkStroke = report?.darkStroke || null;
  const out = [];
  let split = 0, converted = 0;
  let prev = null;
  for (const c of commands) {
    if (c.type !== 'stitch') {
      out.push(c);
      if (c.type === 'jump') prev = { x: c.x, y: c.y };
      continue;
    }
    const d = prev ? Math.hypot((c.x ?? 0) - prev.x, (c.y ?? 0) - prev.y) : 0;
    if (d > MAX_STITCH_MM) {
      const rPrev = regionAt(prev.x, prev.y, regions);
      const rCur = regionAt(c.x ?? 0, c.y ?? 0, regions);
      const sameRegion = rPrev && rCur && rPrev.id === rCur.id;
      const darkSup = isDarkColor(c.color) || isContourLayer(c)
        ? segmentDarkSupport(prev.x, prev.y, c.x ?? 0, c.y ?? 0, darkStroke)
        : 0;
      if (sameRegion || darkSup >= 0.5) {
        // soporte → dividir en segmentos seguros
        const steps = Math.ceil(d / SPLIT_SEG_MM);
        for (let s = 1; s <= steps; s++) {
          out.push({ ...c, x: prev.x + (c.x - prev.x) * s / steps, y: prev.y + (c.y - prev.y) * s / steps });
        }
        split++;
      } else {
        // sin soporte → no coser la diagonal/línea larga
        out.push({ type: 'trim' });
        out.push({ type: 'jump', x: c.x, y: c.y, color: c.color, layerType: c.layerType, regionId: c.regionId, stitchType: c.stitchType, source: c.source });
        converted++;
      }
    } else {
      out.push(c);
    }
    prev = { x: c.x, y: c.y };
  }
  report.longStitchesSplit = split;
  report.longStitchesConvertedToJump = converted;
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
//  FASE 4 — removeDuplicateStitches
// ═══════════════════════════════════════════════════════════════════════════
// Compara stitches consecutivos dentro del mismo bloque. tol 0.1mm.
// Distingue duplicate_noise (mismo punto repetido) de intentional_double_run
// (a→b≈a reverso). Elimina ruido, preserva double-run.
export function removeDuplicateStitches(commands, _objects, _regions, report = {}) {
  const out = [];
  let detected = 0, removed = 0, doubleRunPreserved = 0;
  let prevStitch = null;
  for (let i = 0; i < commands.length; i++) {
    const c = commands[i];
    if (c.type !== 'stitch') { out.push(c); prevStitch = null; continue; }
    if (prevStitch) {
      const d = Math.hypot((c.x ?? 0) - prevStitch.x, (c.y ?? 0) - prevStitch.y);
      if (d < DUP_TOL_MM) {
        detected++;
        // ¿double-run? next stitch ≈ prevStitch (reverso a→b≈a)
        const next = nextStitch(commands, i + 1);
        if (next) {
          const dRev = Math.hypot(next.x - prevStitch.x, next.y - prevStitch.y);
          if (dRev < DUP_TOL_MM) {
            doubleRunPreserved++;
            out.push(c);
            prevStitch = c;
            continue;
          }
        }
        // duplicate noise → drop c
        removed++;
        continue;
      }
    }
    out.push(c);
    prevStitch = c;
  }
  report.duplicatesDetected = detected;
  report.duplicatesRemoved = removed;
  report.intentionalDoubleRunPreserved = doubleRunPreserved;
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
//  FASE 5 — mergeShortStitches
// ═══════════════════════════════════════════════════════════════════════════
// Fusiona puntadas <0.6mm dentro del mismo bloque manteniendo forma.
// Conserva esquinas marcadas y detalles importantes (boca/ojos/contornos).
export function mergeShortStitches(commands, _objects, _regions, report = {}) {
  const out = [];
  let merged = 0;
  for (let i = 0; i < commands.length; i++) {
    const c = commands[i];
    if (c.type !== 'stitch') { out.push(c); continue; }
    const prev = lastStitch(out);
    const next = nextStitch(commands, i + 1);
    if (!prev || !next) { out.push(c); continue; }
    const dPrev = Math.hypot((c.x ?? 0) - prev.x, (c.y ?? 0) - prev.y);
    if (dPrev >= SHORT_MERGE_MM) { out.push(c); continue; }
    if (isImportantDetail(c)) { out.push(c); continue; }
    const v1 = { x: c.x - prev.x, y: c.y - prev.y };
    const v2 = { x: next.x - c.x, y: next.y - c.y };
    const l1 = Math.hypot(v1.x, v1.y), l2 = Math.hypot(v2.x, v2.y);
    if (l1 < 1e-9 || l2 < 1e-9) { merged++; continue; } // punto duplicado
    const dot = (v1.x * v2.x + v1.y * v2.y) / (l1 * l2);
    const ang = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
    if (ang > 30) { out.push(c); continue; } // giro/esquina marcada → conservar
    merged++;
    // drop c (fusionar prev→next, colineal)
  }
  report.mergedShortStitches = merged;
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
//  FASE 6 — optimizeTrimsAndJumps
// ═══════════════════════════════════════════════════════════════════════════
// Colapsa saltos consecutivos, inserta trim antes de saltos >3.5mm, elimina
// trims redundantes y trims finales sin stitch posterior.
export function optimizeTrimsAndJumps(commands, _objects, _regions, report = {}) {
  const out = [];
  let prevX = 0, prevY = 0;
  let jumpsCollapsed = 0, trimsInserted = 0, redundantTrimsRemoved = 0;
  for (let i = 0; i < commands.length; i++) {
    const c = commands[i];
    if (c.type === 'jump') {
      let endX = c.x ?? 0, endY = c.y ?? 0, endIdx = i;
      while (endIdx + 1 < commands.length && commands[endIdx + 1].type === 'jump') {
        endIdx++; endX = commands[endIdx].x ?? 0; endY = commands[endIdx].y ?? 0;
      }
      const nJumps = endIdx - i + 1;
      const total = Math.hypot(endX - prevX, endY - prevY);
      const prevOut = out[out.length - 1];
      if (total > TRIM_JUMP_MM && prevOut && prevOut.type === 'stitch') {
        out.push({ type: 'trim', x: prevX, y: prevY, color: prevOut.color, regionId: prevOut.regionId });
        trimsInserted++;
      }
      if (total > MAX_JUMP_MM) {
        const steps = Math.ceil(total / MAX_JUMP_MM);
        for (let s = 1; s <= steps; s++) {
          out.push({ type: 'jump', x: prevX + (endX - prevX) * s / steps, y: prevY + (endY - prevY) * s / steps, color: c.color, regionId: c.regionId });
        }
        jumpsCollapsed += nJumps - steps;
      } else {
        out.push({ type: 'jump', x: endX, y: endY, color: c.color, regionId: c.regionId });
        jumpsCollapsed += nJumps - 1;
      }
      prevX = endX; prevY = endY;
      i = endIdx;
    } else if (c.type === 'trim') {
      const prevOut = out[out.length - 1];
      if (prevOut && prevOut.type === 'trim') { redundantTrimsRemoved++; continue; }
      out.push(c);
    } else {
      out.push(c);
      if (c.type === 'stitch') { prevX = c.x ?? 0; prevY = c.y ?? 0; }
    }
  }
  // trims finales sin stitch posterior → redundantes
  while (out.length && out[out.length - 1].type === 'trim') {
    out.pop();
    redundantTrimsRemoved++;
  }
  report.jumpsCollapsed = jumpsCollapsed;
  report.trimsInserted = trimsInserted;
  report.redundantTrimsRemoved = redundantTrimsRemoved;
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
//  FASE 7 — addTieInTieOff (siempre al final)
// ═══════════════════════════════════════════════════════════════════════════
// Añade tie-in/tie-off SOLO a bloques reales consolidados (>=8 stitches).
// Marca hasTieIn/hasTieOff/tieApplied en los comandos para que el detector
// los reconozca. Las tie stitches llevan isTie=true (no se cuentan como short).
export function addTieInTieOff(commands, _objects, _regions, report = {}) {
  const out = [];
  let tieInAdded = 0, tieOffAdded = 0, blocksTied = 0, blocksSkipped = 0;
  let block = [];

  const flush = () => {
    if (block.length === 0) return;
    if (block.length < MIN_BLOCK_FOR_TIE) {
      out.push(...block);
      blocksSkipped++;
      block = [];
      return;
    }
    const first = block[0];
    const last = block[block.length - 1];
    // tie-in: 2 stitches cortas hacia first (retrocediendo desde un punto previo)
    const prevNon = out[out.length - 1];
    const originX = prevNon && Number.isFinite(prevNon.x) ? prevNon.x : first.x;
    const originY = prevNon && Number.isFinite(prevNon.y) ? prevNon.y : first.y;
    for (let k = 1; k <= TIE_COUNT; k++) {
      const t = k / (TIE_COUNT + 1);
      out.push({
        type: 'stitch',
        x: first.x + (originX - first.x) * t * 0.3,
        y: first.y + (originY - first.y) * t * 0.3,
        color: first.color, layerType: first.layerType, regionId: first.regionId,
        stitchType: first.stitchType, isTie: true, tieKind: 'tieIn',
      });
      tieInAdded++;
    }
    // marcar primer stitch del bloque
    first.hasTieIn = true;
    out.push(...block);
    // tie-off: 2 stitches cortas tras last
    for (let k = 1; k <= TIE_COUNT; k++) {
      const t = k / (TIE_COUNT + 1);
      out.push({
        type: 'stitch',
        x: last.x + (last.x - (block[block.length - 2]?.x ?? last.x)) * t * 0.3,
        y: last.y + (last.y - (block[block.length - 2]?.y ?? last.y)) * t * 0.3,
        color: last.color, layerType: last.layerType, regionId: last.regionId,
        stitchType: last.stitchType, isTie: true, tieKind: 'tieOff',
      });
      tieOffAdded++;
    }
    last.hasTieOff = true;
    blocksTied++;
    block = [];
  };

  for (const c of commands) {
    if (c.type !== 'stitch') { flush(); out.push(c); continue; }
    block.push(c);
  }
  flush();
  report.tieInAdded = tieInAdded;
  report.tieOffAdded = tieOffAdded;
  report.blocksTied = blocksTied;
  report.blocksSkipped = blocksSkipped;
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
//  FASE 8 — reduceColorChangesIfSafe
// ═══════════════════════════════════════════════════════════════════════════
function hexToLab(hex) {
  const h = (hex || '#000000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
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
function labDist(a, b) {
  const la = hexToLab(a), lb = hexToLab(b);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

export function reduceColorChangesIfSafe(commands, _objects, _regions, report = {}) {
  const colors = [];
  for (const c of commands) if (c.color && !colors.includes(c.color.toLowerCase())) colors.push(c.color.toLowerCase());
  if (colors.length <= 6) { report.colorsMerged = 0; report.redundantColorChangesRemoved = 0; return commands; }
  const preserve = new Set(colors.filter(c => isDarkColor(c)));
  const remap = new Map();
  const targets = [];
  for (const c of colors) {
    if (preserve.has(c)) { remap.set(c, c); targets.push(c); continue; }
    let best = null, bestD = Infinity;
    for (const t of targets) {
      if (preserve.has(t)) continue;
      const d = labDist(c, t);
      if (d < bestD) { bestD = d; best = t; }
    }
    if (best && bestD < 12) remap.set(c, best);
    else { remap.set(c, c); targets.push(c); }
  }
  let merged = 0;
  const out = commands.map(c => {
    if (!c.color) return c;
    const nc = remap.get(c.color.toLowerCase());
    if (nc && nc !== c.color.toLowerCase()) { merged++; return { ...c, color: nc }; }
    return c;
  });
  // eliminar colorChanges redundantes (mismo color que el anterior)
  const cleaned = [];
  let lastColor = null;
  let redundantCC = 0;
  for (const c of out) {
    if (c.type === 'colorChange') {
      if (c.color && c.color.toLowerCase() === lastColor) { redundantCC++; continue; }
    }
    if (c.color) lastColor = c.color.toLowerCase();
    cleaned.push(c);
  }
  report.colorsMerged = merged;
  report.redundantColorChangesRemoved = redundantCC;
  return cleaned;
}

// ── simplifyTinyObjects (auxiliar, no en orden principal v2) ──────────────────
export function simplifyTinyObjects(commands, _regions, report = {}) {
  const byRegion = new Map();
  for (let i = 0; i < commands.length; i++) {
    const c = commands[i];
    if (c.type !== 'stitch') continue;
    const rid = c.regionId || '_none';
    if (!byRegion.has(rid)) byRegion.set(rid, []);
    byRegion.get(rid).push(i);
  }
  const dropIdx = new Set();
  let removedNoise = 0, convertedToRun = 0;
  for (const [rid, idxs] of byRegion) {
    if (idxs.length >= TINY_OBJECT_STITCHES) continue;
    const sample = commands[idxs[0]];
    if (isImportantDetail(sample)) {
      convertedToRun++;
    } else {
      for (const i of idxs) dropIdx.add(i);
      removedNoise++;
    }
  }
  if (dropIdx.size === 0) { report.tinyNoiseRemoved = 0; report.tinyConvertedToRun = convertedToRun; return commands; }
  const out = commands.filter((_, i) => !dropIdx.has(i));
  report.tinyNoiseRemoved = removedNoise;
  report.tinyConvertedToRun = convertedToRun;
  return out;
}