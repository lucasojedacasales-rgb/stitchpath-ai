/**
 * regionPartitioner.js — FASE 4: Partición automática de regiones irregulares
 * ─────────────────────────────────────────────────────────────────────────────
 * Replica la lógica de subdivisión de Wilcom / Pulse:
 *   - Una región muy irregular (baja convexidad, alta curvatura, forma compleja)
 *     se divide en subregiones más simples por el eje PCA.
 *   - Cada subregión hereda el color y metadatos del padre, pero obtiene:
 *       • su propio centroide
 *       • su propio ángulo PCA
 *       • su propio ID derivado del padre
 *   - El proceso es recursivo hasta MAX_DEPTH para evitar loops infinitos.
 *   - Las regiones simples pasan sin modificación (non-destructive).
 *
 * Criterios de partición (todos deben cumplirse):
 *   1. convexity < SPLIT_CONVEXITY_THRESHOLD  (forma cóncava/irregular)
 *   2. area_mm2  > SPLIT_AREA_MIN_MM2         (suficiente área para dos mitades útiles)
 *   3. complexity.score > SPLIT_COMPLEXITY_MIN (geometría no trivial)
 *
 * Algoritmo de corte:
 *   - Calcular eje PCA del polígono (orientación principal)
 *   - Trazar línea de corte PERPENDICULAR al eje PCA pasando por el centroide
 *   - Dividir el polígono en dos mitades con Sutherland-Hodgman
 *   - Si alguna mitad es inválida (<3 puntos o área < mínimo), abortar partición
 *
 * API:
 *   partitionRegions(regions, designWidthMm, designHeightMm) → Region[]
 *   — devuelve la lista expandida (regiones simples + subregiones)
 *   — cada región particionada lleva _partitioned=true y _parent_id
 */

// ─── Umbrales ─────────────────────────────────────────────────────────────────

const SPLIT_CONVEXITY_THRESHOLD = 0.45;  // debajo de esto → candidato a split
const SPLIT_AREA_MIN_MM2        = 40.0;  // mínimo área para que valga la pena dividir
const SPLIT_COMPLEXITY_MIN      = 0.45;  // complexity.score mínimo para disparar split
const SPLIT_HALF_MIN_MM2        = 8.0;   // cada mitad debe tener al menos este área
const MAX_DEPTH                 = 2;     // máximo niveles de recursión (evita explosión)

// ─── Geometría básica ─────────────────────────────────────────────────────────

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

function centroid(pts) {
  const n = pts.length;
  return [
    pts.reduce((s, p) => s + p[0], 0) / n,
    pts.reduce((s, p) => s + p[1], 0) / n,
  ];
}

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

function computeConvexity(pts) {
  const hull = convexHull(pts);
  const areaOrig = polygonArea(pts);
  const areaHull = polygonArea(hull);
  if (areaHull < 1e-9) return 1;
  return Math.min(1, areaOrig / areaHull);
}

function computeOrientation(pts) {
  const n = pts.length;
  if (n < 3) return 0;
  const [cx, cy] = centroid(pts);
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of pts) {
    const dx = x - cx, dy = y - cy;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return ((angle * 180) / Math.PI + 180) % 180;
}

function computeMeanCurvature(pts) {
  if (pts.length < 4) return 0;
  let total = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    const v1 = [b[0]-a[0], b[1]-a[1]];
    const v2 = [c[0]-b[0], c[1]-b[1]];
    const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
    if (l1 < 1e-9 || l2 < 1e-9) continue;
    const dot = (v1[0]*v2[0] + v1[1]*v2[1]) / (l1 * l2);
    total += Math.acos(Math.max(-1, Math.min(1, dot)));
  }
  return total / n;
}

function computeComplexityScore(pts, curvature, convexity) {
  const vertexScore = Math.min(1, pts.length / 200);
  const curvScore   = Math.min(1, curvature / 1.5);
  const convexScore = 1 - convexity;
  return vertexScore * 0.35 + curvScore * 0.40 + convexScore * 0.25;
}

// ─── Sutherland-Hodgman half-plane clip ──────────────────────────────────────
// Recorta un polígono por un semiplano definido por línea (nx, ny, d) tal que
// el interior se conserva en el lado donde nx*x + ny*y >= d.

function clipPolygonByHalfPlane(polygon, nx, ny, d) {
  if (polygon.length < 3) return [];
  const output = [];
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const curr = polygon[i];
    const next = polygon[(i + 1) % n];
    const currInside = nx * curr[0] + ny * curr[1] >= d;
    const nextInside = nx * next[0] + ny * next[1] >= d;

    if (currInside) output.push(curr);

    if (currInside !== nextInside) {
      // Intersección de la arista con la línea de corte
      const dx = next[0] - curr[0];
      const dy = next[1] - curr[1];
      const denom = nx * dx + ny * dy;
      if (Math.abs(denom) > 1e-10) {
        const t = (d - nx * curr[0] - ny * curr[1]) / denom;
        output.push([curr[0] + t * dx, curr[1] + t * dy]);
      }
    }
  }
  return output;
}

// ─── Intentar partir un polígono por la perpendicular a su eje PCA ───────────

function splitPolygon(scaledPts) {
  const [cx, cy] = centroid(scaledPts);

  // Eje PCA → corte perpendicular a él
  const orientDeg = computeOrientation(scaledPts);
  const orientRad = (orientDeg * Math.PI) / 180;

  // Normal al eje PCA = dirección del corte
  // El eje PCA está en (cos θ, sin θ); su perpendicular es (-sin θ, cos θ)
  const nx = -Math.sin(orientRad);
  const ny =  Math.cos(orientRad);
  const d  = nx * cx + ny * cy; // constante del semiplano que pasa por el centroide

  // Semiplano A: nx*x + ny*y >= d
  const halfA = clipPolygonByHalfPlane(scaledPts, nx, ny, d);
  // Semiplano B: -(nx*x + ny*y) >= -d  ≡  nx*x + ny*y <= d
  const halfB = clipPolygonByHalfPlane(scaledPts, -nx, -ny, -d);

  if (halfA.length < 3 || halfB.length < 3) return null;
  if (polygonArea(halfA) < SPLIT_HALF_MIN_MM2) return null;
  if (polygonArea(halfB) < SPLIT_HALF_MIN_MM2) return null;

  return [halfA, halfB];
}

// ─── Convertir pts escalados → normalizados ───────────────────────────────────

function scaleToNorm(scaledPts, W, H) {
  return scaledPts.map(p => [p[0] / W, p[1] / H]);
}

// ─── Decidir si una región necesita partición ─────────────────────────────────

function needsPartition(region, scaledPts) {
  const area      = polygonArea(scaledPts);
  const convexity = computeConvexity(scaledPts);
  const curvature = computeMeanCurvature(scaledPts);
  const complexity = computeComplexityScore(scaledPts, curvature, convexity);

  return (
    area      >  SPLIT_AREA_MIN_MM2        &&
    convexity <  SPLIT_CONVEXITY_THRESHOLD &&
    complexity > SPLIT_COMPLEXITY_MIN
  );
}

// ─── Partición recursiva de una región ───────────────────────────────────────

function partitionOne(region, scaledPts, designW, designH, depth, parentId) {
  if (depth >= MAX_DEPTH) return [region]; // límite de recursión
  if (!needsPartition(region, scaledPts)) return [region]; // ya es simple

  const halves = splitPolygon(scaledPts);
  if (!halves) return [region]; // corte fallido → conservar original

  const [halfA, halfB] = halves;

  // Construir subregiones heredando todos los campos del padre
  const subA = {
    ...region,
    id:             `${parentId}_A`,
    path_points:    scaleToNorm(halfA, designW, designH),
    centroid:       centroid(scaleToNorm(halfA, designW, designH)),
    _partitioned:   true,
    _parent_id:     parentId,
    _split_depth:   depth + 1,
    // Resetear campos calculados — enrichRegion los recalculará
    area_mm2:       undefined,
    orientation:    undefined,
    fill_angle:     undefined,
    angle:          undefined,
    stitch_count:   undefined,
  };
  const subB = {
    ...region,
    id:             `${parentId}_B`,
    path_points:    scaleToNorm(halfB, designW, designH),
    centroid:       centroid(scaleToNorm(halfB, designW, designH)),
    _partitioned:   true,
    _parent_id:     parentId,
    _split_depth:   depth + 1,
    // Resetear campos calculados
    area_mm2:       undefined,
    orientation:    undefined,
    fill_angle:     undefined,
    angle:          undefined,
    stitch_count:   undefined,
  };

  // Recursión: intentar partir cada mitad si sigue siendo irregular
  return [
    ...partitionOne(subA, halfA, designW, designH, depth + 1, subA.id),
    ...partitionOne(subB, halfB, designW, designH, depth + 1, subB.id),
  ];
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * partitionRegions — punto de entrada de la FASE 4.
 *
 * Itera sobre todas las regiones; las que cumplan los criterios de irregularidad
 * se substituyen por sus subregiones. Las simples pasan intactas.
 *
 * @param {Region[]} regions
 * @param {number}   designWidthMm
 * @param {number}   designHeightMm
 * @returns {Region[]}  lista expandida con subregiones
 */
export function partitionRegions(regions, designWidthMm = 100, designHeightMm = 100) {
  const result = [];

  for (const region of regions) {
    const pts = region.path_points || [];
    if (pts.length < 3) {
      result.push(region);
      continue;
    }

    // Escalar puntos normalizados → mm para el análisis geométrico
    const scaled = pts.map(p => [p[0] * designWidthMm, p[1] * designHeightMm]);

    const partitioned = partitionOne(region, scaled, designWidthMm, designHeightMm, 0, region.id);
    result.push(...partitioned);
  }

  return result;
}