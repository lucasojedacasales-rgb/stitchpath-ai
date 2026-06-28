/**
 * adaptiveEngine.js — Motor de Bordado Adaptativo
 * ─────────────────────────────────────────────────────────────────────────────
 * Decide automáticamente por región:
 * - Tipo de puntada
 * - Densidad (espaciado entre líneas)
 * - Longitud de puntada
 * - Compensación de tracción
 * - Underlay + tipo
 * - Dirección (ángulo)
 * - Prioridad de ejecución
 *
 * Basado 100% en métricas geométricas. Sin parámetros fijos.
 */

// ─── Constants ─────────────────────────────────────────────────────────────

const STITCH_LENGTH_RANGE = { min: 1.0, max: 4.0 };  // mm
const DENSITY_RANGE = { min: 0.25, max: 2.0 };       // mm spacing
const COMPENSATION_RANGE = { min: 0.0, max: 0.25 };  // mm pull correction

// Thresholds de geometría para clasificación
const THRESHOLDS = {
  MIN_AREA_FOR_FILL: 15,      // mm² — bajo esto, mejor satin/run
  MIN_AREA_FOR_SATIN: 3,      // mm² — bajo esto, running stitch
  CONVEXITY_SATIN: 0.45,      // < 0.45 → forma alargada → satin
  ASPECT_RATIO_THIN: 2.5,     // inertia > 2.5 → forma muy fina
  CURVATURE_MEDIUM: 0.5,      // curvatura moderada
  CURVATURE_HIGH: 1.2,        // curvatura alta → más stitches
  COMPLEXITY_SIMPLE: 0.3,
  COMPLEXITY_MEDIUM: 0.6,
};

// ─── 1. Classificación de Tipo de Puntada ──────────────────────────────────

/**
 * Decide el tipo de puntada basado en todas las métricas.
 * Retorna { type, confidence, reasoning }
 */
export function decideStitchType(region) {
  const {
    area_mm2 = 0,
    avg_width_mm = 0,
    max_thickness_mm = 0,
    convexity = 0.5,
    inertia_ratio = 1.0,
    curvature = 0.0,
    complexity = { score: 0.5 },
    color = '#888888',
    semantic_object = null,
    semantic_class = null,
  } = region;

  const name = (region.name || '').toLowerCase();
  const semanticStr = `${semantic_object || ''} ${semantic_class || ''}`.toLowerCase();

  // ── Semantic override ──
  if (/outline|border|contorno|borde|edge/.test(name + semanticStr)) {
    return { type: 'running_stitch', confidence: 0.95, reasoning: 'Contorno semántico' };
  }
  if (/eye|ojo|pupil|pupila|highlight|reflejo/.test(name + semanticStr)) {
    return { type: 'satin', confidence: 0.92, reasoning: 'Detalle anatómico (ojo/reflejo)' };
  }
  if (/text|letra|letter|font|number/.test(name + semanticStr)) {
    return { type: 'satin', confidence: 0.90, reasoning: 'Texto/letra detectada' };
  }

  // ── Geometric classification ──
  const score = {};

  // Running stitch: áreas muy pequeñas, formas muy finas
  score.running = 0;
  if (area_mm2 < THRESHOLDS.MIN_AREA_FOR_SATIN) score.running += 0.8;
  if (avg_width_mm < 0.8) score.running += 0.6;
  if (convexity < 0.3 && inertia_ratio > 4) score.running += 0.5;

  // Satin: formas alargadas, medianas, curvas suaves
  score.satin = 0;
  if (area_mm2 < THRESHOLDS.MIN_AREA_FOR_FILL && area_mm2 >= THRESHOLDS.MIN_AREA_FOR_SATIN) {
    score.satin += 0.7;
  }
  if (avg_width_mm < 8 && (convexity < THRESHOLDS.CONVEXITY_SATIN || inertia_ratio > 2.2)) {
    score.satin += 0.6;
  }
  if (convexity < 0.4 && area_mm2 > 10) score.satin += 0.5;
  if (curvature > THRESHOLDS.CURVATURE_MEDIUM && curvature < THRESHOLDS.CURVATURE_HIGH) {
    score.satin += 0.3; // Curvas moderadas se ven mejor en satin
  }

  // Fill: áreas grandes, formas compactas
  score.fill = 0;
  if (area_mm2 >= THRESHOLDS.MIN_AREA_FOR_FILL) score.fill += 0.8;
  if (convexity >= THRESHOLDS.CONVEXITY_SATIN) score.fill += 0.7;
  if (complexity.score < THRESHOLDS.COMPLEXITY_MEDIUM) score.fill += 0.5;

  // Color claro grande → fill para cobertura
  const hex = color.toLowerCase();
  const r = parseInt(hex.slice(1, 3), 16) || 128;
  const g = parseInt(hex.slice(3, 5), 16) || 128;
  const b = parseInt(hex.slice(5, 7), 16) || 128;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luminance > 180 && area_mm2 > 50) score.fill += 0.3;

  // Determinar tipo ganador
  const entries = Object.entries(score).sort((a, b) => b[1] - a[1]);
  const [winType, winScore] = entries[0];
  const confidence = Math.min(1, winScore / 3);

  const typeMap = { running: 'running_stitch', satin: 'satin', fill: 'fill' };
  const reasoning =
    winScore === 0
      ? 'Fallback a fill (sin métricas decisivas)'
      : `Geom: area=${area_mm2.toFixed(0)}mm² convex=${convexity.toFixed(2)} inercia=${inertia_ratio.toFixed(1)}`;

  return {
    type: typeMap[winType] || 'fill',
    confidence: +confidence.toFixed(2),
    reasoning,
  };
}

// ─── 2. Densidad (espaciado entre líneas de relleno) ──────────────────────

/**
 * Densidad adapta a:
 * - Área: zonas grandes → menos densa (más espaciada)
 * - Ancho: zonas estrechas → más densa (cubrir bien)
 * - Complejidad: formas complejas → menos densa (evitar puntadas sueltas)
 * - Tipo de puntada: satin más densa que fill
 */
export function decideDensity(region, stitchType) {
  const {
    area_mm2 = 0,
    avg_width_mm = 0,
    complexity = { score: 0.5 },
  } = region;

  let base;

  if (stitchType === 'running_stitch') {
    base = 0.3; // running stitch: menos densidad, es solo contorno
  } else if (stitchType === 'satin') {
    // Satin: ancho determina espaciado de columnas
    if (avg_width_mm > 10) base = 0.40;
    else if (avg_width_mm > 6) base = 0.45;
    else if (avg_width_mm > 3) base = 0.50;
    else base = 0.55;
  } else {
    // Fill (tatami)
    if (area_mm2 > 500) base = 0.32;
    else if (area_mm2 > 300) base = 0.38;
    else if (area_mm2 > 150) base = 0.42;
    else if (area_mm2 > 50) base = 0.48;
    else if (area_mm2 > 15) base = 0.52;
    else base = 0.60;
  }

  // Ajuste por complejidad: formas complejas → menos densa
  const complexityPenalty = (complexity.score || 0.5) * 0.15;
  let final = base - complexityPenalty;

  // Ajuste por ancho: zona muy estrecha → más densa
  if (avg_width_mm < 2 && stitchType === 'satin') {
    final += 0.1;
  }

  return +Math.max(DENSITY_RANGE.min, Math.min(DENSITY_RANGE.max, final)).toFixed(2);
}

// ─── 3. Longitud de Puntada (stitch length) ────────────────────────────────

/**
 * Longitud se adapta a:
 * - Curvatura: alta curvatura → stitches cortos
 * - Complejidad: alta complejidad → stitches cortos
 * - Tipo: running stitch → más largo
 */
export function decideStitchLength(region, stitchType) {
  const {
    curvature = 0.0,
    complexity = { score: 0.5 },
    area_mm2 = 0,
  } = region;

  let base;

  if (stitchType === 'running_stitch') {
    base = 2.5; // pespunte: stitches moderados
  } else if (stitchType === 'satin') {
    base = 2.2; // satén: un poco más corto para definición
  } else {
    base = 2.8; // fill: tatami estándar
  }

  // Penalización por curvatura: curvas altas → stitches más cortos
  const curvaturePenalty = Math.min(0.8, curvature * 0.5);
  let final = base - curvaturePenalty;

  // Penalización por complejidad
  const complexityPenalty = (complexity.score || 0.5) * 0.3;
  final -= complexityPenalty;

  // Bonus para áreas muy grandes: pueden permitir stitches un poco más largos
  if (area_mm2 > 400 && stitchType === 'fill') {
    final += 0.2;
  }

  return +Math.max(STITCH_LENGTH_RANGE.min, Math.min(STITCH_LENGTH_RANGE.max, final)).toFixed(2);
}

// ─── 4. Compensación de Tracción (Pull Compensation) ──────────────────────

/**
 * Cuánto "estirar" los stitches para compensar el tirón del tejido.
 * - Áreas grandes → más tracción → más compensación
 * - Formas complejas → más movimiento → más compensación
 * - Tejidos elásticos → más tracción (en config de fabric)
 */
export function decidePullCompensation(region, fabric = 'Algodón') {
  const {
    area_mm2 = 0,
    max_thickness_mm = 0,
    complexity = { score: 0.5 },
    convexity = 0.5,
  } = region;

  let base = 0.10; // compensación base

  // Áreas grandes tiran más
  if (area_mm2 > 400) base += 0.08;
  else if (area_mm2 > 200) base += 0.05;
  else if (area_mm2 > 80) base += 0.03;

  // Formas concavas (con dientes/salientes) tiran más
  const concavity = 1 - convexity;
  if (concavity > 0.4) base += 0.05;

  // Complejidad alta → más movimiento → más tracción
  if ((complexity.score || 0.5) > THRESHOLDS.COMPLEXITY_MEDIUM) {
    base += 0.05;
  }

  // Ajuste por tipo de tejido (multiplicador)
  const fabricMults = {
    Algodón: 1.0,
    Poliéster: 1.05,
    Denim: 1.15,
    Lino: 1.08,
    Seda: 0.85,
    Lycra: 1.25,
    Mezcla: 1.02,
    Otro: 1.0,
  };
  const mult = fabricMults[fabric] || 1.0;
  let final = base * mult;

  return +Math.max(COMPENSATION_RANGE.min, Math.min(COMPENSATION_RANGE.max, final)).toFixed(3);
}

// ─── 5. Underlay (capa base) ───────────────────────────────────────────────

/**
 * Decide si underlay es necesario y de qué tipo.
 * - Running stitch: nunca
 * - Satin: sí, si es lo suficientemente ancho
 * - Fill: sí, casi siempre (excepto muy pequeños)
 */
export function decideUnderlay(region, stitchType, fabric = 'Algodón') {
  if (stitchType === 'running_stitch') {
    return { enabled: false, type: null, density: null };
  }

  const {
    area_mm2 = 0,
    avg_width_mm = 0,
    convexity = 0.5,
  } = region;

  const isStretch = ['Lycra'].includes(fabric);
  const isDense = ['Denim', 'Lino'].includes(fabric);

  // ── Satin underlay ──
  if (stitchType === 'satin') {
    if (avg_width_mm < 3) {
      return { enabled: false, type: null };
    }
    const underlayDensity = avg_width_mm > 8 ? 1.0 : 1.2;
    return {
      enabled: true,
      type: 'center_run',
      density: underlayDensity,
      angle: 90,
      reasoning: `Satén ancho (${avg_width_mm.toFixed(1)}mm) → run central`,
    };
  }

  // ── Fill underlay ──
  if (area_mm2 < 15) {
    return { enabled: false, type: null };
  }

  if (isStretch) {
    return {
      enabled: true,
      type: 'zigzag_plus_edge',
      density: 0.7,
      angle: 45,
      reasoning: 'Tejido elástico → zigzag + perimetral',
    };
  }

  if (area_mm2 > 500) {
    return {
      enabled: true,
      type: 'grid',
      density: 0.8,
      angle: 45,
      reasoning: `Zona muy grande (${area_mm2.toFixed(0)}mm²) → grid`,
    };
  }

  if (area_mm2 > 150 || isDense) {
    return {
      enabled: true,
      type: 'edge_run_plus_zigzag',
      density: 0.9,
      angle: 45,
      reasoning: 'Zona amplia → perimetral + zigzag',
    };
  }

  return {
    enabled: true,
    type: 'edge_run',
    density: 1.0,
    angle: 0,
    reasoning: `Zona mediana (${area_mm2.toFixed(0)}mm²) → run perimetral`,
  };
}

// ─── 6. Dirección (Angle) ──────────────────────────────────────────────────

/**
 * Calcula ángulo de relleno adaptativo.
 * - Usa PCA (principal component analysis) de la región si está disponible
 * - Fallback a color coherente (mismo color → mismo ángulo determinístico)
 */
export function decideAngle(region) {
  const { orientation = null, _metrics = {}, color = '#888888' } = region;

  // Preferencia 1: PCA calculado por regionBuilder
  if (orientation !== null && orientation !== undefined) {
    return {
      angle: orientation,
      source: 'pca',
      confidence: 0.95,
      reasoning: 'PCA (análisis de componentes principales)',
    };
  }

  // Preferencia 2: Fill angle pre-calculado por vectorizador
  if (_metrics.fill_angle !== null && _metrics.fill_angle !== undefined) {
    return {
      angle: _metrics.fill_angle,
      source: 'vectorizer',
      confidence: 0.88,
      reasoning: 'Ángulo del vectorizador',
    };
  }

  // Fallback 3: Color coherente determinístico
  const colorSeed = parseInt(color.replace('#', '').slice(0, 2), 16) || 0;
  const deterministicAngle = (colorSeed * 53) % 180;

  return {
    angle: deterministicAngle,
    source: 'color_coherent',
    confidence: 0.70,
    reasoning: `Ángulo coherente por color (determinístico: color=${color})`,
  };
}

// ─── 7. Prioridad de Ejecución ────────────────────────────────────────────

/**
 * Define orden de ejecución: background primero, detalles último.
 * Basado en área, tipo y semántica.
 */
export function decidePriority(region, stitchType) {
  const {
    area_mm2 = 0,
    complexity = { score: 0.5 },
    semantic_class = null,
  } = region;

  let priority = 3; // default: media

  // Semantic hints
  if (/background|fondo|sky|cielo/.test((region.name || '') + (semantic_class || ''))) {
    priority = 1; // fondos primero (base)
  } else if (/outline|contorno|edge/.test((region.name || '') + (semantic_class || ''))) {
    priority = 5; // contornos último (detalles finales)
  }

  // Geometric cues (si no hay semantic)
  if (semantic_class === null || semantic_class === '') {
    if (area_mm2 > 400) priority = 1; // zonas grandes = fondo/base
    else if (area_mm2 > 150) priority = 2;
    else if (area_mm2 > 50) priority = 3;
    else if (area_mm2 > 15) priority = 4;
    else priority = 5; // detalles pequeños = último

    // Ajuste por tipo: running stitch contornos → más alto
    if (stitchType === 'running_stitch') priority = Math.max(priority, 4);
  }

  return +Math.max(1, Math.min(5, priority)).toFixed(0);
}

// ─── 8. MAIN: Decisión Integral ────────────────────────────────────────────

/**
 * Computa TODAS las decisiones adaptativas para una región.
 * Retorna objeto con todas las recomendaciones + reasoning + confidence.
 *
 * @param {Object} region - región con métricas de regionBuilder
 * @param {Object} config - { fabric_type, ... }
 * @returns {Object} decisiones adaptativas
 */
export function computeAdaptiveDecisions(region, config = {}) {
  if (!region) return null;

  const { fabric_type = 'Algodón' } = config;

  // 1. Tipo de puntada (base para todo lo demás)
  const stitchDecision = decideStitchType(region);
  const stitchType = stitchDecision.type;

  // 2. Parámetros adaptativos
  const density = decideDensity(region, stitchType);
  const stitchLength = decideStitchLength(region, stitchType);
  const pullComp = decidePullCompensation(region, fabric_type);
  const underlay = decideUnderlay(region, stitchType, fabric_type);
  const angleDecision = decideAngle(region);
  const priority = decidePriority(region, stitchType);

  // 3. Compilar respuesta
  return {
    // ── Decisiones ──
    stitch_type: stitchType,
    density,
    stitch_length: stitchLength,
    pull_compensation: pullComp,
    underlay: underlay.enabled ? underlay.type : null,
    underlay_config: underlay,
    angle: angleDecision.angle,
    priority,

    // ── Confianza y Reasoning ──
    _adaptive: {
      stitch_type_confidence: stitchDecision.confidence,
      stitch_type_reasoning: stitchDecision.reasoning,
      angle_source: angleDecision.source,
      angle_confidence: angleDecision.confidence,
      underlay_reasoning: underlay.reasoning || null,
      overall_confidence: +(
        (stitchDecision.confidence * 0.4 +
          angleDecision.confidence * 0.3 +
          0.85 * 0.3) /
        1.0
      ).toFixed(2),
    },

    // ── Métricas usadas (para auditoría + learning) ──
    _metrics_used: {
      area_mm2: region.area_mm2,
      avg_width_mm: region.avg_width_mm,
      max_thickness_mm: region.max_thickness_mm,
      convexity: region.convexity,
      curvature: region.curvature,
      complexity_score: region.complexity?.score,
      inertia_ratio: region._metrics?.inertia_ratio,
      fill_angle: region._metrics?.fill_angle,
    },
  };
}

/**
 * Procesa todas las regiones con decisiones adaptativas.
 */
export function computeAllAdaptiveDecisions(regions, config = {}) {
  return regions.map(r => ({
    ...r,
    ...computeAdaptiveDecisions(r, config),
  }));
}