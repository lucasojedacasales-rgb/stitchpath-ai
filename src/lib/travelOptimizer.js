/**
 * travelOptimizer.js — FASE 7: Optimización de recorrido TSP completa
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Resuelve el recorrido de bordado como un Travelling Salesman Problem con
 * restricciones de orden lógico (fills → satins → running), minimizando:
 *   • Saltos (jumps)
 *   • Cortes de hilo (trims)
 *   • Cambios de color
 *   • Tiempo total de máquina
 *
 * Pipeline de optimización:
 *   1. Segmentación en bandas de tipo (fill / satin / running) — orden inmutable
 *   2. Partición por color dentro de cada banda
 *   3. Greedy nearest-neighbor inicial (O(n²)) con entry/exit points reales
 *   4. 2-opt dentro de cada bloque color×banda (mejora de rutas)
 *   5. Or-opt(1) cross-color: reubica regiones solitarias si reduces coste global
 *   6. Color-block chaining: ordena los bloques de color por cercanía de salida
 *   7. Cálculo de métricas y ahorro vs. secuencia original
 *
 * Modelo de coste (normalizado a mm):
 *   cost(a→b) = jumpMm
 *             + TRIM_PENALTY   si jumpMm > TRIM_THRESHOLD_MM
 *             + COLOR_PENALTY  si color distinto
 *
 * La función respeta estrictamente el orden lógico de capa:
 *   todos los fills primero → todos los satins → todos los running stitches
 */

// ─── Constantes de coste ──────────────────────────────────────────────────────

const TRIM_THRESHOLD_MM = 9.0;   // saltos > 9mm fuerzan un corte de hilo
const TRIM_PENALTY      = 25.0;  // mm equivalentes de penalización por corte
const COLOR_PENALTY     = 40.0;  // mm equivalentes de penalización por cambio de color
const DESIGN_NORM       = 100.0; // escala nominal en mm para coordenadas normalizadas [0,1]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCentroid(region) {
  if (region.centroid) return region.centroid;
  const pts = region.path_points;
  if (!pts || pts.length === 0) return [0.5, 0.5];
  return [
    pts.reduce((s, p) => s + p[0], 0) / pts.length,
    pts.reduce((s, p) => s + p[1], 0) / pts.length,
  ];
}

/** Punto de entrada de una región: vértice del polígono más cercano a `from`. */
function getEntryPoint(region, from) {
  const pts = region.entry_point ? [region.entry_point] : (region.path_points || []);
  if (pts.length === 0) return getCentroid(region);
  let best = pts[0], bestD = Infinity;
  for (const pt of pts) {
    const d = distNorm(pt, from);
    if (d < bestD) { bestD = d; best = pt; }
  }
  return best;
}

/** Punto de salida: vértice más lejano del punto de entrada. */
function getExitPoint(region, entry) {
  const pts = region.exit_point ? [region.exit_point] : (region.path_points || []);
  if (pts.length === 0) return getCentroid(region);
  let best = pts[0], bestD = -Infinity;
  for (const pt of pts) {
    const d = distNorm(pt, entry);
    if (d > bestD) { bestD = d; best = pt; }
  }
  return best;
}

/** Distancia euclídea entre dos puntos normalizados [0,1] → mm. */
function distNorm(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) * DESIGN_NORM;
}

/**
 * Coste de transición entre la salida de `a` y la entrada de `b`.
 * Incluye penalizaciones por corte y cambio de color.
 */
function edgeCost(exitA, regionB, fromPos, prevColor) {
  const entry = getEntryPoint(regionB, fromPos);
  const jumpMm = distNorm(fromPos, entry);
  const trim    = jumpMm > TRIM_THRESHOLD_MM ? TRIM_PENALTY : 0;
  const color   = (prevColor && regionB.color !== prevColor) ? COLOR_PENALTY : 0;
  return { cost: jumpMm + trim + color, jumpMm, trim, color, entry };
}

// ─── Banda lógica (orden inmutable de capas) ──────────────────────────────────

function getBand(region) {
  const t = region.stitch_type;
  if (t === 'fill')           return 0;
  if (t === 'satin')          return 1;
  return 2; // running_stitch
}

// ─── 1. Greedy nearest-neighbor con entry/exit points ─────────────────────────

function greedyNN(regions, startPos, startColor) {
  if (regions.length === 0) return [];
  const remaining = new Set(regions.map((_, i) => i));
  const ordered = [];
  let cursor = startPos;
  let color  = startColor;

  while (remaining.size > 0) {
    let bestIdx = -1, bestCost = Infinity, bestEntry = cursor, bestExit = cursor;

    for (const i of remaining) {
      const r = regions[i];
      const { cost, entry } = edgeCost(cursor, r, cursor, color);
      if (cost < bestCost) {
        bestCost  = cost;
        bestIdx   = i;
        bestEntry = entry;
        bestExit  = getExitPoint(r, entry);
      }
    }

    remaining.delete(bestIdx);
    const chosen = regions[bestIdx];
    ordered.push({ ...chosen, _entry: bestEntry, _exit: bestExit, _jumpCost: bestCost });
    cursor = bestExit;
    color  = chosen.color;
  }

  return ordered;
}

// ─── 2. 2-opt dentro de un bloque ─────────────────────────────────────────────

function twoOpt(route, startPos, startColor) {
  if (route.length < 4) return route;

  /** Coste total de una ruta desde una posición inicial. */
  function routeCost(r, sp, sc) {
    let cost = 0, pos = sp, col = sc;
    for (const reg of r) {
      const { cost: c, entry } = edgeCost(pos, reg, pos, col);
      const exit = getExitPoint(reg, entry);
      cost += c;
      pos = exit;
      col = reg.color;
    }
    return cost;
  }

  let best = [...route];
  let improved = true;
  let iterations = 0;
  const MAX_ITER = 60; // cap para diseños grandes

  while (improved && iterations++ < MAX_ITER) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 2; j < best.length; j++) {
        const candidate = [
          ...best.slice(0, i + 1),
          ...best.slice(i + 1, j + 1).reverse(),
          ...best.slice(j + 1),
        ];
        if (routeCost(candidate, startPos, startColor) < routeCost(best, startPos, startColor) - 0.01) {
          best = candidate;
          improved = true;
        }
      }
    }
  }
  return best;
}

// ─── 3. Or-opt(1): relocalización de nodos solitarios ─────────────────────────
/**
 * Intenta mover cada región a una posición distinta de su mismo bloque
 * si reduce el coste total. Sólo opera dentro de la misma banda.
 */
function orOpt1(route, startPos, startColor) {
  if (route.length < 4) return route;

  function totalCost(r) {
    let cost = 0, pos = startPos, col = startColor;
    for (const reg of r) {
      const { cost: c, entry } = edgeCost(pos, reg, pos, col);
      cost += c;
      pos = getExitPoint(reg, entry);
      col = reg.color;
    }
    return cost;
  }

  let best = [...route];
  let improved = true;
  let pass = 0;
  while (improved && pass++ < 3) {
    improved = false;
    for (let i = 0; i < best.length; i++) {
      const node = best[i];
      const without = [...best.slice(0, i), ...best.slice(i + 1)];
      const baseCost = totalCost(without);

      for (let j = 0; j <= without.length; j++) {
        const candidate = [...without.slice(0, j), node, ...without.slice(j)];
        if (totalCost(candidate) < baseCost + totalCost([node]) - 0.5) {
          best = candidate;
          improved = true;
          break;
        }
      }
    }
  }
  return best;
}

// ─── 4. Ordenar bloques de color por cercanía de salida ───────────────────────

function chainColorBlocks(blocks, startPos, startColor) {
  if (blocks.length <= 1) return blocks;

  const remaining = new Set(blocks.map((_, i) => i));
  const ordered = [];
  let cursor = startPos;
  let color  = startColor;

  while (remaining.size > 0) {
    let bestIdx = -1, bestCost = Infinity;

    for (const i of remaining) {
      const block = blocks[i];
      if (!block.length) { remaining.delete(i); continue; }
      const first = block[0];
      const { cost } = edgeCost(cursor, first, cursor, color);
      if (cost < bestCost) { bestCost = cost; bestIdx = i; }
    }

    if (bestIdx === -1) break;
    remaining.delete(bestIdx);
    const block = blocks[bestIdx];
    ordered.push(block);

    const last = block[block.length - 1];
    const lastEntry = getEntryPoint(last, cursor);
    cursor = getExitPoint(last, lastEntry);
    color  = last.color;
  }

  return ordered;
}

// ─── Métricas de una secuencia ────────────────────────────────────────────────

function computeMetrics(sequence, speedSpm = 800) {
  let jumps = 0, jumpDistMm = 0, trims = 0, colorChanges = 0;
  let pos = [0, 0];
  let prevColor = null;

  for (const region of sequence) {
    const entry  = getEntryPoint(region, pos);
    const jumpMm = distNorm(pos, entry);

    if (jumpMm > 1.5) {
      jumps++;
      jumpDistMm += jumpMm;
      if (jumpMm > TRIM_THRESHOLD_MM) trims++;
    }

    if (prevColor !== null && region.color !== prevColor) colorChanges++;
    prevColor = region.color;
    pos = getExitPoint(region, entry);
  }

  const totalStitches = sequence.reduce((s, r) => s + (r.stitch_count || 0), 0);
  const stitchTimeSec = (totalStitches / speedSpm) * 60;
  const jumpTimeSec   = jumpDistMm / 300;        // 300 mm/s jump speed
  const colorTimeSec  = colorChanges * 30;       // 30s per color change (operator)
  const trimTimeSec   = trims * 4;               // 4s per trim
  const totalTimeSec  = Math.round(stitchTimeSec + jumpTimeSec + colorTimeSec + trimTimeSec);
  const threadMm      = Math.round(totalStitches * 2.5 + jumpDistMm * 0.6);

  return { jumps, jumpDistMm: Math.round(jumpDistMm), trims, colorChanges, totalTimeSec, threadMm, totalStitches };
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * optimizeTravelPath(regions, config) → TravelResult | null
 *
 * @param {Region[]} regions  — regiones enriquecidas (deben tener path_points, stitch_type, color, priority)
 * @param {object}   config   — { speedSpm, width_mm, height_mm }
 *
 * TravelResult:
 *   optimizedSequence  — regiones en orden óptimo
 *   before / after     — métricas de producción
 *   savings            — % de ahorro por categoría
 *   overallSaving      — ahorro global ponderado (%)
 *   colorGroups        — resumen de bloques de color
 *   solver             — info del solver usado
 */
export function optimizeTravelPath(regions, config = {}) {
  const { speedSpm = 800, width_mm = 100, height_mm = 100 } = config;

  const valid = (regions || []).filter(r => r.path_points?.length >= 3 && r.visible !== false);
  if (valid.length === 0) return null;

  // ── Métricas ANTES ─────────────────────────────────────────────────────────
  const before = computeMetrics(valid, speedSpm);

  // ── Paso 1: Segregar en bandas de tipo (inmutable) ─────────────────────────
  const bands = [[], [], []]; // [fill, satin, running]
  for (const r of valid) bands[getBand(r)].push(r);

  // ── Paso 2-5: Por cada banda, optimizar internamente ───────────────────────
  let cursor = [0, 0];
  let curColor = null;
  const optimizedBands = [];

  for (const band of bands) {
    if (band.length === 0) continue;

    // Agrupar por color
    const colorMap = {};
    for (const r of band) {
      const key = r.color || '#000000';
      if (!colorMap[key]) colorMap[key] = [];
      colorMap[key].push(r);
    }

    // Para cada bloque de color: greedy NN → 2-opt → or-opt(1)
    const colorBlocks = Object.values(colorMap).map(block => {
      let optimized = greedyNN(block, cursor, curColor);
      optimized = twoOpt(optimized, cursor, curColor);
      optimized = orOpt1(optimized, cursor, curColor);
      return optimized;
    });

    // Ordenar bloques de color por cercanía de salida
    const chainedBlocks = chainColorBlocks(colorBlocks, cursor, curColor);
    const flatBand = chainedBlocks.flat();

    if (flatBand.length > 0) {
      const last = flatBand[flatBand.length - 1];
      const lastEntry = getEntryPoint(last, cursor);
      cursor = getExitPoint(last, lastEntry);
      curColor = last.color;
    }

    optimizedBands.push(...flatBand);
  }

  // ── Métricas DESPUÉS ───────────────────────────────────────────────────────
  const after = computeMetrics(optimizedBands, speedSpm);

  // ── Ahorro ─────────────────────────────────────────────────────────────────
  const savings = {
    jumps:        pct(before.jumps,         after.jumps),
    trims:        pct(before.trims,         after.trims),
    colorChanges: pct(before.colorChanges,  after.colorChanges),
    time:         pct(before.totalTimeSec,  after.totalTimeSec),
    thread:       pct(before.threadMm,      after.threadMm),
    jumpDistMm:   before.jumpDistMm - after.jumpDistMm,
  };

  const overallSaving = Math.round(
    savings.time         * 0.30 +
    savings.trims        * 0.30 +
    savings.colorChanges * 0.25 +
    savings.jumps        * 0.15
  );

  // Resumen de bloques de color
  const colorGroupMap = {};
  for (const r of optimizedBands) {
    const k = r.color || '#000000';
    if (!colorGroupMap[k]) colorGroupMap[k] = { color: k, count: 0, totalArea: 0 };
    colorGroupMap[k].count++;
    colorGroupMap[k].totalArea += r.area_mm2 || 0;
  }

  return {
    optimizedSequence: optimizedBands,
    before,
    after,
    savings,
    overallSaving,
    colorGroups: Object.values(colorGroupMap),
    solver: { algorithm: 'greedy-nn + 2-opt + or-opt(1) + color-chaining', regions: optimizedBands.length },
  };
}

function pct(before, after) {
  if (before === 0) return 0;
  return Math.max(0, Math.round(((before - after) / before) * 100));
}

// ─── Formatters (API pública auxiliar) ───────────────────────────────────────

export function formatTime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function formatThread(mm) {
  if (mm < 1000) return `${mm} mm`;
  return `${(mm / 1000).toFixed(1)} m`;
}