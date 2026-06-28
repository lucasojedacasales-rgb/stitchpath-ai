/**
 * qualityEngine.js — Professional Embroidery Quality Validator
 * ─────────────────────────────────────────────────────────────────────────────
 * Analyzes a set of regions before export and produces:
 *   - qualityScore  0–100
 *   - checks[]      categorized issues with severity, code, detail, fix
 *   - recommendations[]  actionable improvements
 *   - summary stats (density, stitches, jumps, cuts, etc.)
 */

// ─── Thresholds ───────────────────────────────────────────────────────────────

const T = {
  DENSITY_MAX:        2.0,   // pts/mm — above this: needle break risk
  DENSITY_WARN:       1.6,   // pts/mm — above this: wear risk
  DENSITY_MIN:        0.15,  // pts/mm — below this: sparse, poor coverage
  STITCH_MAX_MM:      12.1,  // mm — machine hard limit
  STITCH_WARN_MM:     9.0,   // mm — long stitch warning
  STITCH_MIN_MM:      0.5,   // mm — too short → excessive friction
  ANGLE_EXTREME_DEG:  85,    // degrees — angles > this on fill cause texture issues
  TINY_REGION_MM2:    5,     // mm² — micro regions likely invisible in production
  SMALL_REGION_MM2:   12,    // mm² — small but survivable
  OVERLAP_THRESH:     0.12,  // 12% bounding box overlap → accumulation risk
  COLOR_CHANGE_WARN:  8,     // thread changes above this → long setup
  COLOR_CHANGE_MAX:   15,    // practical machine limit for most models
  JUMP_COUNT_WARN:    20,    // jumps above this → significant inefficiency
  CUT_COUNT_WARN:     10,    // cuts above this → slower production
  STITCH_COUNT_MAX:   120000,// absolute excess
  STITCH_COUNT_WARN:  60000, // notable complexity
  SATIN_MAX_WIDTH_MM: 12,    // satin columns wider than this → looping risk
  FILL_MIN_AREA_MM2:  20,    // fill below this → better as running stitch
  UNDERLAY_AREA_MIN:  30,    // mm² — fills above this should have underlay
  THREAD_MM_STITCH:   5.5,   // mm of thread per stitch (40wt)
  SPOOL_METERS:       1000,  // metres per spool
};

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function bboxOf(pts) {
  if (!pts?.length) return null;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
function bboxArea(b) { return (b.maxX - b.minX) * (b.maxY - b.minY); }
function bboxOverlap(a, b) {
  const ox = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const oy = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
  return ox * oy;
}

// ─── Individual check functions ───────────────────────────────────────────────

function checkDensity(regions) {
  const checks = [];
  const critical = regions.filter(r => (r.density || 0) > T.DENSITY_MAX);
  const high     = regions.filter(r => (r.density || 0) > T.DENSITY_WARN && (r.density || 0) <= T.DENSITY_MAX);
  const sparse   = regions.filter(r => r.stitch_type === 'fill' && (r.density || 0) > 0 && (r.density || 0) < T.DENSITY_MIN);

  if (critical.length) {
    checks.push({
      code: 'DENSITY_CRITICAL', severity: 'error', category: 'density',
      label: `Densidad excesiva (${critical.length} región${critical.length > 1 ? 'es' : ''})`,
      detail: `Densidad > ${T.DENSITY_MAX} pts/mm. Alto riesgo de rotura de aguja y daño en tela.`,
      regions: critical.map(r => r.name || r.id),
      fix: `Reducir densidad a ≤ ${T.DENSITY_MAX} pts/mm`,
      autoFixable: true,
      penalty: 20 * Math.min(critical.length, 3),
    });
  }
  if (high.length) {
    checks.push({
      code: 'DENSITY_HIGH', severity: 'warning', category: 'density',
      label: `Densidad elevada (${high.length} región${high.length > 1 ? 'es' : ''})`,
      detail: `Densidad entre ${T.DENSITY_WARN}–${T.DENSITY_MAX} pts/mm. Puede acelerar desgaste de aguja.`,
      regions: high.map(r => r.name || r.id),
      fix: `Reducir densidad a ≤ ${T.DENSITY_WARN} pts/mm`,
      autoFixable: true,
      penalty: 5 * Math.min(high.length, 3),
    });
  }
  if (sparse.length) {
    checks.push({
      code: 'DENSITY_SPARSE', severity: 'warning', category: 'density',
      label: `Densidad insuficiente (${sparse.length} fill)`,
      detail: `Densidad < ${T.DENSITY_MIN} pts/mm en rellenos. Cobertura incompleta — se verá la tela.`,
      regions: sparse.map(r => r.name || r.id),
      fix: 'Aumentar densidad de fill a ≥ 0.20 pts/mm',
      autoFixable: true,
      penalty: 8 * Math.min(sparse.length, 2),
    });
  }
  return checks;
}

function checkStitchLength(regions, config) {
  const checks = [];
  const w = config?.width_mm || 100, h = config?.height_mm || 100;

  const tooLong = regions.filter(r => {
    if (!r.perimeter_mm || !r.stitch_count || r.stitch_count < 4) return false;
    const avgLen = r.perimeter_mm / Math.max(1, r.stitch_count / 6);
    return avgLen > T.STITCH_WARN_MM;
  });
  const tooShort = regions.filter(r => {
    if (!r.stitch_count || r.stitch_count < 4 || !r.perimeter_mm) return false;
    const avgLen = r.perimeter_mm / Math.max(1, r.stitch_count / 6);
    return avgLen < T.STITCH_MIN_MM && avgLen > 0;
  });

  if (tooLong.length) {
    checks.push({
      code: 'STITCH_TOO_LONG', severity: 'warning', category: 'stitch_length',
      label: `Puntadas largas (${tooLong.length} región${tooLong.length > 1 ? 'es' : ''})`,
      detail: `Longitud media estimada > ${T.STITCH_WARN_MM}mm. Límite máquina: ${T.STITCH_MAX_MM}mm. Pueden soltarse en uso.`,
      regions: tooLong.map(r => r.name || r.id),
      fix: 'Reducir longitud máxima de puntada (aumentar densidad)',
      autoFixable: false,
      penalty: 8,
    });
  }
  if (tooShort.length) {
    checks.push({
      code: 'STITCH_TOO_SHORT', severity: 'info', category: 'stitch_length',
      label: `Puntadas muy cortas (${tooShort.length} región${tooShort.length > 1 ? 'es' : ''})`,
      detail: `Puntadas < ${T.STITCH_MIN_MM}mm generan fricción excesiva y pueden dañar hilos finos.`,
      regions: tooShort.map(r => r.name || r.id),
      fix: 'Aumentar longitud mínima de puntada (reducir densidad)',
      autoFixable: false,
      penalty: 4,
    });
  }
  return checks;
}

function checkAngles(regions) {
  const checks = [];
  // Extreme angles on fill (>85°) cause visible texture discontinuities
  const extremeAngle = regions.filter(r =>
    r.stitch_type === 'fill' &&
    r.angle !== undefined &&
    r.angle > T.ANGLE_EXTREME_DEG && r.angle < (180 - T.ANGLE_EXTREME_DEG)
  );
  if (extremeAngle.length) {
    checks.push({
      code: 'EXTREME_ANGLE', severity: 'info', category: 'angle',
      label: `Ángulos extremos en fill (${extremeAngle.length})`,
      detail: `Ángulos > ${T.ANGLE_EXTREME_DEG}° en rellenos pueden causar inconsistencias de textura visible.`,
      regions: extremeAngle.map(r => `${r.name || r.id} (${r.angle}°)`),
      fix: 'Revisar ángulos — preferir 30–60° para fills grandes',
      autoFixable: false,
      penalty: 3,
    });
  }
  return checks;
}

function checkSmallRegions(regions) {
  const checks = [];
  const tiny  = regions.filter(r => (r.area_mm2 || 0) > 0 && (r.area_mm2 || 0) < T.TINY_REGION_MM2);
  const small = regions.filter(r => (r.area_mm2 || 0) >= T.TINY_REGION_MM2 && (r.area_mm2 || 0) < T.SMALL_REGION_MM2 && r.stitch_type === 'fill');

  if (tiny.length) {
    checks.push({
      code: 'TINY_REGION', severity: 'warning', category: 'size',
      label: `${tiny.length} región${tiny.length > 1 ? 'es' : ''} micro (< ${T.TINY_REGION_MM2}mm²)`,
      detail: `Regiones muy pequeñas pueden ser invisibles en producción física o causar atascos.`,
      regions: tiny.map(r => r.name || r.id),
      fix: 'Eliminar o convertir a running stitch',
      autoFixable: false,
      penalty: 6 * Math.min(tiny.length, 3),
    });
  }
  if (small.length) {
    checks.push({
      code: 'FILL_TOO_SMALL', severity: 'info', category: 'size',
      label: `${small.length} fill${small.length > 1 ? 's' : ''} pequeño${small.length > 1 ? 's' : ''} (< ${T.SMALL_REGION_MM2}mm²)`,
      detail: `Fills pequeños tienen mejor resultado como satin o running stitch.`,
      regions: small.map(r => r.name || r.id),
      fix: 'Cambiar a satin o running stitch',
      autoFixable: true,
      penalty: 3 * Math.min(small.length, 3),
    });
  }
  return checks;
}

function checkAccumulation(regions) {
  const checks = [];
  const visible = regions.filter(r => r.visible !== false);
  const bboxes  = visible.map(r => ({ r, b: bboxOf(r.path_points) })).filter(x => x.b);
  const overlapping = [];

  for (let i = 0; i < bboxes.length; i++) {
    for (let j = i + 1; j < bboxes.length; j++) {
      if (bboxes[i].r.color !== bboxes[j].r.color) continue;
      const area  = bboxOverlap(bboxes[i].b, bboxes[j].b);
      const minA  = Math.min(bboxArea(bboxes[i].b), bboxArea(bboxes[j].b));
      if (minA > 0 && area / minA > T.OVERLAP_THRESH) {
        overlapping.push(`${bboxes[i].r.name || bboxes[i].r.id} ↔ ${bboxes[j].r.name || bboxes[j].r.id}`);
      }
    }
  }
  if (overlapping.length) {
    checks.push({
      code: 'STITCH_ACCUMULATION', severity: 'warning', category: 'accumulation',
      label: `Acumulación de puntadas (${overlapping.length} par${overlapping.length > 1 ? 'es' : ''})`,
      detail: `Regiones del mismo color con superposición > ${T.OVERLAP_THRESH * 100}%. Acumulación excesiva puede rizar la tela.`,
      regions: overlapping.slice(0, 6),
      fix: 'Revisar orden de capas y separar regiones solapadas',
      autoFixable: false,
      penalty: 8 * Math.min(overlapping.length, 2),
    });
  }
  return checks;
}

function checkJumpsAndCuts(regions) {
  const checks = [];
  const visible = regions.filter(r => r.visible !== false);

  // Estimate jumps: color changes between consecutive regions
  let jumps = 0, cuts = 0;
  for (let i = 1; i < visible.length; i++) {
    if (visible[i].color !== visible[i-1].color) { jumps++; cuts++; }
    else {
      // Same color but distant centroid → jump
      const [ax, ay] = visible[i-1].centroid || [0.5, 0.5];
      const [bx, by] = visible[i].centroid   || [0.5, 0.5];
      if (Math.hypot(bx-ax, by-ay) > 0.08) jumps++;
    }
  }

  if (jumps > T.JUMP_COUNT_WARN) {
    checks.push({
      code: 'HIGH_JUMP_COUNT', severity: 'warning', category: 'travel',
      label: `Muchos saltos (~${jumps})`,
      detail: `Alto número de saltos de hilo. Aumenta tiempo de máquina y riesgo de enredos.`,
      fix: 'Usar Travel Optimizer para minimizar saltos',
      autoFixable: false,
      penalty: Math.min(12, Math.round((jumps - T.JUMP_COUNT_WARN) / 5)),
    });
  }
  if (cuts > T.CUT_COUNT_WARN) {
    checks.push({
      code: 'HIGH_CUT_COUNT', severity: 'info', category: 'travel',
      label: `Muchos cortes (~${cuts})`,
      detail: `Cada corte de hilo añade ~3s y riesgo de hilo suelto. Reordenar por color reduce cortes.`,
      fix: 'Optimizar secuencia por color',
      autoFixable: false,
      penalty: Math.min(8, Math.round((cuts - T.CUT_COUNT_WARN) / 3)),
    });
  }
  return { checks, jumps, cuts };
}

function checkColorChanges(regions) {
  const checks = [];
  const visible = regions.filter(r => r.visible !== false);
  let colorChanges = 0;
  for (let i = 1; i < visible.length; i++) {
    if (visible[i].color !== visible[i-1].color) colorChanges++;
  }
  const uniqueColors = new Set(visible.map(r => r.color)).size;

  if (uniqueColors > T.COLOR_CHANGE_MAX) {
    checks.push({
      code: 'TOO_MANY_COLORS', severity: 'error', category: 'colors',
      label: `${uniqueColors} colores únicos (> ${T.COLOR_CHANGE_MAX})`,
      detail: `La mayoría de bordadoras domésticas/industriales soportan ≤ ${T.COLOR_CHANGE_MAX} hilos. Reducir paleta.`,
      fix: 'Reducir paleta de colores',
      autoFixable: false,
      penalty: 18,
    });
  } else if (uniqueColors > T.COLOR_CHANGE_WARN) {
    checks.push({
      code: 'HIGH_COLOR_COUNT', severity: 'warning', category: 'colors',
      label: `${uniqueColors} colores únicos`,
      detail: `Paleta amplia — verifica compatibilidad con tu máquina objetivo.`,
      fix: 'Considera reducir a ≤ 8 colores',
      autoFixable: false,
      penalty: 6,
    });
  }
  if (colorChanges > T.COLOR_CHANGE_WARN) {
    checks.push({
      code: 'HIGH_THREAD_CHANGES', severity: 'warning', category: 'colors',
      label: `${colorChanges} cambios de hilo`,
      detail: `Muchos cambios de hilo sin optimización de ruta. Cada cambio añade ~30s.`,
      fix: 'Optimizar secuencia para agrupar colores',
      autoFixable: false,
      penalty: 5,
    });
  }
  return { checks, colorChanges, uniqueColors };
}

function checkUnderlay(regions) {
  const checks = [];
  const missing = regions.filter(r =>
    r.stitch_type === 'fill' &&
    (r.area_mm2 || 0) > T.UNDERLAY_AREA_MIN &&
    !r.underlay
  );
  if (missing.length) {
    checks.push({
      code: 'MISSING_UNDERLAY', severity: 'warning', category: 'underlay',
      label: `Sin underlay en ${missing.length} fill${missing.length > 1 ? 's' : ''} grande${missing.length > 1 ? 's' : ''}`,
      detail: `Rellenos > ${T.UNDERLAY_AREA_MIN}mm² sin underlay pueden levantarse y quedar flojos.`,
      regions: missing.map(r => r.name || r.id),
      fix: 'Añadir underlay perimetral',
      autoFixable: true,
      penalty: 5 * Math.min(missing.length, 3),
    });
  }
  return checks;
}

function checkStitchCount(regions) {
  const checks = [];
  const total = regions.reduce((s, r) => s + (r.stitch_count || 0), 0);

  if (total > T.STITCH_COUNT_MAX) {
    checks.push({
      code: 'EXCESSIVE_STITCHES', severity: 'error', category: 'complexity',
      label: `Exceso de puntadas (${(total/1000).toFixed(0)}k)`,
      detail: `Más de ${T.STITCH_COUNT_MAX/1000}k puntadas. Riesgo de sobrecalentamiento y archivos corruptos en algunas máquinas.`,
      fix: 'Reducir densidad global o simplificar diseño',
      autoFixable: false,
      penalty: 15,
    });
  } else if (total > T.STITCH_COUNT_WARN) {
    checks.push({
      code: 'HIGH_STITCH_COUNT', severity: 'info', category: 'complexity',
      label: `Diseño complejo (~${(total/1000).toFixed(0)}k puntadas)`,
      detail: `Alta cuenta de puntadas — bordado largo pero manejable en máquinas modernas.`,
      fix: null,
      autoFixable: false,
      penalty: 3,
    });
  }
  return { checks, totalStitches: total };
}

function checkSatinWidth(regions) {
  const checks = [];
  const wide = regions.filter(r =>
    r.stitch_type === 'satin' &&
    (r.avg_width_mm || 0) > T.SATIN_MAX_WIDTH_MM
  );
  if (wide.length) {
    checks.push({
      code: 'SATIN_TOO_WIDE', severity: 'warning', category: 'stitch_type',
      label: `Satén demasiado ancho (${wide.length} región${wide.length > 1 ? 'es' : ''})`,
      detail: `Satén > ${T.SATIN_MAX_WIDTH_MM}mm de ancho produce puntadas flojas que se enganchan. Cambiar a fill.`,
      regions: wide.map(r => `${r.name || r.id} (~${(r.avg_width_mm||0).toFixed(1)}mm)`),
      fix: 'Convertir a fill Tatami',
      autoFixable: true,
      penalty: 8 * Math.min(wide.length, 2),
    });
  }
  return checks;
}

// ─── Auto-fix ─────────────────────────────────────────────────────────────────

/**
 * Applies all autoFixable corrections to the regions array.
 * Returns a new array — does not mutate input.
 */
export function autoFixRegions(regions) {
  return regions.map(r => {
    let upd = { ...r };
    // Fix density violations
    if ((r.density || 0) > T.DENSITY_MAX) upd.density = T.DENSITY_MAX;
    if (r.stitch_type === 'fill' && (r.density || 0) > 0 && r.density < T.DENSITY_MIN) upd.density = 0.35;
    // Add missing underlay
    if (r.stitch_type === 'fill' && (r.area_mm2 || 0) > T.UNDERLAY_AREA_MIN && !r.underlay) upd.underlay = true;
    // Convert wide satin to fill
    if (r.stitch_type === 'satin' && (r.avg_width_mm || 0) > T.SATIN_MAX_WIDTH_MM) upd.stitch_type = 'fill';
    // Convert small fills
    if (r.stitch_type === 'fill' && (r.area_mm2 || 0) < T.FILL_MIN_AREA_MM2 && (r.area_mm2 || 0) > 0) upd.stitch_type = 'satin';
    return upd;
  });
}

// ─── Main API ─────────────────────────────────────────────────────────────────

/**
 * Runs a full quality analysis on all regions and returns a QualityReport.
 *
 * @param {Array}  regions
 * @param {Object} config  { width_mm, height_mm, fabric_type }
 * @returns {QualityReport}
 */
export function runQualityEngine(regions, config = {}) {
  const visible = (regions || []).filter(r => r.visible !== false);
  if (visible.length === 0) {
    return { qualityScore: 0, checks: [], recommendations: [], summary: {}, autoFixCount: 0 };
  }

  // Run all checks
  const densityChecks     = checkDensity(visible);
  const lengthChecks      = checkStitchLength(visible, config);
  const angleChecks       = checkAngles(visible);
  const sizeChecks        = checkSmallRegions(visible);
  const accumChecks       = checkAccumulation(visible);
  const { checks: jumpChecks, jumps, cuts } = checkJumpsAndCuts(visible);
  const { checks: colorChecks, colorChanges, uniqueColors } = checkColorChanges(visible);
  const underlayChecks    = checkUnderlay(visible);
  const satinChecks       = checkSatinWidth(visible);
  const { checks: countChecks, totalStitches } = checkStitchCount(visible);

  const allChecks = [
    ...densityChecks,
    ...lengthChecks,
    ...angleChecks,
    ...sizeChecks,
    ...accumChecks,
    ...jumpChecks,
    ...colorChecks,
    ...underlayChecks,
    ...satinChecks,
    ...countChecks,
  ];

  // Compute quality score
  const totalPenalty = allChecks.reduce((s, c) => s + (c.penalty || 0), 0);
  const qualityScore = Math.max(0, Math.min(100, 100 - totalPenalty));

  // Auto-fixable count
  const autoFixCount = allChecks.filter(c => c.autoFixable).length;

  // Thread estimate
  const threadM = (totalStitches * T.THREAD_MM_STITCH) / 1000;
  const spools  = Math.ceil(threadM / T.SPOOL_METERS);

  // Recommendations: sorted by severity, de-duplicated
  const recommendations = buildRecommendations(allChecks, visible, config);

  return {
    qualityScore,
    grade: scoreToGrade(qualityScore),
    checks: allChecks,
    autoFixCount,
    recommendations,

    summary: {
      totalRegions:  visible.length,
      totalStitches,
      uniqueColors,
      colorChanges,
      estimatedJumps: jumps,
      estimatedCuts:  cuts,
      threadMeters:   +threadM.toFixed(0),
      spoolsNeeded:   spools,
      errorCount:   allChecks.filter(c => c.severity === 'error').length,
      warningCount: allChecks.filter(c => c.severity === 'warning').length,
      infoCount:    allChecks.filter(c => c.severity === 'info').length,
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreToGrade(score) {
  if (score >= 90) return { letter: 'A', label: 'Excelente', color: 'emerald' };
  if (score >= 75) return { letter: 'B', label: 'Bueno', color: 'cyan' };
  if (score >= 60) return { letter: 'C', label: 'Aceptable', color: 'amber' };
  if (score >= 40) return { letter: 'D', label: 'Deficiente', color: 'orange' };
  return { letter: 'F', label: 'Crítico', color: 'red' };
}

function buildRecommendations(checks, regions, config) {
  const recs = [];
  const codes = new Set(checks.map(c => c.code));

  if (codes.has('DENSITY_CRITICAL') || codes.has('DENSITY_HIGH')) {
    recs.push({ priority: 1, text: 'Revisa la densidad de fill — usa 0.4–0.7 pts/mm para la mayoría de telas.' });
  }
  if (codes.has('MISSING_UNDERLAY')) {
    recs.push({ priority: 2, text: 'Añade underlay perimetral en rellenos grandes para estabilizar la tela.' });
  }
  if (codes.has('HIGH_THREAD_CHANGES') || codes.has('HIGH_JUMP_COUNT')) {
    recs.push({ priority: 3, text: 'Usa el Travel Optimizer para agrupar regiones del mismo color y minimizar saltos.' });
  }
  if (codes.has('SATIN_TOO_WIDE')) {
    recs.push({ priority: 4, text: 'Convierte satin > 12mm a fill Tatami para evitar puntadas flojas.' });
  }
  if (codes.has('TINY_REGION')) {
    recs.push({ priority: 5, text: 'Elimina regiones < 5mm² o cónviertalas a pespunte — son invisibles en producción.' });
  }
  if (codes.has('TOO_MANY_COLORS')) {
    recs.push({ priority: 6, text: 'Reduce la paleta de colores usando la herramienta de cuantización del editor.' });
  }
  if (codes.has('STITCH_TOO_LONG')) {
    recs.push({ priority: 7, text: 'Reduce la longitud máxima de puntada — asegúrate que ninguna supere 12mm.' });
  }
  if (codes.has('STITCH_ACCUMULATION')) {
    recs.push({ priority: 8, text: 'Revisa el orden de capas — evita solapar regiones del mismo color.' });
  }

  // Generic recommendation if score is perfect
  if (checks.length === 0) {
    recs.push({ priority: 0, text: 'Diseño en buen estado. Puedes exportar directamente.' });
  }

  return recs.sort((a, b) => a.priority - b.priority);
}