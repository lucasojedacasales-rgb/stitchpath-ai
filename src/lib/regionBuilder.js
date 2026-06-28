/**
 * regionBuilder.js
 *
 * Enriquece una región cruda con todos los campos avanzados:
 * complexity, orientation, convexity, curvature, holes,
 * priority, travelOrder, estimatedTime, estimatedThread, qualityScore.
 */

// ─── Constantes ────────────────────────────────────────────────────────────────

const THREAD_MM_PER_STITCH = 5.5;   // mm de hilo por puntada (promedio real)
const MACHINE_SPM_DEFAULT  = 800;   // puntadas por minuto
const MM_PER_GRAM          = 220;   // mm de hilo por gramo (40wt poliéster)

// ─── Geometría ─────────────────────────────────────────────────────────────────

/** Área del polígono por fórmula de Shoelace (puntos normalizados → necesita escala) */
function polygonArea(pts) {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i][0] * pts[j][1];
    area -= pts[j][0] * pts[i][1];
  }
  return Math.abs(area) / 2;
}

/** Perímetro del polígono */
function polygonPerimeter(pts) {
  let perim = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = pts[j][0] - pts[i][0];
    const dy = pts[j][1] - pts[i][1];
    perim += Math.hypot(dx, dy);
  }
  return perim;
}

/** Convex hull (Graham scan simplificado) */
function convexHull(pts) {
  if (pts.length < 3) return pts;
  const sorted = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
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

/** Convexidad = área / área del casco convexo. 1.0 = perfectamente convexo */
function computeConvexity(pts) {
  const hull = convexHull(pts);
  const areaOriginal = polygonArea(pts);
  const areaHull     = polygonArea(hull);
  if (areaHull < 1e-9) return 1;
  return Math.min(1, areaOriginal / areaHull);
}

/** Orientación dominante (PCA sobre los puntos) — ángulo en grados [0,180) */
function computeOrientation(pts) {
  const n = pts.length;
  if (n < 3) return 0;
  const cx = pts.reduce((s, p) => s + p[0], 0) / n;
  const cy = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of pts) {
    const dx = x - cx, dy = y - cy;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return Math.round(((angle * 180) / Math.PI + 180) % 180);
}

/** Curvatura media (cambio de ángulo entre segmentos consecutivos) */
function computeMeanCurvature(pts) {
  if (pts.length < 4) return 0;
  let totalCurv = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    const v1 = [b[0]-a[0], b[1]-a[1]];
    const v2 = [c[0]-b[0], c[1]-b[1]];
    const len1 = Math.hypot(...v1), len2 = Math.hypot(...v2);
    if (len1 < 1e-9 || len2 < 1e-9) continue;
    const dot = (v1[0]*v2[0] + v1[1]*v2[1]) / (len1 * len2);
    totalCurv += Math.acos(Math.max(-1, Math.min(1, dot)));
  }
  return +(totalCurv / n).toFixed(4);
}

/** Complejidad: función de cantidad de vértices + curvatura + (1 - convexidad) */
function computeComplexity(pts, curvature, convexity) {
  const vertexScore   = Math.min(1, pts.length / 200);      // más vértices → más complejo
  const curvScore     = Math.min(1, curvature / 1.5);       // más curvo → más complejo
  const convexScore   = 1 - convexity;                       // menos convexo → más complejo
  const raw = vertexScore * 0.35 + curvScore * 0.40 + convexScore * 0.25;
  const level = raw < 0.25 ? 'simple' : raw < 0.55 ? 'media' : 'alta';
  return { score: +raw.toFixed(3), level };
}

/** Detección heurística de agujeros (basada en la proporción isla/contenedor) */
function estimateHoles(region, allRegions) {
  if (!region.neighbors || region.neighbors.length === 0) return 0;
  // Heurística: vecinos que están completamente dentro del bbox de esta región
  const [cx, cy] = region.centroid || [0.5, 0.5];
  let holes = 0;
  for (const nid of region.neighbors) {
    const neighbor = allRegions.find(r => r.id === nid);
    if (!neighbor?.centroid) continue;
    const [nx, ny] = neighbor.centroid;
    // Si el vecino tiene un área mucho menor y está cercano al centro → posible agujero
    if ((neighbor.area_mm2 || 0) < (region.area_mm2 || 1) * 0.15) {
      const dist = Math.hypot(nx - cx, ny - cy);
      if (dist < 0.2) holes++;
    }
  }
  return holes;
}

// ─── Estimaciones de producción ───────────────────────────────────────────────

/**
 * Canonical stitch count — mirrors the backend calcularStitchCount formula exactly.
 * Single source of truth: fill ≈ 2.5/mm² · (1/density), satin via perimeter, running 1/1.5mm
 */
function estimateStitchCount(region) {
  const type  = region.stitch_type || 'fill';
  const area  = region.area_mm2    || 0;
  const perim = region.perimeter_mm || Math.sqrt(area) * 3.5;
  const dens  = region.density     || 0.4;

  if (type === 'fill')   return Math.round(area * 2.5 * (1 / Math.max(0.25, dens)));
  if (type === 'satin')  return Math.round(perim * 2 * (area / Math.max(1, perim)));
  return Math.round(perim / 1.5);
}

function estimateTime(stitches, spm = MACHINE_SPM_DEFAULT) {
  return +(stitches / spm).toFixed(2); // minutos
}

function estimateThread(stitches) {
  const mm    = stitches * THREAD_MM_PER_STITCH;
  const grams = mm / MM_PER_GRAM;
  return { mm: Math.round(mm), grams: +grams.toFixed(2) };
}

// ─── Quality score ────────────────────────────────────────────────────────────

function computeQualityScore(region, complexity, convexity) {
  let score = 100;

  // Penalizar zonas muy pequeñas
  if ((region.area_mm2 || 0) < 5)  score -= 30;
  else if ((region.area_mm2 || 0) < 15) score -= 15;

  // Penalizar alta complejidad con fill
  if (complexity.level === 'alta' && region.stitch_type === 'fill') score -= 10;

  // Penalizar baja convexidad (formas muy cóncavas) con satén
  if (convexity < 0.5 && region.stitch_type === 'satin') score -= 20;

  // Penalizar saturación ancha de satén
  const avgWidth = (region.area_mm2 || 1) / Math.max(1, region.perimeter_mm || 1);
  if (region.stitch_type === 'satin' && avgWidth > 10) score -= 15;

  // Bonus por underlay en fills grandes
  if (region.stitch_type === 'fill' && region.underlay && (region.area_mm2 || 0) > 50) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─── Prioridad automática ─────────────────────────────────────────────────────

function computePriority(region) {
  // 1 = último (detalles), 5 = primero (capas base grandes)
  const area = region.area_mm2 || 0;
  const type = region.stitch_type || 'fill';
  if (type === 'running_stitch') return 1;   // contornos al final
  if (area > 300) return 5;
  if (area > 100) return 4;
  if (area > 30)  return 3;
  if (area > 10)  return 2;
  return 1;
}

// ─── API principal ─────────────────────────────────────────────────────────────

/**
 * Enriquece una región con todos los campos calculados.
 * No modifica los campos editables por el usuario (stitch_type, color, angle…).
 *
 * @param {object} region    - región cruda del proyecto
 * @param {Array}  allRegions - todas las regiones (para cálculo de vecinos/agujeros)
 * @param {number} designWidthMm  - ancho real del diseño
 * @param {number} designHeightMm - alto real del diseño
 * @returns {object} región enriquecida
 */
export function enrichRegion(region, allRegions = [], designWidthMm = 100, designHeightMm = 100) {
  const pts = region.path_points || [];
  if (pts.length < 3) return region;

  // Escalar puntos normalizados [0,1] → mm
  const scaledPts = pts.map(p => [p[0] * designWidthMm, p[1] * designHeightMm]);

  const orientation = computeOrientation(scaledPts);
  const convexity   = +computeConvexity(scaledPts).toFixed(3);
  const curvature   = computeMeanCurvature(scaledPts);
  const complexity  = computeComplexity(scaledPts, curvature, convexity);
  const holes       = estimateHoles(region, allRegions);

  // Preserve backend-computed stitch_count — only estimate if missing
  const stitches    = (region.stitch_count > 0) ? region.stitch_count : estimateStitchCount(region);
  const time        = estimateTime(stitches);
  const thread      = estimateThread(stitches);
  const priority    = region.priority ?? computePriority(region);
  const qualityScore = computeQualityScore(region, complexity, convexity);

  return {
    ...region,
    // Computed geometry
    orientation,
    convexity,
    curvature,
    complexity,
    holes,
    // Computed production estimates
    stitch_count:    stitches,
    estimatedTime:   time,
    estimatedThread: thread,
    // Planning
    priority,
    qualityScore,
    // Semantic fields — preserved from segmenter, not overwritten
    semantic_object: region.semantic_object || null,
    semantic_class:  region.semantic_class  || null,
    image_type:      region.image_type      || null,
    recommended_stitch_type: region.recommended_stitch_type || region.stitch_type,
  };
}

/**
 * Enriquece todas las regiones y calcula travelOrder (secuencia óptima de viaje).
 * Ordena por prioridad desc, luego por proximidad al centroide anterior (greedy TSP).
 */
export function enrichAllRegions(regions, designWidthMm = 100, designHeightMm = 100) {
  const enriched = regions.map(r => enrichRegion(r, regions, designWidthMm, designHeightMm));

  // Greedy travel order por prioridad + proximidad
  const byPriority = [...enriched].sort((a, b) => (b.priority || 1) - (a.priority || 1));
  const ordered = [];
  const visited = new Set();
  let cx = 0.5, cy = 0.5; // cursor de máquina actual

  while (ordered.length < byPriority.length) {
    // Buscar el no visitado más cercano de la misma (mayor) prioridad
    const topPriority = byPriority.find(r => !visited.has(r.id))?.priority || 1;
    const samePrio    = byPriority.filter(r => !visited.has(r.id) && (r.priority || 1) === topPriority);

    let best = samePrio[0], bestDist = Infinity;
    for (const r of samePrio) {
      const [rx, ry] = r.centroid || [0.5, 0.5];
      const dist = Math.hypot(rx - cx, ry - cy);
      if (dist < bestDist) { bestDist = dist; best = r; }
    }

    if (!best) break;
    visited.add(best.id);
    ordered.push({ ...best, travelOrder: ordered.length + 1 });
    const [rx, ry] = best.centroid || [0.5, 0.5];
    cx = rx; cy = ry;
  }

  return ordered;
}