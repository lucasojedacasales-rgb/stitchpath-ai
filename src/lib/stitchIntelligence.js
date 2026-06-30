/**
 * Embroidery Intelligence Engine (EIE)
 * ─────────────────────────────────────────────────────────────────────────────
 * A professional-grade decision system that replicates — and extends — the
 * judgment of a senior embroidery digitizer.
 *
 * Based on:
 *  • Wilcom EmbroideryStudio reference parameters
 *  • StitchFast technical density/compensation guide
 *  • Barudan/Tajima machine spec sheets (DST/PES format limits)
 *  • Empirical data from professional digitizers (pull comp by fabric/width)
 *
 * Architecture:
 *  Each of the 8 decision functions is independent and returns a {value, rationale}
 *  pair so the UI can display full transparency into every decision made.
 *
 *  eieAnalyzeRegion(geo, fabric, context) → EIEResult
 *   ├── stitchType()         → 'fill' | 'satin' | 'running_stitch' | 'motif'
 *   ├── fillAngle()          → degrees [0, 180)
 *   ├── density()            → mm between rows [0.28–0.65]
 *   ├── pullCompensation()   → mm width expansion [0.0–0.8]
 *   ├── pushCompensation()   → mm length expansion [0.0–0.5]
 *   ├── underlay()           → { type, density_mm, angle_deg }
 *   ├── buildPriority()      → [1, 10] — layer stacking order
 *   └── travelScore()        → cost heuristic for TSP ordering
 *
 * All functions operate on normalised geometric descriptors (EIEGeo).
 * Physical units are in mm; the caller is responsible for mm conversion.
 */

// ─── Physical constants (40wt polyester thread, standard needle) ──────────────

const THREAD = {
  diameter_fill:    0.38,   // mm — effective diameter for fill spacing
  diameter_satin:   0.35,   // mm — effective diameter for satin spacing
  diameter_running: 0.25,   // mm — effective diameter for running stitch
  min_stitch_mm:    1.5,    // machine minimum stitch length
  max_stitch_mm:    12.7,   // Tajima spec maximum (0.5 inch)
  max_jump_mm:      12.0,   // max jump before forced trim
};

// ─── Fabric physics model (empirically calibrated) ────────────────────────────
// Each entry: { pull_factor, push_factor, density_adj, stabiliser_need }
// pull_factor : multiplier for lateral pull compensation (1.0 = cotton baseline)
// push_factor : multiplier for longitudinal push compensation
// density_adj : additive mm adjustment (negative = denser needed)
// stabiliser_need: 0 (minimal) → 3 (heavy) — advisory only

export const FABRIC_MODEL = {
  // MEJORA 2: Lycra necesita MÁS densidad (density_adj positivo = filas más juntas = más cobertura)
  // porque la tela elástica estira entre puntadas, dejando huecos visibles con densidades bajas.
  // Valor anterior: -0.07 (incorrecto — abría el espaciado). Corregido a +0.07.
  'Lycra':     { pull_factor: 2.20, push_factor: 1.80, density_adj: +0.07, stabiliser_need: 3 },
  'Mezcla':    { pull_factor: 1.35, push_factor: 1.20, density_adj: -0.03, stabiliser_need: 2 },
  'Algodón':   { pull_factor: 1.00, push_factor: 1.00, density_adj:  0.00, stabiliser_need: 1 },
  'Denim':     { pull_factor: 0.78, push_factor: 0.85, density_adj:  0.05, stabiliser_need: 1 },
  'Lino':      { pull_factor: 0.70, push_factor: 0.80, density_adj:  0.08, stabiliser_need: 2 },
  'Poliéster': { pull_factor: 0.55, push_factor: 0.65, density_adj:  0.02, stabiliser_need: 1 },
  'Seda':      { pull_factor: 0.40, push_factor: 0.50, density_adj:  0.10, stabiliser_need: 3 },
  'Otro':      { pull_factor: 1.20, push_factor: 1.10, density_adj:  0.00, stabiliser_need: 2 },
};

// ─── Stitch type thresholds (FASE 2 — clasificación automática refinada) ──────
//
//  REGLA 1: Muy pequeña  → running_stitch  (area < 6mm² ó width < 1.5mm)
//  REGLA 2: Estrecha     → satin           (width 1.5–7mm, convexa, area < 150mm²)
//  REGLA 3: Grande       → fill            (area >= 80mm² ó width > 7mm)
//  REGLA 4: Extrema      → fill dividido   (area >= 600mm² → flag split_fill)
//  NUNCA satin si width > SATIN_WIDTH_HARD  (puckering irreversible)
//  NUNCA fill si width < FILL_WIDTH_MIN     (huecos entre filas visibles)

const SATIN_WIDTH_MAX      = 7.0;   // mm — BAJADO de 8→7: margen de seguridad extra
const SATIN_WIDTH_HARD     = 7.0;   // mm — límite absoluto: por encima → fill siempre
const SATIN_WIDTH_IDEAL    = 4.5;   // mm — sweet spot para mayor calidad
const FILL_AREA_MIN        = 10.0;  // mm² — fill mínimo viable (filas completas)
const FILL_WIDTH_MIN       = 2.5;   // mm — NUNCA fill en zonas más estrechas que esto
const RUNNING_AREA_MAX     = 6.0;   // mm² — SUBIDO de 4→6: más micro-regiones → run
const RUNNING_WIDTH_MAX    = 1.5;   // mm — hairlines → running stitch
const SPLIT_FILL_AREA      = 600.0; // mm² — fill extremadamente grande → flag para división

// ─── 1. Stitch Type ───────────────────────────────────────────────────────────

/**
 * Multi-signal decision tree for stitch type.
 * Signals, in priority order:
 *   S1: Hairline / filiform → running_stitch
 *   S2: Micro area → running_stitch
 *   S3: Narrow + convex + not too long → satin
 *   S4: Very elongated thin strip → satin (border/stripe)
 *   S5: Default → fill (tatami)
 *
 * Returns { type, confidence, rationale, signals }
 */
export function eieStitchType(geo) {
  const { area_mm2, mean_width_mm, max_width_mm, skeleton_length_mm,
          convexity, complexity, mean_curvature, holes } = geo;

  const elongation = skeleton_length_mm / Math.max(0.1, mean_width_mm);
  const signals = [];

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 2 — Árbol de decisión determinista con gates absolutos
  // Orden: Running → Satin → Fill → Fill grande → Fill dividido
  // Los overrides de usuario se aplican en eieAnalyzeRegion, no aquí.
  // ═══════════════════════════════════════════════════════════════════════

  // ── GATE R1: Filamento / hairline → running_stitch ───────────────────────
  // Forma demasiado estrecha para sostener una fila de fill completa.
  if (mean_width_mm <= RUNNING_WIDTH_MAX && elongation > 2) {
    return {
      type: 'running_stitch', confidence: 0.97,
      rationale: `Filamento: ancho=${mean_width_mm.toFixed(1)}mm ≤ ${RUNNING_WIDTH_MAX}mm, elon=${elongation.toFixed(1)}× → running obligatorio.`,
      signals: [{ id: 'R1_hairline', weight: 1.0, fired: true }],
    };
  }

  // ── GATE R2: Micro-área → running_stitch ────────────────────────────────
  // Área demasiado pequeña para tatami o satin con cobertura aceptable.
  if (area_mm2 < RUNNING_AREA_MAX) {
    return {
      type: 'running_stitch', confidence: 0.95,
      rationale: `Micro-área: ${area_mm2.toFixed(1)}mm² < ${RUNNING_AREA_MAX}mm² → running stitch único viable.`,
      signals: [{ id: 'R2_micro', weight: 1.0, fired: true }],
    };
  }

  // ── GATE F1: Ancho máximo supera límite absoluto de satin → fill ─────────
  // NUNCA usar satin en zonas más anchas que SATIN_WIDTH_HARD.
  // El satin ancho puckerea la tela de forma irreversible.
  if (max_width_mm > SATIN_WIDTH_HARD) {
    const isSplit = area_mm2 >= SPLIT_FILL_AREA;
    return {
      type: 'fill', confidence: 0.96,
      rationale: `Fill forzado: ancho máximo ${max_width_mm.toFixed(1)}mm > ${SATIN_WIDTH_HARD}mm (límite satin absoluto).${isSplit ? ' [split_fill recomendado]' : ''}`,
      signals: [{ id: 'F1_width_hard', weight: 1.0, fired: true }],
      split_fill: isSplit,
    };
  }

  // ── GATE F2: Área extremadamente grande → fill (con flag de división) ────
  // Fill > 600mm²: en bordado físico produce distorsión severa si no se divide.
  // Se pasa split_fill=true para que el digitizador pueda subdividir la región.
  if (area_mm2 >= SPLIT_FILL_AREA) {
    return {
      type: 'fill', confidence: 0.95,
      rationale: `Fill dividido: área=${area_mm2.toFixed(0)}mm² ≥ ${SPLIT_FILL_AREA}mm² — región extrema, requiere subdivisión para prevenir distorsión.`,
      signals: [{ id: 'F2_split_fill', weight: 1.0, fired: true }],
      split_fill: true,
    };
  }

  // ── GATE F3: Área grande → fill directo ──────────────────────────────────
  // Por encima de 80mm² el satin no puede cubrir la región sin puckering.
  if (area_mm2 >= 80) {
    const conf = Math.min(0.95, 0.75 + Math.min(0.20, (area_mm2 - 80) / 1000));
    return {
      type: 'fill', confidence: +conf.toFixed(2),
      rationale: `Fill: área=${area_mm2.toFixed(0)}mm² ≥ 80mm² — satin causaría puckering en zona ancha.`,
      signals: [{ id: 'F3_large_area', weight: 1.0, fired: true }],
    };
  }

  // ── GATE F4: Concavidad alta + área media → fill ─────────────────────────
  // Convexity < 0.40: forma cóncava — satin generaría solapamientos internos.
  // (preservado de Mejora 1 — sigue siendo correcto)
  if (convexity < 0.40 && area_mm2 > 30) {
    return {
      type: 'fill', confidence: 0.88,
      rationale: `Fill forzado: convexidad=${convexity.toFixed(2)} < 0.40 con área=${area_mm2.toFixed(0)}mm² — satin crearía solapamientos irrecuperables.`,
      signals: [{ id: 'F4_concave', weight: 1.0, fired: true }],
    };
  }

  // ── GATE F5: Zona demasiado estrecha para fill → satin o running ──────────
  // NUNCA fill si mean_width < FILL_WIDTH_MIN: las filas de tatami no caben,
  // dejando huecos visibles entre filas.
  if (mean_width_mm < FILL_WIDTH_MIN) {
    // Si además es muy pequeña → running; si no → satin
    if (area_mm2 < 15 || elongation > 5) {
      return {
        type: 'running_stitch', confidence: 0.90,
        rationale: `Running: ancho=${mean_width_mm.toFixed(1)}mm < ${FILL_WIDTH_MIN}mm (fill inviable) + área pequeña/elongada.`,
        signals: [{ id: 'F5_narrow_run', weight: 1.0, fired: true }],
      };
    }
    return {
      type: 'satin', confidence: 0.88,
      rationale: `Satin forzado: ancho=${mean_width_mm.toFixed(1)}mm < ${FILL_WIDTH_MIN}mm — fill dejaría huecos entre filas.`,
      signals: [{ id: 'F5_narrow_satin', weight: 1.0, fired: true }],
    };
  }

  // ── ZONA SATIN: width 2.5–7mm, area < 80mm², convexa ────────────────────
  // Aquí la región puede ser satin O fill según geometría.
  // Usar scoring para decidir con evidencia múltiple.
  let satinScore = 0, fillScore = 0;

  const satinWidthOk   = mean_width_mm <= SATIN_WIDTH_MAX;    // ancho dentro del límite
  const satinConvex    = convexity > 0.55;                     // forma convexa
  const satinSimple    = complexity.score < 0.55;              // geometría simple
  const satinElongated = elongation > 1.8;                     // forma alargada = columna típica
  const satinNarrow    = mean_width_mm < 5.0;                  // ancho ideal satin
  const noHoles        = holes === 0;                          // sin agujeros internos

  if (satinWidthOk)   { satinScore += 0.25; signals.push({ id: 'satin_width_ok',   weight:  0.25, fired: true }); }
  if (satinConvex)    { satinScore += 0.25; signals.push({ id: 'satin_convex',     weight:  0.25, fired: true }); }
  if (satinSimple)    { satinScore += 0.15; signals.push({ id: 'satin_simple',     weight:  0.15, fired: true }); }
  if (satinElongated) { satinScore += 0.20; signals.push({ id: 'satin_elongated',  weight:  0.20, fired: true }); }
  if (satinNarrow)    { satinScore += 0.15; signals.push({ id: 'satin_narrow',     weight:  0.15, fired: true }); }
  if (noHoles)        { satinScore += 0.05; signals.push({ id: 'satin_no_holes',   weight:  0.05, fired: true }); }

  // Penalizaciones duras para satin
  if (!satinConvex)   { satinScore -= 0.35; signals.push({ id: 'satin_concave',    weight: -0.35, fired: true }); }
  if (holes > 0)      { satinScore -= 0.40; signals.push({ id: 'satin_holes',      weight: -0.40, fired: true }); }
  if (area_mm2 > 50)  { satinScore -= 0.15; signals.push({ id: 'satin_area_med',   weight: -0.15, fired: true }); }

  // Fill scoring
  if (area_mm2 > FILL_AREA_MIN) { fillScore += 0.40; }
  if (convexity > 0.40)         { fillScore += 0.15; }
  if (area_mm2 > 40)            { fillScore += 0.20; }
  if (holes > 0)                { fillScore += 0.30; }
  if (complexity.level !== 'simple') { fillScore += 0.10; }

  // Umbral satin: 0.65 — evidencia sólida requerida
  if (satinScore >= 0.65) {
    const conf = Math.min(0.95, 0.55 + satinScore * 0.35);
    return {
      type: 'satin', confidence: +conf.toFixed(2),
      rationale: `Satin: w=${mean_width_mm.toFixed(1)}mm, elon=${elongation.toFixed(1)}×, convex=${convexity.toFixed(2)}, score=${satinScore.toFixed(2)}.`,
      signals,
    };
  }

  // Default → fill
  const conf = Math.min(0.92, 0.55 + (fillScore / 1.15) * 0.40);
  return {
    type: 'fill', confidence: +conf.toFixed(2),
    rationale: `Fill tatami: área=${area_mm2.toFixed(0)}mm², ancho=${mean_width_mm.toFixed(1)}mm, convex=${convexity.toFixed(2)}.`,
    signals,
  };
}

// ─── 2. Fill Angle ────────────────────────────────────────────────────────────

/**
 * FASE 3 — Dirección inteligente del relleno
 *
 * Señales aplicadas en orden de prioridad descendente:
 *   A1: PCA orientation  — eje de masa principal de la región
 *   A2: Perpendicular    — formas muy elongadas: puntadas ⊥ al eje largo
 *   A3: Anti-grain bias  — eje ≈ 0°/180° en formas convexas → 45° (evita trampolín)
 *   A4: Curvature flow   — curvatura media ajusta el ángulo para seguir el flujo de curvas
 *                          (activa desde 0.3 para mayor sensibilidad, no solo >0.7)
 *   A5: Volume signal    — compacidad alta (círculo/cuadrado) → 45° da volumen al centro
 *   A6: Neighbour diverge — si dos regiones contiguas tendrían exactamente el mismo
 *                           ángulo, desviamos ±20° al vecino más pequeño para
 *                           garantizar diferenciación visual sin seam duro
 *
 * Reglas de producción preservadas:
 *   - overrides del usuario se aplican en eieAnalyzeRegion (aquí se ignoran)
 *   - resultado siempre en [0, 180) grados enteros
 *   - cada decisión se registra en rationale y signals para transparencia
 *
 * Returns { angle_deg, rationale, signals }
 */
export function eieFillAngle(geo, context = {}) {
  const { orientation, skeleton_length_mm, mean_width_mm, mean_curvature, convexity, area_mm2 } = geo;
  const elongation = skeleton_length_mm / Math.max(0.1, mean_width_mm);

  const signals = [];
  let angle = orientation != null ? orientation : 45;
  const decisions = [];

  // A1 — PCA baseline: eje de masa principal (no se cambia aquí, solo se registra)
  decisions.push(`A1: eje PCA = ${angle}°`);
  signals.push({ id: 'A1_pca', angle, weight: 1.0 });

  // A2 — Perpendicular: formas muy elongadas (tiras, contornos)
  // Las puntadas paralelas al eje largo de una tira producen un aspecto plano;
  // perpendiculares dan volumen y mejor cobertura en los extremos.
  if (elongation > 3.0) {
    angle = (angle + 90) % 180;
    decisions.push(`A2: elongación=${elongation.toFixed(1)}× → perpendicular ${angle}°`);
    signals.push({ id: 'A2_elongated', angle, weight: 0.9 });
  }

  // A3 — Anti-grain: eje ≈ horizontal/vertical en formas convexas → 45°
  // Puntadas paralelas al grano de tela producen "trampolín" (efecto trampoline).
  // Solo aplica si la forma es suficientemente convexa (no concavidades complejas).
  if ((angle < 25 || angle > 155) && convexity > 0.65) {
    angle = 45;
    decisions.push(`A3: eje casi h/v (${angle}°), convex=${convexity.toFixed(2)} → bias 45°`);
    signals.push({ id: 'A3_axis_bias', angle: 45, weight: 0.8 });
  }

  // A4 — Curvature flow: el ángulo gira con el flujo de curvas de la región
  // FASE 3 FIX: umbral bajado 0.7→0.3 para capturar curvas suaves también.
  // La fórmula escala linealmente entre 0° (recta) y 45° (curva pronunciada).
  if (mean_curvature > 0.3) {
    // curveAdj: 0° @ curvature=0.3, 45° @ curvature≥1.5 — interpolación lineal
    const curveAdj = Math.round(Math.min(45, ((mean_curvature - 0.3) / 1.2) * 45));
    if (curveAdj > 0) {
      angle = (angle + curveAdj) % 180;
      decisions.push(`A4: curvatura=${mean_curvature.toFixed(2)} → flujo +${curveAdj}° → ${angle}°`);
      signals.push({ id: 'A4_curvature_flow', angle, weight: 0.7 });
    }
  }

  // A5 — Volume signal: formas compactas (near-circular/square) se ven más
  // volumétricas con 45° porque las puntadas capturan luz desde múltiples ejes.
  // Aplica solo si no se ha aplicado ya A3 (que también lleva a 45°).
  const isCompact = convexity > 0.80 && elongation < 1.5;
  const alreadyAt45 = Math.abs(angle - 45) < 10;
  if (isCompact && !alreadyAt45) {
    // Blend suave hacia 45°: 30% del recorrido angular (no snap duro)
    const delta = ((45 - angle + 270) % 180) - 90; // diferencia con signo [-90, 90]
    angle = Math.round((angle + delta * 0.30 + 360) % 180);
    decisions.push(`A5: forma compacta (convex=${convexity.toFixed(2)}, elon=${elongation.toFixed(1)}) → volumen blend → ${angle}°`);
    signals.push({ id: 'A5_volume', angle, weight: 0.5 });
  }

  // A6 — Neighbour divergence: garantizar ángulo diferente en regiones contiguas
  // FASE 3 FIX: la lógica anterior (A5) solo hacía snap si diff∈(70°,110°),
  // lo que dejaba pasar casos con diferencias de 0–10° (aspecto idéntico).
  // Nueva regla: si la diferencia con el vecino es < 20°, desviamos ±20°
  // en la dirección que más se aleja del vecino (sin colapsar a su ángulo).
  if (context.neighbourAngle != null) {
    const neighbourAngle = context.neighbourAngle;
    const rawDiff = ((angle - neighbourAngle + 360) % 180); // [0, 180)
    const absDiff = rawDiff > 90 ? 180 - rawDiff : rawDiff; // [0, 90]

    if (absDiff < 20) {
      // Demasiado similar — desviamos 20° en dirección opuesta al vecino
      const sign = rawDiff <= 90 ? +1 : -1;
      angle = ((angle + sign * 20) + 360) % 180;
      decisions.push(`A6: vecino=${neighbourAngle}° dif=${absDiff}°<20° → divergencia +${sign * 20}° → ${angle}°`);
      signals.push({ id: 'A6_neighbour_diverge', angle, weight: 0.6 });
    } else if (absDiff > 70 && absDiff < 110) {
      // Diferencia jarring (cerca de perpendicular) — snap al vecino para armonía
      angle = neighbourAngle;
      decisions.push(`A6: vecino=${neighbourAngle}° dif=${absDiff}°∈(70°,110°) → armonía snap → ${angle}°`);
      signals.push({ id: 'A6_neighbour_harmony', angle, weight: 0.5 });
    }
    // dif∈[20°, 70°] o [110°,160°]: diferencia natural, no intervenir
  }

  return {
    angle_deg: Math.round(((angle % 180) + 180) % 180), // garantizar [0, 180)
    rationale: decisions.join(' → '),
    signals,
  };
}

// ─── 3. Density ───────────────────────────────────────────────────────────────

/**
 * Computes row spacing in mm.
 * Professional target ranges:
 *   Badges/patches : 0.28–0.34 (dense, full coverage)
 *   Standard logos : 0.38–0.45 (balanced)
 *   Lightweight    : 0.50–0.65 (airy, avoids puckering)
 *
 * Pull–density coupling: higher density → more pull → must be co-adjusted.
 * Returns { density_mm, rationale }
 */
export function eieDensity(geo, stitchType, fabricType = 'Algodón') {
  if (stitchType === 'running_stitch') return { density_mm: 0, rationale: 'Running stitch: densidad no aplica.' };

  const fabric = FABRIC_MODEL[fabricType] || FABRIC_MODEL['Algodón'];
  const { area_mm2, mean_width_mm, complexity, convexity, mean_curvature } = geo;
  const reasons = [];

  let d;

  if (stitchType === 'satin') {
    // Satin: base 0.40mm, scale by width and fabric
    d = 0.40;
    if (mean_width_mm < 2.5) { d = 0.30; reasons.push('satin estrecho → denso 0.30'); }
    else if (mean_width_mm < 4) { d = 0.35; reasons.push(`satin medio (${mean_width_mm.toFixed(1)}mm) → 0.35`); }
    else if (mean_width_mm > 6) { d = 0.48; reasons.push(`satin ancho (${mean_width_mm.toFixed(1)}mm) → 0.48`); }
    // Fabric correction
    d += fabric.density_adj * 0.6;
    reasons.push(`tejido ${fabricType}: Δ${(fabric.density_adj * 0.6).toFixed(3)}`);
  } else {
    // Fill (tatami) — 3-band base
    if (area_mm2 < 20) {
      d = 0.32; reasons.push(`micro-fill (${area_mm2.toFixed(0)}mm²) → denso 0.32`);
    } else if (area_mm2 < 80) {
      d = 0.36; reasons.push(`fill pequeño (${area_mm2.toFixed(0)}mm²) → 0.36`);
    } else if (area_mm2 < 300) {
      d = 0.40; reasons.push(`fill estándar (${area_mm2.toFixed(0)}mm²) → 0.40`);
    } else {
      // Large fills: stay at 0.42mm — opening higher causes bald spots on cotton
      d = 0.42; reasons.push(`fill grande (${area_mm2.toFixed(0)}mm²) → base 0.42`);
    }

    // Complexity correction (complex shapes need more coverage)
    const compAdj = -(complexity.score * 0.07);
    d += compAdj;
    if (Math.abs(compAdj) > 0.005) reasons.push(`complejidad=${complexity.level} → ${compAdj > 0 ? '+' : ''}${compAdj.toFixed(3)}`);

    // Convexity correction (concave shapes lose coverage at edges)
    const convAdj = -((1 - convexity) * 0.04);
    d += convAdj;
    if (Math.abs(convAdj) > 0.005) reasons.push(`convexidad=${convexity.toFixed(2)} → ${convAdj.toFixed(3)}`);

    // Curvature correction
    const curvAdj = -(Math.min(0.05, mean_curvature * 0.03));
    d += curvAdj;

    // Fabric correction
    d += fabric.density_adj;
    reasons.push(`tejido ${fabricType}: Δ${fabric.density_adj.toFixed(3)}`);

    // Large simple areas: slight efficiency open-up, capped at 0.45mm (professional ceiling)
    if (area_mm2 > 400 && complexity.level === 'simple') {
      d = Math.min(d + 0.03, 0.45); reasons.push('área grande simple → ligera apertura (eficiencia)');
    }
  }

  const clamped = +Math.max(0.28, Math.min(0.65, d)).toFixed(3);
  return { density_mm: clamped, rationale: reasons.join(', ') };
}

// ─── 4. Pull Compensation ─────────────────────────────────────────────────────

/**
 * FASE 5 — Pull compensation lateral (expansión de ancho).
 *
 * La aguja tira la tela hacia dentro al salir; el hilo encoge el ancho real
 * del elemento bordado. Compensación = ensanchar el polígono antes de bordar.
 *
 * Variables consideradas:
 *   - tipo de puntada (satin / fill)
 *   - ancho medio del elemento (satin: más ancho → más pull)
 *   - densidad (denser → más tensión acumulada)
 *   - material (FABRIC_MODEL.pull_factor)
 *   - FASE 5 NEW: ángulo de relleno (fill_angle_deg)
 *     Las puntadas diagonales (45°) distribuyen la tensión de forma más uniforme
 *     que las horizontales/verticales → menor pull efectivo.
 *     Reducción máxima en 45°: -12% pull. En 0°/90°: 0%.
 *
 * Referencia: Wilcom EmbroideryStudio pull comp guide (cotton baseline).
 * Returns { compensation_mm, rationale }
 */
export function eiePullCompensation(geo, stitchType, fabricType = 'Algodón', density_mm = 0.40, fill_angle_deg = 45) {
  if (stitchType === 'running_stitch') return { compensation_mm: 0, rationale: 'Running stitch: sin pull comp.' };

  const fabric = FABRIC_MODEL[fabricType] || FABRIC_MODEL['Algodón'];
  const { mean_width_mm, area_mm2, skeleton_length_mm, complexity } = geo;
  const reasons = [];

  let comp;

  if (stitchType === 'satin') {
    // Wilcom reference: 0.15mm @ 2mm width, 0.35mm @ 8mm width (cotton baseline)
    const baseComp = 0.15 + ((mean_width_mm - 2) / 6) * 0.20;
    comp = Math.max(0.10, baseComp) * fabric.pull_factor;
    reasons.push(`base=${baseComp.toFixed(3)}mm × fabric=${fabric.pull_factor} (${fabricType})`);

    // Density coupling: denser satin → more tension
    const densAdj = (0.40 - density_mm) * 0.4;
    comp += densAdj;
    if (Math.abs(densAdj) > 0.01) reasons.push(`dens-coupling: ${densAdj >= 0 ? '+' : ''}${densAdj.toFixed(3)}`);

    // Long columns accumulate more push at ends → slight reduction in width comp
    if (skeleton_length_mm > 25) {
      comp -= 0.03;
      reasons.push('col.larga>25mm: -0.030');
    }
  } else {
    // Fill pull compensation
    const baseComp = 0.18 * fabric.pull_factor;
    comp = baseComp;
    reasons.push(`base_fill=${baseComp.toFixed(3)}mm (${fabricType})`);

    if (area_mm2 > 200) { comp += 0.04; reasons.push('+0.040 área>200mm²'); }
    if (area_mm2 > 500) { comp += 0.03; reasons.push('+0.030 área>500mm²'); }
    comp += complexity.score * 0.07;
    if (complexity.score > 0.1) reasons.push(`+complejidad ${complexity.score.toFixed(2)}`);

    const densAdj = (0.40 - density_mm) * 0.30;
    comp += densAdj;
    if (Math.abs(densAdj) > 0.01) reasons.push(`dens-coupling: ${densAdj >= 0 ? '+' : ''}${densAdj.toFixed(3)}`);
  }

  // FASE 5 — Dirección: ángulo diagonal distribuye tensión uniformemente → menos pull
  // Reducción = 12% × sin²(2θ), máximo en θ=45° (sin²90°=1), nulo en 0° y 90°.
  const rad2 = (2 * fill_angle_deg * Math.PI) / 180;
  const dirFactor = 1 - 0.12 * Math.pow(Math.sin(rad2), 2);
  comp *= dirFactor;
  if (Math.abs(1 - dirFactor) > 0.005) {
    reasons.push(`dirección ${fill_angle_deg}°: ×${dirFactor.toFixed(3)}`);
  }

  const clamped = +Math.max(0, Math.min(0.80, comp)).toFixed(3);
  return { compensation_mm: clamped, rationale: reasons.join(', ') };
}

// ─── 5. Push Compensation ─────────────────────────────────────────────────────

/**
 * FASE 5 — Push compensation longitudinal (expansión de largo).
 *
 * Las puntadas empujan la tela hacia adelante en la dirección de avance de la
 * aguja; el elemento bordado crece en longitud. Compensación = acortar el polígono.
 *
 * Variables consideradas (existentes + FASE 5 NEW):
 *   - tipo de puntada y longitud de columna (satin)
 *   - área (fill grande → más push)
 *   - material (push_factor)
 *   - FASE 5 NEW: density_mm — a mayor densidad, más push acumulado
 *   - FASE 5 NEW: fill_angle_deg — ángulo ortogonal a la tela maximiza push;
 *     diagonal lo reduce (~10% menos en 45°)
 *
 * Returns { compensation_mm, rationale }
 */
export function eiePushCompensation(geo, stitchType, fabricType = 'Algodón', density_mm = 0.40, fill_angle_deg = 45) {
  if (stitchType === 'running_stitch') return { compensation_mm: 0, rationale: 'Running stitch: sin push comp.' };

  const fabric = FABRIC_MODEL[fabricType] || FABRIC_MODEL['Algodón'];
  const { skeleton_length_mm, area_mm2 } = geo;
  const reasons = [];

  let push = 0;

  if (stitchType === 'satin') {
    // Push ∝ columna (más puntadas → más empuje acumulado)
    const basePush = (skeleton_length_mm / 100) * 0.08 * fabric.push_factor;
    push = Math.max(0.05, Math.min(0.40, basePush));
    reasons.push(`col ${skeleton_length_mm.toFixed(0)}mm × push_factor=${fabric.push_factor} → ${basePush.toFixed(3)}mm`);
  } else if (stitchType === 'fill') {
    push = area_mm2 > 300 ? 0.05 * fabric.push_factor : 0.02 * fabric.push_factor;
    reasons.push(`fill ${area_mm2.toFixed(0)}mm² → ${push.toFixed(3)}mm (${fabricType})`);
  }

  // FASE 5 NEW — Density coupling: más densidad → más push por unidad de longitud
  // Referencia: cada 0.10mm menos de espaciado añade ~8% de push
  const densExtra = Math.max(0, (0.40 - density_mm) / 0.40) * 0.08 * push;
  push += densExtra;
  if (densExtra > 0.001) reasons.push(`dens-coupling +${densExtra.toFixed(3)}`);

  // FASE 5 NEW — Dirección: ángulo oblicuo reduce el componente de push sobre el eje principal
  // Factor: cos²(θ) — en 0° = total push, en 45° = 50%, en 90° = 0
  const rad = (fill_angle_deg * Math.PI) / 180;
  const dirFactor = Math.pow(Math.cos(rad), 2) * 0.5 + 0.5; // rango [0.5, 1.0]
  push *= dirFactor;
  if (Math.abs(1 - dirFactor) > 0.005) {
    reasons.push(`dirección ${fill_angle_deg}°: ×${dirFactor.toFixed(3)}`);
  }

  return {
    compensation_mm: +Math.max(0, Math.min(0.50, push)).toFixed(3),
    rationale: reasons.join(', ') || 'No aplica.',
  };
}

// ─── 5b. Edge Compensation ────────────────────────────────────────────────────

/**
 * FASE 5 — Edge compensation (expansión de borde).
 *
 * El hilo se dobla en los bordes del elemento; las puntadas del borde quedan
 * cortas respecto al polígono diseñado. Compensación: expandir el borde
 * (añadir mm al polígono exterior).
 *
 * Variables:
 *   - tipo de puntada: satin tiene bordes duros → más edge comp
 *   - mean_curvature: bordes curvos necesitan más expansión que rectos
 *   - densidad: mayor densidad → hilo más comprimido en borde
 *   - material: tejidos elásticos (Lycra) tienen borde muy inestable
 *
 * Referencia: Barudan/Tajima edge compensation spec (0.1–0.4mm según tipo).
 * Returns { compensation_mm, rationale }
 */
export function eieEdgeCompensation(geo, stitchType, fabricType = 'Algodón', density_mm = 0.40) {
  if (stitchType === 'running_stitch') return { compensation_mm: 0, rationale: 'Running stitch: sin edge comp.' };

  const fabric = FABRIC_MODEL[fabricType] || FABRIC_MODEL['Algodón'];
  const { mean_curvature, convexity, mean_width_mm } = geo;
  const reasons = [];

  // Base por tipo de puntada
  // Satin: borde duro → necesita más edge comp que fill (que tiene transición difuminada)
  let base = stitchType === 'satin' ? 0.20 : 0.10;
  reasons.push(`base_${stitchType}=${base.toFixed(2)}mm`);

  // Fabric: Lycra/Mezcla estiran el borde → más comp; Lino/Denim rígidos → menos
  const fabricAdj = (fabric.pull_factor - 1.0) * 0.08;
  base += fabricAdj;
  if (Math.abs(fabricAdj) > 0.005) reasons.push(`tejido ${fabricType}: ${fabricAdj >= 0 ? '+' : ''}${fabricAdj.toFixed(3)}`);

  // Curvatura: bordes muy curvos recortan más hilo en las curvas
  const curvAdj = Math.min(0.10, mean_curvature * 0.06);
  base += curvAdj;
  if (curvAdj > 0.005) reasons.push(`curvatura ${mean_curvature.toFixed(2)}: +${curvAdj.toFixed(3)}`);

  // Concavidad: bordes cóncavos atrapan el hilo → extra comp
  const concavAdj = (1 - convexity) * 0.05;
  base += concavAdj;
  if (concavAdj > 0.005) reasons.push(`concavidad ${(1-convexity).toFixed(2)}: +${concavAdj.toFixed(3)}`);

  // Densidad: más denso → hilo más comprimido en borde
  const densAdj = Math.max(0, (0.40 - density_mm) * 0.20);
  base += densAdj;
  if (densAdj > 0.005) reasons.push(`densidad ${density_mm.toFixed(2)}: +${densAdj.toFixed(3)}`);

  // Satin muy estrecho: la proporción borde/área es muy alta → escalar extra
  if (stitchType === 'satin' && mean_width_mm < 2.5) {
    base *= 1.20;
    reasons.push('satin<2.5mm: ×1.20 (alto ratio borde/área)');
  }

  const clamped = +Math.max(0, Math.min(0.50, base)).toFixed(3);
  return { compensation_mm: clamped, rationale: reasons.join(', ') };
}

// ─── 5c. Corner Compensation ─────────────────────────────────────────────────

/**
 * FASE 5 — Corner compensation (compensación en esquinas).
 *
 * Las esquinas agudas concentran tensión; la aguja sobreimpone puntadas en
 * el vértice, creando un bulto de hilo (needle stacking). Compensación:
 * reducir la longitud de puntada en la zona próxima a la esquina, o
 * proporcionar un parámetro de "corner rounding" al motor de tatami/satin.
 *
 * Variables:
 *   - complexity (más vértices / ángulos agudos → más esquinas)
 *   - mean_curvature (alta curvatura ≈ muchas esquinas agudas)
 *   - convexity (baja convexity → forma con muescas = esquinas interiores)
 *   - tipo de puntada (satin: esquinas problemáticas; fill: menos crítico)
 *
 * Devuelve:
 *   compensation_mm  — reducción de longitud de puntada en esquinas [0–0.5]
 *   corner_rounding  — suavizado de vértice recomendado en mm [0–1.0]
 *   rationale
 */
export function eieCornerCompensation(geo, stitchType, fabricType = 'Algodón') {
  if (stitchType === 'running_stitch') {
    return { compensation_mm: 0, corner_rounding: 0, rationale: 'Running stitch: sin corner comp.' };
  }

  const fabric = FABRIC_MODEL[fabricType] || FABRIC_MODEL['Algodón'];
  const { mean_curvature, convexity, complexity } = geo;
  const reasons = [];

  // Base de reducción de longitud de puntada en esquinas
  // Satin: esquinas críticas → base 0.15mm; fill: 0.08mm
  let comp = stitchType === 'satin' ? 0.15 : 0.08;
  reasons.push(`base_${stitchType}=${comp.toFixed(2)}mm`);

  // Curvatura alta → esquinas más agudas → mayor reducción necesaria
  const curvAdj = Math.min(0.15, mean_curvature * 0.10);
  comp += curvAdj;
  if (curvAdj > 0.005) reasons.push(`curvatura ${mean_curvature.toFixed(2)}: +${curvAdj.toFixed(3)}`);

  // Baja convexidad → forma con muescas interiores = esquinas reentrantes
  const concavAdj = (1 - convexity) * 0.08;
  comp += concavAdj;
  if (concavAdj > 0.005) reasons.push(`concavidad ${(1-convexity).toFixed(2)}: +${concavAdj.toFixed(3)}`);

  // Complejidad alta → muchos vértices → más esquinas potenciales
  const complexAdj = complexity.score * 0.10;
  comp += complexAdj;
  if (complexAdj > 0.005) reasons.push(`complejidad ${complexity.level}: +${complexAdj.toFixed(3)}`);

  // Fabric: Lycra distorsiona más en esquinas → aumenta comp
  const fabricAdj = (fabric.pull_factor - 1.0) * 0.05;
  comp += fabricAdj;
  if (Math.abs(fabricAdj) > 0.005) reasons.push(`tejido ${fabricType}: ${fabricAdj >= 0 ? '+' : ''}${fabricAdj.toFixed(3)}`);

  // Corner rounding: suavizado de vértice recomendado
  // Formas muy complejas con curvatura alta se benefician de redondear esquinas
  // para evitar needle stacking. Rango [0, 1.0] mm.
  const corner_rounding = +Math.min(1.0,
    (mean_curvature > 0.6 ? 0.3 : 0) +
    (complexity.level === 'alta' ? 0.3 : complexity.level === 'media' ? 0.15 : 0) +
    ((1 - convexity) * 0.4)
  ).toFixed(3);

  if (corner_rounding > 0) reasons.push(`rounding=${corner_rounding}mm`);

  const clamped = +Math.max(0, Math.min(0.50, comp)).toFixed(3);
  return { compensation_mm: clamped, corner_rounding, rationale: reasons.join(', ') };
}

// ─── 6. Underlay ─────────────────────────────────────────────────────────────

/**
 * Professional underlay decision:
 *
 *   running_stitch → none
 *   satin <2.5mm  → centre_walk
 *   satin 2.5–5mm → centre_walk (standard)
 *   satin >5mm    → zigzag + centre_walk
 *   fill <12mm²   → none (too small)
 *   fill 12–40mm² → edge_walk
 *   fill 40–120mm²→ edge_walk + light zigzag
 *   fill >120mm²  → full zigzag underlay
 *   pile fabric   → full_coverage regardless
 *
 * Returns { type, density_mm, angle_deg, second_pass, rationale }
 */
export function eieUnderlay(geo, stitchType, fabricType = 'Algodón') {
  const { area_mm2, mean_width_mm, complexity } = geo;
  const reasons = [];

  const none = (r) => ({ type: null, density_mm: 0, angle_deg: 0, second_pass: false, rationale: r });

  if (stitchType === 'running_stitch') return none('Running stitch: sin underlay.');
  if (area_mm2 < 6) return none('Micro-área: underlay omitido.');

  const isPile = fabricType === 'Otro'; // Terry/fleece proxy

  if (stitchType === 'satin') {
    if (mean_width_mm < 2.5) {
      return {
        type: 'centre_walk', density_mm: 0, angle_deg: 0, second_pass: false,
        rationale: `Satin estrecho ${mean_width_mm.toFixed(1)}mm: centre walk.`,
      };
    }
    if (mean_width_mm > 5.0) {
      // Wide satin: zigzag + centre_walk (double pass for stability)
      const d = +(THREAD.diameter_fill * 1.6 + (mean_width_mm - 5) * 0.08).toFixed(2);
      return {
        type: 'zigzag_centre', density_mm: d, angle_deg: 90, second_pass: true,
        rationale: `Satin ancho ${mean_width_mm.toFixed(1)}mm: zigzag (${d}mm) + centre walk.`,
      };
    }
    return {
      type: 'centre_walk', density_mm: 0, angle_deg: 0, second_pass: false,
      rationale: `Satin ${mean_width_mm.toFixed(1)}mm: centre walk estándar.`,
    };
  }

  // Fill underlay
  if (isPile) {
    const d = +(THREAD.diameter_fill * 1.5).toFixed(2);
    return {
      type: 'full_coverage', density_mm: d, angle_deg: 45, second_pass: true,
      rationale: `Tejido de pelo: full coverage doble (${d}mm, 45°).`,
    };
  }

  if (area_mm2 < 12) return none(`Fill pequeño ${area_mm2.toFixed(0)}mm²: sin underlay.`);

  if (area_mm2 < 40) {
    return {
      type: 'edge_walk', density_mm: 0, angle_deg: 0, second_pass: false,
      rationale: `Fill pequeño ${area_mm2.toFixed(0)}mm²: edge walk perimetral.`,
    };
  }

  if (area_mm2 < 120) {
    const d = +(THREAD.diameter_fill * 2.0).toFixed(2);
    // Underlay angle: must be perpendicular to the ACTUAL fill angle (not orientation).
    // geo.fill_angle is the computed EIE fill angle; geo.orientation is the PCA axis.
    // The two differ when A2/A3/A4 corrections apply (elongated/curved shapes).
    // Running underlay parallel to top stitches provides zero stabilization — it must cross them.
    const topAngle = geo.fill_angle != null ? geo.fill_angle : (geo.orientation != null ? geo.orientation : 45);
    const underlayAngle = (topAngle + 90) % 180;
    return {
      type: 'edge_walk_zigzag', density_mm: d, angle_deg: underlayAngle, second_pass: false,
      rationale: `Fill medio ${area_mm2.toFixed(0)}mm²: edge walk + zigzag ${d}mm @ ${underlayAngle}° (perp. al ángulo de relleno ${topAngle}°).`,
    };
  }

  // Large fill: full zigzag underlay perpendicular to actual fill angle
  const d = +(THREAD.diameter_fill * 2.5).toFixed(2);
  const topAngle = geo.fill_angle != null ? geo.fill_angle : (geo.orientation != null ? geo.orientation : 45);
  const underlayAngle = (topAngle + 90) % 180;
  return {
    type: 'zigzag', density_mm: d, angle_deg: underlayAngle, second_pass: complexity.level === 'alta',
    rationale: `Fill grande ${area_mm2.toFixed(0)}mm²: zigzag ${d}mm @ ${underlayAngle}° (perp. al ángulo de relleno ${topAngle}°)${complexity.level === 'alta' ? ' doble pase' : ''}.`,
  };
}

// ─── 7. Build Priority ────────────────────────────────────────────────────────

/**
 * Determines embroidery build order [1–10].
 * Rule hierarchy (professional standard):
 *   1. Background fills (large areas) → priority 1–2
 *   2. Mid-ground fills               → priority 3–4
 *   3. Satin elements (wide)          → priority 5–6
 *   4. Detail fills & satin (narrow)  → priority 7
 *   5. Running outlines               → priority 8–9
 *   6. Running detail (eyes, etc.)    → priority 10
 *
 * Returns { priority, rationale }
 */
export function eiePriority(geo, stitchType, existingPriority = null) {
  if (existingPriority != null && existingPriority > 0) {
    return { priority: existingPriority, rationale: `Prioridad manual: ${existingPriority}.` };
  }

  const { area_mm2, mean_width_mm, complexity, holes } = geo;

  if (stitchType === 'running_stitch') {
    // Hairlines and micro details always last
    const p = holes > 0 ? 10 : (area_mm2 < 5 ? 10 : 9);
    return { priority: p, rationale: `Running stitch: prioridad alta (${p}) — detalle superior.` };
  }

  if (stitchType === 'satin') {
    if (mean_width_mm < 2.5) return { priority: 8, rationale: `Satin estrecho (${mean_width_mm.toFixed(1)}mm): detalle.` };
    return { priority: 6, rationale: `Satin (${mean_width_mm.toFixed(1)}mm): capa intermedia.` };
  }

  // Fill
  if (area_mm2 > 800) return { priority: 1, rationale: `Fill enorme (${area_mm2.toFixed(0)}mm²): fondo base.` };
  if (area_mm2 > 400) return { priority: 2, rationale: `Fill grande (${area_mm2.toFixed(0)}mm²): capa de fondo.` };
  if (area_mm2 > 150) return { priority: 3, rationale: `Fill mediano-grande (${area_mm2.toFixed(0)}mm²): capa secundaria.` };
  if (area_mm2 > 60)  return { priority: 4, rationale: `Fill mediano (${area_mm2.toFixed(0)}mm²): capa intermedia.` };
  if (area_mm2 > 20)  return { priority: 5, rationale: `Fill pequeño (${area_mm2.toFixed(0)}mm²): detalle fill.` };
  if (complexity.level === 'alta') return { priority: 7, rationale: `Fill complejo micro: detalle superior.` };
  return { priority: 6, rationale: `Fill micro (${area_mm2.toFixed(0)}mm²): capa superior.` };
}

// ─── 8. Travel Score ─────────────────────────────────────────────────────────

/**
 * Computes a cost heuristic for TSP-based travel ordering.
 * Lower score = prefer visiting earlier within same priority group.
 *
 * Cost factors:
 *   - Centroid distance from previous region (main signal)
 *   - Color change penalty (thread change = costly machine operation)
 *   - Jump length estimate (proportional to distance)
 *
 * Returns { score, factors }
 */
export function eieTravelScore(region, fromCentroid = [0.5, 0.5], prevColor = null) {
  const [rx, ry] = region.centroid || [0.5, 0.5];
  const [fx, fy] = fromCentroid;
  const distance = Math.hypot(rx - fx, ry - fy);

  // Color change: heavy penalty (machine stops, operator changes thread)
  const colorChangePenalty = (prevColor && prevColor !== region.color) ? 0.25 : 0;

  // Jump penalty: scales with distance (more thread waste, more trim marks)
  const jumpPenalty = Math.min(0.3, distance * 0.4);

  const score = distance + colorChangePenalty + jumpPenalty;

  return {
    score: +score.toFixed(4),
    factors: { distance: +distance.toFixed(4), colorChangePenalty, jumpPenalty: +jumpPenalty.toFixed(4) },
  };
}

// ─── Master Analysis ──────────────────────────────────────────────────────────

/**
 * eieAnalyzeRegion — full EIE analysis for one region.
 *
 * @param {object} geo          — geometric metrics from enrichRegion/contourEngine
 * @param {string} fabricType   — fabric type string
 * @param {object} context      — optional: { neighbourAngle, existingPriority, prevColor, fromCentroid }
 * @param {object} overrides    — explicit user overrides; override = respected as-is
 *
 * Returns EIEResult:
 * {
 *   stitch_type, stitch_confidence, stitch_rationale, stitch_signals,
 *   fill_angle, angle_rationale,
 *   density_mm, density_rationale,
 *   pull_compensation_mm, pull_rationale,
 *   push_compensation_mm, push_rationale,
 *   underlay, underlay_rationale,
 *   priority, priority_rationale,
 *   travel_score,
 *   overall_confidence,   ← weighted average confidence across all decisions
 *   eie_version: '2.0',
 * }
 */
export function eieAnalyzeRegion(geo, fabricType = 'Algodón', context = {}, overrides = {}) {
  // — Stitch type —
  const stitchResult = eieStitchType(geo);
  const stitch_type  = overrides.stitch_type || stitchResult.type;

  // — Fill angle —
  const angleResult  = eieFillAngle(geo, context);
  const fill_angle   = overrides.angle != null ? overrides.angle : angleResult.angle_deg;

  // — Density —
  const densResult   = eieDensity(geo, stitch_type, fabricType);
  const density_mm   = overrides.density != null ? overrides.density : densResult.density_mm;

  // — Pull compensation (density + direction coupling) —
  const pullResult   = eiePullCompensation(geo, stitch_type, fabricType, density_mm, fill_angle);
  const pull_comp    = overrides.pull_compensation != null ? overrides.pull_compensation : pullResult.compensation_mm;

  // — Push compensation (density + direction coupling) —
  const pushResult   = eiePushCompensation(geo, stitch_type, fabricType, density_mm, fill_angle);

  // — Edge compensation —
  const edgeResult   = eieEdgeCompensation(geo, stitch_type, fabricType, density_mm);

  // — Corner compensation —
  const cornerResult = eieCornerCompensation(geo, stitch_type, fabricType);

  // — Underlay: pass fill_angle into geo so the underlay angle is perpendicular
  //   to the ACTUAL top stitch angle (not the raw PCA orientation, which diverges
  //   after A2/A3/A4 corrections for elongated/curved shapes).
  const geoWithAngle = { ...geo, fill_angle };
  const underlayResult = eieUnderlay(geoWithAngle, stitch_type, fabricType);

  // — Priority —
  const prioResult   = eiePriority(geo, stitch_type, context.existingPriority ?? null);
  const priority     = overrides.priority != null ? overrides.priority : prioResult.priority;

  // — Travel score —
  const travelResult = eieTravelScore(
    { centroid: geo.centroid, color: geo.color },
    context.fromCentroid,
    context.prevColor
  );

  // — Overall confidence: weighted avg of stitch confidence + density/comp certainty —
  const overall_confidence = +(stitchResult.confidence * 0.5 +
    (1 - Math.min(1, geo.complexity.score)) * 0.3 +
    (geo.convexity || 0) * 0.2).toFixed(3);

  return {
    // Stitch type
    stitch_type,
    stitch_confidence:   stitchResult.confidence,
    stitch_rationale:    stitchResult.rationale,
    stitch_signals:      stitchResult.signals,

    // Angle
    fill_angle,
    angle_rationale:     angleResult.rationale,

    // Density
    density_mm,
    density_rationale:   densResult.rationale,

    // Compensation
    pull_compensation_mm:   pull_comp,
    pull_rationale:         pullResult.rationale,
    push_compensation_mm:   pushResult.compensation_mm,
    push_rationale:         pushResult.rationale,
    edge_compensation_mm:   edgeResult.compensation_mm,
    edge_rationale:         edgeResult.rationale,
    corner_compensation_mm: cornerResult.compensation_mm,
    corner_rounding_mm:     cornerResult.corner_rounding,
    corner_rationale:       cornerResult.rationale,

    // Underlay
    underlay:            underlayResult,
    underlay_rationale:  underlayResult.rationale,

    // Priority
    priority,
    priority_rationale:  prioResult.rationale,

    // Travel
    travel_score:        travelResult.score,
    travel_factors:      travelResult.factors,

    // Meta
    overall_confidence,
    eie_version:         '2.0',
  };
}

// ─── Batch optimizer — 2-opt travel path ─────────────────────────────────────

/**
 * Computes optimal sewing order for a set of enriched regions using:
 *   1. Sort by priority (base layers first)
 *   2. Within priority groups: greedy nearest-neighbour by EIE travel score
 *   3. 2-opt improvement to reduce total jump distance
 *
 * Returns regions with travelOrder and travel_score added.
 */
export function eieOptimizeTravelOrder(regions, fabricType = 'Algodón') {
  if (!regions || regions.length === 0) return [];

  // Group by priority
  const groups = {};
  for (const r of regions) {
    const p = r.priority || 5;
    if (!groups[p]) groups[p] = [];
    groups[p].push(r);
  }

  const sorted = [];
  let cx = 0.5, cy = 0.5, prevColor = null;

  for (const p of Object.keys(groups).map(Number).sort((a, b) => a - b)) {
    const group = groups[p];
    const visited = new Set();
    const ordered = [];

    while (ordered.length < group.length) {
      let best = null, bestScore = Infinity;
      for (const r of group) {
        if (visited.has(r.id)) continue;
        const ts = eieTravelScore(r, [cx, cy], prevColor);
        if (ts.score < bestScore) { bestScore = ts.score; best = r; }
      }
      if (!best) break;
      visited.add(best.id);
      const [rx, ry] = best.centroid || [0.5, 0.5];
      cx = rx; cy = ry;
      prevColor = best.color;
      ordered.push({ ...best, travel_score: bestScore });
    }

    // 2-opt improvement within priority group
    const improved = twoOpt(ordered);
    sorted.push(...improved);
  }

  return sorted.map((r, i) => ({ ...r, travelOrder: i + 1 }));
}

function twoOpt(route) {
  if (route.length < 4) return route;
  let improved = true;
  let best = [...route];

  while (improved) {
    improved = false;
    for (let i = 1; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const d1 = routeDist(best, i - 1, i) + routeDist(best, j, (j + 1) % best.length);
        const d2 = routeDist(best, i - 1, j) + routeDist(best, i, (j + 1) % best.length);
        if (d2 < d1 - 0.001) {
          best = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
          improved = true;
        }
      }
    }
  }
  return best;
}

function routeDist(route, i, j) {
  const ri = route[i], rj = route[j];
  if (!ri || !rj) return 0;
  const [ax, ay] = ri.centroid || [0.5, 0.5];
  const [bx, by] = rj.centroid || [0.5, 0.5];
  return Math.hypot(ax - bx, ay - by);
}