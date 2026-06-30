/**
 * microRegionCleaner.js — FASE 10: Limpieza de micro-regiones
 * ─────────────────────────────────────────────────────────────────────────────
 * Elimina artefactos de digitización que generan problemas en máquina:
 *
 *  PASO 1 — Fusión de micro-regiones
 *    Regiones por debajo de un umbral configurable se fusionan con su
 *    vecino más cercano del mismo color o, si no existe, con el más próximo.
 *
 *  PASO 2 — Eliminación de islotes
 *    Regiones que no tienen ningún vecino dentro de un radio mínimo se
 *    marcan como islotes y se eliminan (son ruido del vectorizador).
 *
 *  PASO 3 — Eliminación de puntadas aisladas
 *    Regiones que generarían < MIN_STITCHES puntadas se descartan
 *    (una puntada solitaria detiene la máquina inútilmente).
 *
 *  PASO 4 — Consolidación de cambios de color innecesarios
 *    Regiones consecutivas del mismo color que han quedado separadas
 *    por una micro-región de otro color se re-agrupan, eliminando
 *    el cambio de hilo innecesario.
 *
 * Umbrales (todos configurables vía `options`):
 *   mergeThresholdMm2   — área mínima para no fusionar        [default: 4.0 mm²]
 *   islandRadiusNorm    — radio máximo para considerar vecino  [default: 0.15 norm]
 *   minStitches         — puntadas mínimas para conservar      [default: 3]
 *   colorMergeGapMm2    — micro-región de otro color a ignorar [default: 2.0 mm²]
 *
 * API:
 *   cleanMicroRegions(regions, options?) → { regions, stats }
 *   stats: { merged, islands_removed, isolated_removed, color_merges }
 */

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const MICRO_REGION_DEFAULTS = {
  mergeThresholdMm2: 4.0,   // mm² — debajo de esto, la región es candidata a fusión
  islandRadiusNorm:  0.15,  // normalized [0,1] — sin vecino dentro de este radio → islote
  minStitches:       3,     // puntadas mínimas para que valga la pena bordar la región
  colorMergeGapMm2:  2.0,   // mm² — micro-región de otro color que interrumpe un bloque de color
};

// ─── Geometría básica ─────────────────────────────────────────────────────────

function centroidOf(region) {
  if (region.centroid) return region.centroid;
  const pts = region.path_points || [];
  if (!pts.length) return [0.5, 0.5];
  return [
    pts.reduce((s, p) => s + p[0], 0) / pts.length,
    pts.reduce((s, p) => s + p[1], 0) / pts.length,
  ];
}

function dist(r1, r2) {
  const [ax, ay] = centroidOf(r1);
  const [bx, by] = centroidOf(r2);
  return Math.hypot(ax - bx, ay - by);
}

// Fusión de polígonos: aproximación convexa del bounding box de los dos conjuntos de puntos.
// Para la preview no necesitamos fusión geométrica perfecta; la caja convexa es suficiente
// para que enrichRegion recalcule el área y el EIE asigne parámetros correctos.
function mergePolygons(ptsA, ptsB) {
  const all = [...(ptsA || []), ...(ptsB || [])];
  if (all.length < 3) return all;
  // Casco convexo simplificado
  const sorted = [...all].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);
  const lower = [], upper = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) lower.pop();
    lower.push(p);
  }
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

// ─── PASO 1: Fusión de micro-regiones ────────────────────────────────────────

function mergeMicroRegions(regions, threshold, islandRadius) {
  const merged = [];
  let mergeCount = 0;
  const absorbed = new Set(); // IDs ya absorbidos

  // Trabajar sobre copia ordenada: pequeñas primero (las que se van a fusionar)
  const sorted = [...regions].sort((a, b) => (a.area_mm2 || 0) - (b.area_mm2 || 0));

  for (const region of sorted) {
    if (absorbed.has(region.id)) continue;

    const area = region.area_mm2 || 0;
    if (area >= threshold) {
      merged.push(region);
      continue;
    }

    // Buscar el mejor candidato para absorber esta micro-región:
    // 1º preferencia: vecino mismo color más cercano no absorbido
    // 2º preferencia: cualquier vecino más cercano no absorbido
    let best = null;
    let bestDist = Infinity;

    for (const candidate of sorted) {
      if (candidate.id === region.id) continue;
      if (absorbed.has(candidate.id)) continue;
      if ((candidate.area_mm2 || 0) < threshold) continue; // no fusionar dos micros
      const d = dist(region, candidate);
      if (d > islandRadius * 2) continue; // demasiado lejos — sería un islote

      const sameColor = candidate.color === region.color;
      const score = d - (sameColor ? islandRadius : 0); // bonificación por mismo color
      if (score < bestDist) {
        bestDist = score;
        best = candidate;
      }
    }

    if (best) {
      // Fusionar: ampliar el polígono del candidato con los puntos de la micro-región
      const mergedPts = mergePolygons(best.path_points, region.path_points);
      const mergedIdx = merged.findIndex(r => r.id === best.id);

      const fusedRegion = {
        ...best,
        path_points: mergedPts,
        centroid: undefined, // se recalculará en enrichRegion
        area_mm2: undefined,
        stitch_count: undefined,
        _micro_merged: true,
        _merged_from: [...(best._merged_from || []), region.id],
      };

      if (mergedIdx >= 0) {
        merged[mergedIdx] = fusedRegion;
      }
      absorbed.add(region.id);
      mergeCount++;
    } else {
      // Sin candidato cercano: la región se descarta como islote más adelante
      // (llegará al paso 2 con area < threshold)
      merged.push(region);
    }
  }

  return { regions: merged.filter(r => !absorbed.has(r.id)), mergeCount };
}

// ─── PASO 2: Eliminación de islotes ──────────────────────────────────────────

function removeIslands(regions, islandRadius) {
  let removedCount = 0;
  const cleaned = regions.filter(region => {
    const hasNeighbor = regions.some(other => {
      if (other.id === region.id) return false;
      return dist(region, other) <= islandRadius;
    });
    if (!hasNeighbor) {
      removedCount++;
      return false;
    }
    return true;
  });
  return { regions: cleaned, removedCount };
}

// ─── PASO 3: Eliminación de puntadas aisladas ─────────────────────────────────

function removeIsolatedStitches(regions, minStitches) {
  let removedCount = 0;
  const cleaned = regions.filter(region => {
    const count = region.stitch_count || estimateStitchCount(region);
    if (count < minStitches) {
      removedCount++;
      return false;
    }
    return true;
  });
  return { regions: cleaned, removedCount };
}

function estimateStitchCount(region) {
  const type  = region.stitch_type || 'fill';
  const area  = region.area_mm2 || 0;
  const perim = region.perimeter_mm || Math.sqrt(area) * 4;
  const dens  = region.density || 0.4;
  if (type === 'fill')   return Math.round(area / (dens * 2.4));
  if (type === 'satin')  return Math.round((perim / 2) / dens);
  return Math.round(perim / 1.8);
}

// ─── PASO 4: Consolidación de cambios de color innecesarios ──────────────────
// Detecta micro-regiones de un color diferente intercaladas entre bloques del
// mismo color (e.g. blanco / negro[micro] / blanco → fusionar el micro con el blanco).

function consolidateColorChanges(regions, colorMergeGapMm2) {
  if (regions.length < 3) return { regions, colorMerges: 0 };

  let colorMerges = 0;
  const result = [...regions];

  for (let i = 1; i < result.length - 1; i++) {
    const prev = result[i - 1];
    const curr = result[i];
    const next = result[i + 1];

    if (!prev || !curr || !next) continue;

    const currArea = curr.area_mm2 || estimateStitchCount(curr) * 0.4 * 2.4;

    // Si la región actual es pequeña y está flanqueada por regiones del mismo color
    const isGap = (curr.color !== prev.color) &&
                  (prev.color === next.color) &&
                  currArea <= colorMergeGapMm2;

    if (isGap) {
      // Fusionar la micro-región con el vecino anterior (mismo color)
      const mergedPts = mergePolygons(prev.path_points, curr.path_points);
      result[i - 1] = {
        ...prev,
        path_points: mergedPts,
        centroid: undefined,
        area_mm2: undefined,
        stitch_count: undefined,
        _color_gap_merged: true,
      };
      result.splice(i, 1);
      i--;
      colorMerges++;
    }
  }

  return { regions: result, colorMerges };
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * cleanMicroRegions — FASE 10 entry point.
 *
 * Ejecuta los 4 pasos de limpieza en orden y devuelve las regiones saneadas
 * junto con estadísticas de limpieza para diagnóstico.
 *
 * @param {Region[]} regions
 * @param {object}   options   — umbrales configurables (ver MICRO_REGION_DEFAULTS)
 * @returns {{ regions: Region[], stats: object }}
 */
export function cleanMicroRegions(regions, options = {}) {
  if (!regions || regions.length === 0) return { regions: [], stats: {} };

  const cfg = { ...MICRO_REGION_DEFAULTS, ...options };

  const initialCount = regions.length;

  // Paso 1: Fusión
  const { regions: afterMerge, mergeCount } = mergeMicroRegions(
    regions, cfg.mergeThresholdMm2, cfg.islandRadiusNorm
  );

  // Paso 2: Islotes
  const { regions: afterIslands, removedCount: islandsRemoved } = removeIslands(
    afterMerge, cfg.islandRadiusNorm
  );

  // Paso 3: Puntadas aisladas
  const { regions: afterIsolated, removedCount: isolatedRemoved } = removeIsolatedStitches(
    afterIslands, cfg.minStitches
  );

  // Paso 4: Cambios de color
  const { regions: afterColors, colorMerges } = consolidateColorChanges(
    afterIsolated, cfg.colorMergeGapMm2
  );

  const stats = {
    initial_count:    initialCount,
    final_count:      afterColors.length,
    merged:           mergeCount,
    islands_removed:  islandsRemoved,
    isolated_removed: isolatedRemoved,
    color_merges:     colorMerges,
    total_removed:    initialCount - afterColors.length,
  };

  return { regions: afterColors, stats };
}