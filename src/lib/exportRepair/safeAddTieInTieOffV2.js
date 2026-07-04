/**
 * safeAddTieInTieOffV2.js — Tie-in/tie-off seguro (experimental, V2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Versión segura del addTieInTieOff. NO usa prevNon como origen. Calcula los
 * ties desde la dirección interna del propio bloque (first→second y last→prev).
 *
 * Reglas obligatorias (ver SAFE_TIE_V2_EXPERIMENT_REPORT):
 *  1. Trabaja por bloques reales (stitches consecutivos, mismo color/región, ≥ MIN_BLOCK_FOR_TIE).
 *  2. Tie-in: dir = unit(second - first); tieIn1 = first + dir*0.3; tieIn2 = first + dir*0.4.
 *  3. Tie-off: dirBack = unit(prev - last); tieOff1 = last + dirBack*0.3; tieOff2 = last + dirBack*0.4.
 *  4. Cada tie a ≤ 0.45mm del stitch real más cercano — si no, skip block.
 *  5. No cruzar regiones: tie.regionId/color/stitchType = bloque.
 *  6. No crear visibleDiagonalStitches: ventana local (prev5 + ties + next5).
 *  7. No crear unsupportedLongStitches: distancias locales ≤ 8mm.
 *  8. No crear emptyBlocks: solo añade stitches tie (sin colorChange/jump/trim).
 *  9. Marcas: isTie:true, tieKind:'safeTieIn'|'safeTieOff', generatedBy.
 *     first.hasTieIn = true; last.hasTieOff = true.
 * 10. Report con métricas before/after y motivos de skip.
 *
 * NO reemplaza addTieInTieOff del pipeline V5.1. Modo experimental: solo informe.
 */
import { detectVisibleDiagonalStitches } from './visibleDiagonalDetector';

const TIE_IN_1_MM = 0.3;
const TIE_IN_2_MM = 0.4;
const TIE_OFF_1_MM = 0.3;
const TIE_OFF_2_MM = 0.4;
const MAX_TIE_DIST_MM = 0.45;        // tie a ≤ esto del stitch real más cercano
const MAX_LOCAL_LONG_ST_MM = 8.0;    // > esto = unsupportedLongStitch
const MIN_BLOCK_FOR_TIE = 8;         // bloques < esto se skip
const WINDOW_PREV = 5;
const WINDOW_NEXT = 5;

// ── helpers ──────────────────────────────────────────────────────────────────
function isImportantDetail(cmd) {
  const lt = String(cmd?.layerType || '').toLowerCase();
  const rc = String(cmd?.region_class || '').toLowerCase();
  return lt.includes('mouth') || lt.includes('eye') || lt.includes('facial') ||
    lt.includes('detail') || lt.includes('outline') || lt.includes('contour') ||
    rc.includes('detail') || rc.includes('mouth') || rc.includes('eye') ||
    rc.includes('outline') || rc.includes('contour');
}

function unit(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  return { x: dx / len, y: dy / len };
}

function regionAt(x, y, regions) {
  if (!regions || !regions.length) return null;
  const NORM_W = 100, NORM_H = 100;
  const nx = (x / NORM_W + 0.5), ny = (y / NORM_H + 0.5);
  for (const r of regions) {
    const pp = r.path_points;
    if (!pp || pp.length < 3) continue;
    let inside = false;
    for (let i = 0, j = pp.length - 1; i < pp.length; j = i++) {
      const xi = pp[i][0], yi = pp[i][1], xj = pp[j][0], yj = pp[j][1];
      const intersect = ((yi > ny) !== (yj > ny)) && (nx < (xj - xi) * (ny - yi) / ((yj - yi) || 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    if (inside) return r;
  }
  return null;
}

// ── Medir longSt y visibleDiag en una ventana local ──────────────────────────
function localMaxStitchLen(cmds) {
  let maxD = 0;
  let prev = null;
  for (const c of cmds) {
    if (c.type === 'stitch') {
      if (prev) {
        const d = Math.hypot((c.x ?? 0) - prev.x, (c.y ?? 0) - prev.y);
        if (d > maxD) maxD = d;
      }
      prev = c;
    } else if (c.type === 'jump') {
      prev = { x: c.x ?? 0, y: c.y ?? 0 };
    }
  }
  return maxD;
}

function localVisibleDiag(cmds, objects, regions, darkStroke, config) {
  try {
    const det = detectVisibleDiagonalStitches(cmds, objects, regions, darkStroke, config || {});
    return det.count || 0;
  } catch {
    return 0;
  }
}

// ── Medir missingTie en comandos (mismo criterio que exportErrorDetector) ─────
function countMissingTie(cmds) {
  const regionGroups = new Map();
  for (let i = 0; i < cmds.length; i++) {
    const c = cmds[i];
    if (c.type !== 'stitch') continue;
    const rid = c.regionId || 'unknown';
    if (!regionGroups.has(rid)) regionGroups.set(rid, { first: i, last: i, count: 1, color: c.color });
    else { regionGroups.get(rid).last = i; regionGroups.get(rid).count++; }
  }
  let noTieIn = 0, noTieOff = 0;
  for (const [, g] of regionGroups) {
    if (g.count < 4) continue;
    const firstCmd = cmds[g.first];
    const lastCmd = cmds[g.last];
    if (!firstCmd || (!firstCmd.hasTieIn && !firstCmd.isTie)) noTieIn++;
    if (!lastCmd || (!lastCmd.hasTieOff && !lastCmd.isTie)) noTieOff++;
  }
  return { missingTieIn: noTieIn, missingTieOff: noTieOff };
}

/**
 * safeAddTieInTieOffV2 — experimental, no modifica el pipeline V5.1.
 * Devuelve { commands, report } donde commands solo se usan si todas las
 * invariantes se mantienen (experimentAccepted).
 */
export function safeAddTieInTieOffV2(commands, objects = [], regions = [], config = {}, darkStroke = null, report = {}) {
  const cmds = commands || [];
  const out = [];
  let safeTieInAdded = 0, safeTieOffAdded = 0;
  let safeBlocksTied = 0, safeBlocksSkipped = 0;
  let skippedBecauseTooSmall = 0;
  let skippedBecauseZeroDirection = 0;
  let skippedBecauseCreatesVisibleDiagonal = 0;
  let skippedBecauseCreatesLongStitch = 0;
  let skippedBecauseRegionMismatch = 0;
  let skippedBecauseImportantDetail = 0;

  const beforeMissingTie = countMissingTie(cmds);

  // ── parsear bloques: runs de stitches consecutivos del mismo color+región ──
  const blocks = [];
  let cur = [];
  const flush = (sep) => {
    if (cur.length) blocks.push({ stitches: cur, sep });
    else if (sep) blocks.push({ sep });
    cur = [];
  };
  for (const c of cmds) {
    if (c.type === 'stitch') {
      cur.push(c);
    } else {
      flush(c);
    }
  }
  flush(null);

  // ── aplicar ties bloque a bloque ──
  for (let bi = 0; bi < blocks.length; bi++) {
    const b = blocks[bi];
    if (b.sep) { out.push(b.sep); continue; }
    const st = b.stitches;
    if (st.length < MIN_BLOCK_FOR_TIE) {
      skippedBecauseTooSmall++;
      safeBlocksSkipped++;
      for (const s of st) out.push(s);
      continue;
    }
    // bloque protegido (detail/contour/mouth/eye) — skip si no se puede verificar
    const sample = st[0];
    if (isImportantDetail(sample)) {
      skippedBecauseImportantDetail++;
      safeBlocksSkipped++;
      for (const s of st) out.push(s);
      continue;
    }

    const first = st[0];
    const second = st[1];
    const last = st[st.length - 1];
    const prev = st[st.length - 2];

    // ── dirección interna tie-in (first → second) ──
    const dirIn = unit(first.x, first.y, second.x, second.y);
    if (!dirIn) {
      skippedBecauseZeroDirection++;
      safeBlocksSkipped++;
      for (const s of st) out.push(s);
      continue;
    }
    // ── dirección interna tie-off (last → prev) ──
    const dirBack = unit(last.x, last.y, prev.x, prev.y);
    if (!dirBack) {
      skippedBecauseZeroDirection++;
      safeBlocksSkipped++;
      for (const s of st) out.push(s);
      continue;
    }

    // ── coordenadas tie ──
    const tieIn1 = { x: first.x + dirIn.x * TIE_IN_1_MM, y: first.y + dirIn.y * TIE_IN_1_MM };
    const tieIn2 = { x: first.x + dirIn.x * TIE_IN_2_MM, y: first.y + dirIn.y * TIE_IN_2_MM };
    const tieOff1 = { x: last.x + dirBack.x * TIE_OFF_1_MM, y: last.y + dirBack.y * TIE_OFF_1_MM };
    const tieOff2 = { x: last.x + dirBack.x * TIE_OFF_2_MM, y: last.y + dirBack.y * TIE_OFF_2_MM };

    // ── regla 4: cada tie ≤ 0.45mm del stitch real más cercano ──
    const nearestStitchDist = (tx, ty) => {
      let min = Infinity;
      for (const s of st) {
        const d = Math.hypot(tx - s.x, ty - s.y);
        if (d < min) min = d;
      }
      return min;
    };
    if (nearestStitchDist(tieIn1.x, tieIn1.y) > MAX_TIE_DIST_MM ||
        nearestStitchDist(tieIn2.x, tieIn2.y) > MAX_TIE_DIST_MM ||
        nearestStitchDist(tieOff1.x, tieOff1.y) > MAX_TIE_DIST_MM ||
        nearestStitchDist(tieOff2.x, tieOff2.y) > MAX_TIE_DIST_MM) {
      // tie demasiado lejos — skip
      skippedBecauseZeroDirection++; // no es dirección, pero es distancia insegura
      safeBlocksSkipped++;
      for (const s of st) out.push(s);
      continue;
    }

    // ── regla 5: no cruzar regiones ──
    const firstRegion = regionAt(first.x, first.y, regions);
    let regionMismatch = false;
    if (firstRegion) {
      const rIn1 = regionAt(tieIn1.x, tieIn1.y, regions);
      const rIn2 = regionAt(tieIn2.x, tieIn2.y, regions);
      const rOff1 = regionAt(tieOff1.x, tieOff1.y, regions);
      const rOff2 = regionAt(tieOff2.x, tieOff2.y, regions);
      if (rIn1 && rIn1 !== firstRegion) regionMismatch = true;
      if (rIn2 && rIn2 !== firstRegion) regionMismatch = true;
      const lastRegion = regionAt(last.x, last.y, regions);
      if (rOff1 && lastRegion && rOff1 !== lastRegion) regionMismatch = true;
      if (rOff2 && lastRegion && rOff2 !== lastRegion) regionMismatch = true;
    }
    if (regionMismatch) {
      skippedBecauseRegionMismatch++;
      safeBlocksSkipped++;
      for (const s of st) out.push(s);
      continue;
    }

    // ── construir bloque con ties insertados ──
    const blockWithTies = [];
    blockWithTies.push({
      type: 'stitch', x: tieIn1.x, y: tieIn1.y, color: first.color,
      layerType: first.layerType, regionId: first.regionId, stitchType: first.stitchType,
      isTie: true, tieKind: 'safeTieIn', generatedBy: 'safeAddTieInTieOffV2',
    });
    blockWithTies.push({
      type: 'stitch', x: tieIn2.x, y: tieIn2.y, color: first.color,
      layerType: first.layerType, regionId: first.regionId, stitchType: first.stitchType,
      isTie: true, tieKind: 'safeTieIn', generatedBy: 'safeAddTieInTieOffV2',
    });
    const firstMarked = { ...first, hasTieIn: true };
    blockWithTies.push(firstMarked);
    for (let k = 1; k < st.length - 1; k++) blockWithTies.push(st[k]);
    const lastMarked = { ...last, hasTieOff: true };
    blockWithTies.push(lastMarked);
    blockWithTies.push({
      type: 'stitch', x: tieOff1.x, y: tieOff1.y, color: last.color,
      layerType: last.layerType, regionId: last.regionId, stitchType: last.stitchType,
      isTie: true, tieKind: 'safeTieOff', generatedBy: 'safeAddTieInTieOffV2',
    });
    blockWithTies.push({
      type: 'stitch', x: tieOff2.x, y: tieOff2.y, color: last.color,
      layerType: last.layerType, regionId: last.regionId, stitchType: last.stitchType,
      isTie: true, tieKind: 'safeTieOff', generatedBy: 'safeAddTieInTieOffV2',
    });

    // ── ventana local: prev5 + ties + next5 ──
    const prevWindow = [];
    for (let k = out.length - 1; k >= 0 && prevWindow.length < WINDOW_PREV; k--) {
      prevWindow.unshift(out[k]);
    }
    const nextWindow = [];
    let nbi = bi + 1;
    while (nextWindow.length < WINDOW_NEXT && nbi < blocks.length) {
      const nb = blocks[nbi];
      if (nb.sep) { if (nb.sep.type === 'stitch') nextWindow.push(nb.sep); break; }
      else for (const s of nb.stitches) { nextWindow.push(s); if (nextWindow.length >= WINDOW_NEXT) break; }
      nbi++;
    }
    const localCmds = [...prevWindow, ...blockWithTies, ...nextWindow];

    // ── regla 7: no crear unsupportedLongStitches ──
    const maxLocalD = localMaxStitchLen(localCmds);
    if (maxLocalD > MAX_LOCAL_LONG_ST_MM) {
      skippedBecauseCreatesLongStitch++;
      safeBlocksSkipped++;
      for (const s of st) out.push(s);
      continue;
    }

    // ── regla 6: no crear visibleDiagonalStitches ──
    const localVD = localVisibleDiag(localCmds, objects, regions, darkStroke, config);
    // comparar contra ventana sin ties
    const localWithoutTies = [...prevWindow, ...st, ...nextWindow];
    const baselineVD = localVisibleDiag(localWithoutTies, objects, regions, darkStroke, config);
    if (localVD > baselineVD) {
      skippedBecauseCreatesVisibleDiagonal++;
      safeBlocksSkipped++;
      for (const s of st) out.push(s);
      continue;
    }

    // ── aceptar bloque con ties ──
    safeTieInAdded += 2;
    safeTieOffAdded += 2;
    safeBlocksTied++;
    for (const cmd of blockWithTies) out.push(cmd);
  }

  const afterMissingTie = countMissingTie(out);

  report.safeTieInAdded = safeTieInAdded;
  report.safeTieOffAdded = safeTieOffAdded;
  report.safeBlocksTied = safeBlocksTied;
  report.safeBlocksSkipped = safeBlocksSkipped;
  report.skippedBecauseTooSmall = skippedBecauseTooSmall;
  report.skippedBecauseZeroDirection = skippedBecauseZeroDirection;
  report.skippedBecauseCreatesVisibleDiagonal = skippedBecauseCreatesVisibleDiagonal;
  report.skippedBecauseCreatesLongStitch = skippedBecauseCreatesLongStitch;
  report.skippedBecauseRegionMismatch = skippedBecauseRegionMismatch;
  report.skippedBecauseImportantDetail = skippedBecauseImportantDetail;
  report.beforeMissingTieIn = beforeMissingTie.missingTieIn;
  report.beforeMissingTieOff = beforeMissingTie.missingTieOff;
  report.afterMissingTieIn = afterMissingTie.missingTieIn;
  report.afterMissingTieOff = afterMissingTie.missingTieOff;

  return { commands: out, report };
}