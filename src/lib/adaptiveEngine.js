/**
 * adaptiveEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Adaptive Embroidery Engine
 *
 * No hay parámetros fijos. Cada región recibe su configuración óptima
 * calculada a partir de sus propias métricas geométricas:
 *
 *   adaptStitchType()      → fill | satin | running_stitch
 *   adaptDensity()         → mm entre filas / columnas (0.25–0.55)
 *   adaptStitchLength()    → longitud en mm de cada puntada (1.5–6.0)
 *   adaptCompensation()    → pull compensation en mm (0.0–0.6)
 *   adaptUnderlay()        → { enabled, type, density, angle }
 *   adaptDirection()       → ángulo de relleno en grados [0,180)
 *   adaptPriority()        → entero [1,10]
 *   adaptRegion()          → todos los parámetros anteriores en un objeto
 */

// ─── Constantes de calibración ────────────────────────────────────────────────

// Fabric-specific pull compensation multipliers (empirically derived)
const FABRIC_PULL = {
  'Lycra':    0.60,
  'Mezcla':   0.38,
  'Algodón':  0.28,
  'Denim':    0.22,
  'Lino':     0.20,
  'Poliéster':0.15,
  'Seda':     0.10,
  'Otro':     0.28,
};

// Satin is only practical up to this width; beyond it puckers the fabric
const SATIN_MAX_WIDTH_MM = 8.0;

// Below this area threshold shapes are too tiny for tatami fill
const MIN_FILL_AREA_MM2 = 10;

// Thread diameter constants (mm) — physical 40wt thread
const THREAD_D_FILL    = 0.38;
const THREAD_D_SATIN   = 0.35;
const THREAD_D_RUNNING = 0.25;


// ─── 1. Stitch Type ───────────────────────────────────────────────────────────

/**
 * Selects stitch type using a multi-signal decision tree.
 * Signals (in priority order):
 *   1. Filiform (hairline): running_stitch
 *   2. Too small for fill/satin: running_stitch
 *   3. Narrow elongated shape within satin limits: satin
 *   4. Default: fill
 *
 * Returns { type, confidence [0–1], rationale }
 */
export function adaptStitchType(geo) {
  const { area_mm2, mean_width_mm, max_width_mm, skeleton_length_mm, convexity, concavity, complexity } = geo;

  // Signal 1 — hairline / filiform
  const elongationRatio = skeleton_length_mm / Math.max(0.1, mean_width_mm);
  if (mean_width_mm < 1.2 && elongationRatio > 4) {
    return { type: 'running_stitch', confidence: 0.97,
      rationale: `Filiform: ancho medio ${mean_width_mm.toFixed(1)}mm, elongación ${elongationRatio.toFixed(1)}× → running stitch.` };
  }

  // Signal 2 — micro area
  if (area_mm2 < 3.5) {
    return { type: 'running_stitch', confidence: 0.93,
      rationale: `Micro-área ${area_mm2.toFixed(1)}mm²; solo running stitch es viable.` };
  }

  // Signal 3 — satin zone: narrow enough AND convex enough AND not too complex
  const isSatinWidth  = max_width_mm <= SATIN_MAX_WIDTH_MM && mean_width_mm <= 6.5;
  const isSatinShape  = convexity > 0.50 && complexity.score < 0.65;
  const isElongated   = elongationRatio > 1.6 || mean_width_mm < 5.5;

  if (isSatinWidth && isSatinShape && isElongated && area_mm2 >= 3.5) {
    const conf = Math.min(0.95, 0.60 + (1 - max_width_mm / SATIN_MAX_WIDTH_MM) * 0.35);
    return { type: 'satin', confidence: +conf.toFixed(2),
      rationale: `Satin: max_w=${max_width_mm.toFixed(1)}mm≤8, convexity=${convexity.toFixed(2)}, elongación=${elongationRatio.toFixed(1)}×.` };
  }

  // Signal 4 — fill (tatami)
  const conf = Math.min(0.95, 0.55 + (area_mm2 / 500) * 0.3 + convexity * 0.15);
  return { type: 'fill', confidence: +conf.toFixed(2),
    rationale: `Fill tatami: área=${area_mm2.toFixed(1)}mm², ancho_medio=${mean_width_mm.toFixed(1)}mm, convexity=${convexity.toFixed(2)}.` };
}


// ─── 2. Density ───────────────────────────────────────────────────────────────

/**
 * Computes row/column spacing in mm.
 * Physical minimum = thread diameter (full coverage).
 * Scales with complexity, shape regularity and stitch type.
 *
 * Returns density in mm (lower → denser, more stitches).
 */
export function adaptDensity(geo, stitchType) {
  const { area_mm2, mean_width_mm, complexity, convexity, mean_curvature } = geo;

  if (stitchType === 'running_stitch') return 0; // not applicable

  if (stitchType === 'satin') {
    // Satin spacing = thread diameter × coverage factor
    // Wider satin columns need slightly looser spacing to avoid puckering
    const widthFactor = mean_width_mm > 5 ? 1.10 : 1.0;
    return +(THREAD_D_SATIN * 0.92 * widthFactor).toFixed(3); // ~0.32–0.35
  }

  // Fill — base density from thread diameter, modified by shape signals
  let d = THREAD_D_FILL * 1.05; // ~0.40mm base

  // Denser for complex shapes (more overlap needed to cover irregular edges)
  d -= complexity.score * 0.08;

  // Denser for concave/jagged shapes (better edge coverage)
  d -= (1 - convexity) * 0.05;

  // Denser for high-curvature contours
  d -= Math.min(0.05, mean_curvature * 0.04);

  // Looser for large simple shapes (avoid over-stitching flat areas)
  if (area_mm2 > 300 && complexity.level === 'simple') d += 0.05;
  if (area_mm2 > 600 && complexity.level === 'simple') d += 0.04;

  return +Math.max(THREAD_D_FILL, Math.min(0.55, d)).toFixed(3);
}


// ─── 3. Stitch Length ─────────────────────────────────────────────────────────

/**
 * Computes individual stitch length in mm.
 * Shorter stitches = more precise, higher quality on curves.
 * Longer stitches = faster, better for large flat areas.
 *
 * Returns length in mm [1.5–6.0].
 */
export function adaptStitchLength(geo, stitchType) {
  const { area_mm2, mean_curvature, complexity, convexity, skeleton_length_mm, mean_width_mm } = geo;

  if (stitchType === 'running_stitch') {
    // Running stitch: shorter on curves, longer on straight edges
    const base = 2.5;
    const curvAdj = -Math.min(1.0, mean_curvature * 0.8);
    return +Math.max(1.5, Math.min(4.0, base + curvAdj)).toFixed(2);
  }

  if (stitchType === 'satin') {
    // Satin length = width of the shape (perpendicular span)
    // Clamp to practical machine limits
    return +Math.max(1.5, Math.min(SATIN_MAX_WIDTH_MM, mean_width_mm * 1.05)).toFixed(2);
  }

  // Fill — tatami stitch length
  let len = 3.0; // professional standard

  // Shorter for highly curved / complex shapes
  len -= complexity.score * 0.8;
  len -= Math.min(0.5, mean_curvature * 0.4);

  // Shorter for small, detail-heavy regions
  if (area_mm2 < 20) len = Math.min(len, 2.0);
  else if (area_mm2 < 60) len = Math.min(len, 2.5);

  // Longer for large, flat regions (efficiency)
  if (area_mm2 > 200 && convexity > 0.80 && complexity.level === 'simple') len = Math.max(len, 3.5);

  return +Math.max(1.5, Math.min(5.0, len)).toFixed(2);
}


// ─── 4. Pull Compensation ─────────────────────────────────────────────────────

/**
 * Computes pull compensation in mm.
 * Compensates for thread tension pulling the fabric inward.
 * Driven by fabric elasticity, stitch type, and shape width.
 *
 * Returns compensation in mm [0.0–0.6].
 */
export function adaptCompensation(geo, stitchType, fabricType = 'Algodón') {
  if (stitchType === 'running_stitch') return 0;

  const { mean_width_mm, area_mm2, complexity } = geo;
  const ff = FABRIC_PULL[fabricType] || 0.28;

  let comp = ff;

  if (stitchType === 'satin') {
    // Satin pulls more due to dense parallel columns
    comp *= 1.25;
    // Wider satin = more pull
    if (mean_width_mm > 5) comp += 0.05;
  } else {
    // Fill: larger areas accumulate more pull
    if (area_mm2 > 200) comp += 0.06;
    if (area_mm2 > 500) comp += 0.05;
    // Complex shapes distort more
    comp += complexity.score * 0.08;
  }

  return +Math.max(0, Math.min(0.60, comp)).toFixed(3);
}


// ─── 5. Underlay ─────────────────────────────────────────────────────────────

/**
 * Decides underlay type and parameters.
 * Underlay stabilizes the fabric before the top stitching.
 *
 * Returns { enabled, type, density_mm, angle_deg, rationale }
 */
export function adaptUnderlay(geo, stitchType) {
  const { area_mm2, mean_width_mm, skeleton_length_mm, complexity, convexity } = geo;

  if (stitchType === 'running_stitch') {
    return { enabled: false, type: null, density_mm: 0, angle_deg: 0,
      rationale: 'Running stitch no requiere underlay.' };
  }

  if (stitchType === 'satin') {
    if (mean_width_mm < 2.5) {
      // Very thin satin — single run underlay
      return { enabled: true, type: 'single_run', density_mm: 0, angle_deg: 0,
        rationale: `Satin estrecho (${mean_width_mm.toFixed(1)}mm): underlay run perimetral.` };
    }
    if (mean_width_mm > 5) {
      // Wide satin — zigzag center underlay for stability
      const d = +(mean_width_mm * 0.25).toFixed(2);
      return { enabled: true, type: 'zigzag_center', density_mm: d, angle_deg: 90,
        rationale: `Satin ancho (${mean_width_mm.toFixed(1)}mm): underlay zigzag central, densidad ${d}mm.` };
    }
    return { enabled: true, type: 'single_run', density_mm: 0, angle_deg: 0,
      rationale: `Satin ${mean_width_mm.toFixed(1)}mm: underlay run perimetral estándar.` };
  }

  // Fill underlay
  if (area_mm2 < 12) {
    return { enabled: false, type: null, density_mm: 0, angle_deg: 0,
      rationale: 'Fill micro (<12mm²): underlay omitido, evita abultamiento.' };
  }

  if (area_mm2 > 120 || (complexity.level === 'alta' && area_mm2 > 40)) {
    // Large or complex fills: grid underlay at 90° to main fill direction
    const d = +(THREAD_D_FILL * 2.5).toFixed(2);
    return { enabled: true, type: 'grid_90deg', density_mm: d, angle_deg: 90,
      rationale: `Fill grande/complejo (${area_mm2.toFixed(0)}mm², ${complexity.level}): underlay cuadrícula 90°, densidad ${d}mm.` };
  }

  if (area_mm2 > 30) {
    const d = +(THREAD_D_FILL * 2.0).toFixed(2);
    return { enabled: true, type: 'single_run', density_mm: d, angle_deg: 45,
      rationale: `Fill mediano (${area_mm2.toFixed(0)}mm²): underlay perimetral diagonal, densidad ${d}mm.` };
  }

  return { enabled: true, type: 'edge_walk', density_mm: 0, angle_deg: 0,
    rationale: 'Fill pequeño: underlay edge-walk perimetral mínimo.' };
}


// ─── 6. Direction ─────────────────────────────────────────────────────────────

/**
 * Computes optimal fill angle in degrees [0, 180).
 * Uses PCA orientation as primary signal, then applies corrections
 * for elongation, curvature patterns, and layer context.
 *
 * Returns angle in degrees.
 */
export function adaptDirection(geo, stitchType) {
  const { orientation, skeleton_length_mm, mean_width_mm, mean_curvature, convexity } = geo;

  if (stitchType === 'running_stitch') return orientation; // follows contour

  if (stitchType === 'satin') {
    // Satin columns are always perpendicular to the shape's main axis
    return (orientation + 90) % 180;
  }

  // Fill — start from PCA orientation
  let angle = orientation;

  // For highly elongated shapes, stitches should run perpendicular to the long axis
  const elongation = skeleton_length_mm / Math.max(0.1, mean_width_mm);
  if (elongation > 3) {
    angle = (orientation + 90) % 180;
  }

  // Traditional 45° correction for near-horizontal/vertical shapes
  // (avoids long unsupported stitches parallel to fabric grain)
  if ((angle < 20 || angle > 160) && convexity > 0.7) {
    angle = 45;
  }

  // Highly curved shapes benefit from a diagonal that bisects the main curvature
  if (mean_curvature > 0.8) {
    angle = (angle + 45) % 180;
  }

  return Math.round(angle);
}


// ─── 7. Priority ─────────────────────────────────────────────────────────────

/**
 * Computes build priority [1, 10].
 * Low priority = drawn first (background/base layers).
 * High priority = drawn last (foreground details, outlines).
 *
 * Multi-signal: area, stitch type, complexity, concavity (details = higher prio).
 */
export function adaptPriority(geo, stitchType, existingPriority = null) {
  // Always respect an explicit backend-assigned priority
  if (existingPriority != null && existingPriority > 0) return existingPriority;

  const { area_mm2, complexity, concavity, mean_width_mm } = geo;

  // Running stitch outlines/details always on top
  if (stitchType === 'running_stitch') return 9;

  // Satin details: above fills but below running outlines
  if (stitchType === 'satin') {
    // Very thin satin = detail element → higher priority
    if (mean_width_mm < 3) return 8;
    return 6;
  }

  // Fill: larger = earlier (base layer), smaller = later (detail layer)
  if (area_mm2 > 600) return 1;
  if (area_mm2 > 300) return 2;
  if (area_mm2 > 120) return 3;
  if (area_mm2 > 50)  return 4;
  if (area_mm2 > 20)  return 5;

  // Small complex fills = fine details → near top
  if (complexity.level === 'alta') return 7;
  return 6;
}


// ─── 8. Master adapter ───────────────────────────────────────────────────────

/**
 * adaptRegion(geo, overrides, fabricType)
 *
 * Given the geometric metrics object (from regionBuilder/enrichRegion),
 * returns a complete adaptive parameter set for that region.
 *
 * overrides: { stitch_type?, angle?, density?, pull_compensation? }
 *   — explicit user overrides from the pipeline (hybridDigitize labels)
 *   — each override is respected; only missing values are computed adaptively.
 *
 * Returns:
 * {
 *   stitch_type, stitch_confidence, stitch_rationale,
 *   density, stitch_length_mm, pull_compensation,
 *   underlay, fill_angle, priority,
 *   adaptive: true   ← marker so consumers know this was adaptive
 * }
 */
export function adaptRegion(geo, overrides = {}, fabricType = 'Algodón') {
  // --- Stitch type ---
  const stitchResult = adaptStitchType(geo);
  const stitch_type  = overrides.stitch_type || stitchResult.type;

  // --- Density ---
  const density = overrides.density != null
    ? overrides.density
    : adaptDensity(geo, stitch_type);

  // --- Stitch length ---
  const stitch_length_mm = adaptStitchLength(geo, stitch_type);

  // --- Pull compensation ---
  const pull_compensation = overrides.pull_compensation != null
    ? overrides.pull_compensation
    : adaptCompensation(geo, stitch_type, fabricType);

  // --- Underlay ---
  const underlay = adaptUnderlay(geo, stitch_type);

  // --- Direction ---
  const fill_angle = overrides.angle != null
    ? overrides.angle
    : adaptDirection(geo, stitch_type);

  // --- Priority ---
  const priority = adaptPriority(geo, stitch_type, overrides.priority ?? null);

  return {
    stitch_type,
    stitch_confidence:  stitchResult.confidence,
    stitch_rationale:   stitchResult.rationale,
    density:            +density.toFixed(3),
    stitch_length_mm,
    pull_compensation,
    underlay,
    fill_angle,
    priority,
    adaptive:           true,
  };
}