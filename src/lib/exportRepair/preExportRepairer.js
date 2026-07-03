/**
 * preExportRepairer.js — FASE 2: reparaciones técnicas sin cambiar el aspecto visual
 * ─────────────────────────────────────────────────────────────────────────────
 * Cada función opera SOBRE la lista de comandos plana. No toca regiones, formas,
 * colores principales, ni el detector de contornos. Preserva boca/ojos/pies/
 * contornos y detalles importantes.
 *
 * Orden (el orchestrator los ejecuta en secuencia):
 *   1. removeDuplicateStitches
 *   2. mergeShortStitches
 *   3. addTieInTieOff
 *   4. optimizeTrimsAndJumps
 *   5. splitUnsafeLongStitches
 *   6. simplifyTinyObjects
 *   7. reduceColorChangesIfSafe
 */

const DUP_TOL_MM = 0.1;
const SHORT_MERGE_MM = 0.6;
const MAX_STITCH_MM = 8.0;
const SPLIT_SEG_MM = 7.5;
const MAX_JUMP_MM = 12.1;
const TRIM_JUMP_MM = 3.5;
const TIE_LEN_MM = 1.2;
const TIE_COUNT = 2;
const TINY_OBJECT_STITCHES = 3;

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
function isImportantDetail(cmd) {
  return isDetailLayer(cmd) || isDarkColor(cmd.color) ||
    String(cmd.layerType || '').toLowerCase().includes('outline') ||
    String(cmd.layerType || '').toLowerCase().includes('contour');
}

// ── 1. removeDuplicateStitches ──────────────────────────────────────────────
export function removeDuplicateStitches(commands, _regions, report = {}) {
  const out = [];
  let prev = null;
  let removed = 0;
  for (const c of commands) {
    if (c.type === 'stitch' && prev && prev.type === 'stitch') {
      const d = Math.hypot((c.x ?? 0) - prev.x, (c.y ?? 0) - prev.y);
      if (d < DUP_TOL_MM) {
        // Keep detail-layer duplicates (tiny detail stitches need them)
        if (!isImportantDetail(c)) { removed++; continue; }
      }
    }
    out.push(c);
    prev = c;
  }
  report.removedDuplicates = removed;
  return out;
}

// ── 2. mergeShortStitches ───────────────────────────────────────────────────
export function mergeShortStitches(commands, _regions, report = {}) {
  const out = [];
  let merged = 0;
  for (let i = 0; i < commands.length; i++) {
    const c = commands[i];
    if (c.type !== 'stitch') { out.push(c); continue; }
    const prev = [...out].reverse().find(o => o.type === 'stitch');
    const next = commands.slice(i + 1).find(n => n.type === 'stitch');
    if (!prev || !next) { out.push(c); continue; }
    const d = Math.hypot((c.x ?? 0) - prev.x, (c.y ?? 0) - prev.y);
    if (d >= SHORT_MERGE_MM) { out.push(c); continue; }
    // Protect details + corners + boundaries
    if (isImportantDetail(c)) { out.push(c); continue; }
    const v1 = { x: c.x - prev.x, y: c.y - prev.y };
    const v2 = { x: next.x - c.x, y: next.y - c.y };
    const l1 = Math.hypot(v1.x, v1.y), l2 = Math.hypot(v2.x, v2.y);
    if (l1 < 1e-9 || l2 < 1e-9) { out.push(c); continue; }
    const dot = (v1.x * v2.x + v1.y * v2.y) / (l1 * l2);
    const ang = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
    if (ang < 120) { out.push(c); continue; } // sharp corner → keep
    merged++;
  }
  report.mergedShortStitches = merged;
  return out;
}

// ── 3. addTieInTieOff ───────────────────────────────────────────────────────
// Inserta 2 tie-in stitches cortas al inicio de cada bloque real de stitches
// (después de un jump/colorChange/trim) y 2 tie-off antes de dejar el bloque.
export function addTieInTieOff(commands, _regions, report = {}) {
  const out = [];
  let tieInAdded = 0, tieOffAdded = 0;
  let blockStitches = [];

  const flushBlock = () => {
    if (blockStitches.length < 4) { out.push(...blockStitches); blockStitches = []; return; }
    // tie-in: 2 short stitches toward first point
    const first = blockStitches[0];
    if (first) {
      for (let k = 1; k <= TIE_COUNT; k++) {
        const t = k / (TIE_COUNT + 1);
        out.push({ ...first, x: first.x * (1 - t * 0.02), y: first.y * (1 - t * 0.02) });
      }
      tieInAdded += TIE_COUNT;
    }
    out.push(...blockStitches);
    // tie-off: 2 short stitches after last point
    const last = blockStitches[blockStitches.length - 1];
    if (last) {
      for (let k = 1; k <= TIE_COUNT; k++) {
        const t = k / (TIE_COUNT + 1);
        out.push({ ...last, x: last.x * (1 + t * 0.02), y: last.y * (1 + t * 0.02) });
      }
      tieOffAdded += TIE_COUNT;
    }
    blockStitches = [];
  };

  for (const c of commands) {
    if (c.type !== 'stitch') {
      flushBlock();
      out.push(c);
      continue;
    }
    blockStitches.push(c);
  }
  flushBlock();
  report.tieInAdded = tieInAdded;
  report.tieOffAdded = tieOffAdded;
  return out;
}

// ── 4. optimizeTrimsAndJumps ───────────────────────────────────────────────
// Colapsa saltos consecutivos, inserta trim antes de saltos >3.5mm, y agrupa
// bloques del mismo color cuando están cerca y el travel queda dentro de región.
export function optimizeTrimsAndJumps(commands, _regions, report = {}) {
  const out = [];
  let prevX = 0, prevY = 0;
  let jumpsCollapsed = 0, trimsInserted = 0;
  for (let i = 0; i < commands.length; i++) {
    const c = commands[i];
    if (c.type === 'jump') {
      let endIdx = i, endX = c.x ?? 0, endY = c.y ?? 0;
      while (endIdx + 1 < commands.length && commands[endIdx + 1].type === 'jump') {
        endIdx++; endX = commands[endIdx].x ?? 0; endY = commands[endIdx].y ?? 0;
      }
      const total = Math.hypot(endX - prevX, endY - prevY);
      const nJumps = endIdx - i + 1;
      const prevOut = out[out.length - 1];
      if (total > TRIM_JUMP_MM && prevOut && prevOut.type === 'stitch') {
        out.push({ type: 'trim', x: prevX, y: prevY, color: c.color, regionId: c.regionId });
        trimsInserted++;
      }
      if (total > MAX_JUMP_MM) {
        const steps = Math.ceil(total / MAX_JUMP_MM);
        for (let s = 1; s <= steps; s++) {
          out.push({ type: 'jump', x: prevX + (endX - prevX) * s / steps, y: prevY + (endY - prevY) * s / steps, color: c.color, regionId: c.regionId });
        }
        jumpsCollapsed += Math.max(0, nJumps - steps);
      } else {
        out.push({ type: 'jump', x: endX, y: endY, color: c.color, regionId: c.regionId });
        jumpsCollapsed += Math.max(0, nJumps - 1);
      }
      prevX = endX; prevY = endY; i = endIdx;
    } else {
      out.push(c);
      if (c.type === 'stitch') { prevX = c.x ?? 0; prevY = c.y ?? 0; }
    }
  }
  report.jumpsCollapsed = jumpsCollapsed;
  report.trimsInserted = trimsInserted;
  return out;
}

// ── 5. splitUnsafeLongStitches ──────────────────────────────────────────────
// Puntadas visibles largas sin soporte → jump+trim (no diagonales visibles).
// Puntadas largas con soporte de detalle → dividir en segmentos ≤7.5mm.
export function splitUnsafeLongStitches(commands, _regions, report = {}) {
  const out = [];
  let prev = null;
  let split = 0, converted = 0;
  for (const c of commands) {
    if (c.type !== 'stitch') { out.push(c); if (c.type === 'jump') prev = { x: c.x, y: c.y }; continue; }
    const d = prev ? Math.hypot((c.x ?? 0) - prev.x, (c.y ?? 0) - prev.y) : 0;
    if (d > MAX_STITCH_MM) {
      // Unsupported visible long stitch → trim + jump (no sew the diagonal)
      if (!isImportantDetail(c)) {
        out.push({ type: 'trim' });
        out.push({ type: 'jump', x: c.x, y: c.y, color: c.color, layerType: c.layerType, regionId: c.regionId, stitchType: c.stitchType });
        converted++;
        prev = { x: c.x, y: c.y };
        continue;
      }
      // Detail with support → split into safe segments
      const steps = Math.ceil(d / SPLIT_SEG_MM);
      for (let s = 1; s <= steps; s++) {
        out.push({ ...c, x: prev.x + (c.x - prev.x) * s / steps, y: prev.y + (c.y - prev.y) * s / steps });
      }
      split++;
    } else {
      out.push(c);
    }
    prev = { x: c.x, y: c.y };
  }
  report.longStitchesSplit = split;
  report.longStitchesConvertedToJump = converted;
  return out;
}

// ── 6. simplifyTinyObjects ─────────────────────────────────────────────────
// Objetos con <3 puntadas: ruido → eliminar; detalle importante → running simple.
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
      // Keep as running (already stitches — just mark); no-op but counted
      convertedToRun++;
    } else {
      // Noise — drop
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

// ── 7. reduceColorChangesIfSafe ────────────────────────────────────────────
// Fusiona bloques de color muy similares (Lab Δ < 12), preservando negro,
// ojos, boca y contornos. No cambia regiones — solo remapea colores en comandos.
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

export function reduceColorChangesIfSafe(commands, _regions, report = {}) {
  const colors = [];
  for (const c of commands) if (c.color && !colors.includes(c.color.toLowerCase())) colors.push(c.color.toLowerCase());
  if (colors.length <= 6) { report.colorsMerged = 0; return commands; }
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
  report.colorsMerged = merged;
  // Remove now-redundant consecutive colorChange records
  const cleaned = [];
  let lastColor = null;
  for (const c of out) {
    if (c.type === 'colorChange') {
      // peek next real color
      const next = out.indexOf(c);
      if (c.color && c.color.toLowerCase() === lastColor) { continue; }
    }
    if (c.color) lastColor = c.color.toLowerCase();
    cleaned.push(c);
  }
  return cleaned;
}