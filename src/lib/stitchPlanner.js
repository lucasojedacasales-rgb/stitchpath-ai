/**
 * stitchPlanner.js — Intelligent AI Stitch Planner
 * ─────────────────────────────────────────────────────────────────────────────
 * Before generating a single stitch, this module decides:
 *   1. Stitch type per region (fill / satin / running — with justification)
 *   2. Optimal stitch angle per region (PCA-driven)
 *   3. Density & pull compensation per region (fabric + geometry aware)
 *   4. Underlay strategy per region (type + density)
 *   5. Layer ordering (background → fills → satin → details → outlines)
 *   6. Color grouping (minimise thread changes)
 *   7. Travel path (greedy TSP per color group → minimise jumps)
 *   8. Production warnings & viability score
 *   9. Time & thread estimation
 *  10. Narrative summary
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const MACHINE_SPM           = 800;   // stitches/min default speed
const COLOR_CHANGE_SEC      = 30;    // seconds per thread change
const JUMP_PENALTY_SEC      = 0.05;  // seconds per jump stitch
const THREAD_MM_PER_STITCH  = 5.5;
const MM_PER_GRAM           = 220;

// Layer order: lower = sewn first (base layers before details)
const LAYER_RANK = {
  background:      0,
  fill:            1,
  satin:           2,
  running_stitch:  3,
  detail:          4,
  outline:         5,
};

// Fabric-specific density multipliers
const FABRIC_DENSITY = {
  'Algodón':    1.00,
  'Poliéster':  0.95,
  'Mezcla':     0.98,
  'Denim':      1.10,  // tighter — dense fabric needs more coverage
  'Lino':       1.05,
  'Seda':       0.85,  // loose — delicate
  'Lycra':      1.15,  // stretch — dense underlay essential
  'Otro':       1.00,
};

// Fabric pull compensation multipliers
const FABRIC_PULL = {
  'Algodón':    1.00,
  'Poliéster':  1.05,
  'Mezcla':     1.02,
  'Denim':      1.10,
  'Lino':       1.05,
  'Seda':       0.90,
  'Lycra':      1.20,
  'Otro':       1.00,
};

// ─── 1. Stitch Type Classification ───────────────────────────────────────────

/**
 * Classifies the best stitch type for a region using geometric + semantic signals.
 * Priority chain: explicit semantic → region builder recommendation → geometry
 */
function classifyStitchType(region) {
  const area      = region.area_mm2    || 0;
  const perim     = region.perimeter_mm || Math.max(1, Math.sqrt(area) * 3.5);
  const avgWidth  = region.avg_width_mm || (area / perim);
  const compact   = region.convexity   ?? (4 * Math.PI * area) / Math.max(1, perim * perim);
  const inertia   = region._metrics?.inertia_ratio ?? 1;
  const name      = (region.name || '').toLowerCase();
  const color     = (region.color || '#888').toLowerCase();
  const semClass  = region.semantic_class  || '';
  const semObj    = region.semantic_object || '';

  // ── Semantic overrides ──
  if (/outline|contorno|border|borde/.test(name + semClass + semObj)) {
    return { type: 'running_stitch', reason: 'Contorno semántico — pespunte perimetral', confidence: 0.97, layer: 'outline' };
  }
  if (/text|letra|letter|font/.test(name + semClass + semObj)) {
    return { type: 'satin', reason: 'Texto / letra detectada — satén columnar', confidence: 0.95, layer: 'detail' };
  }
  if (/eye|ojo|pupil|pupila|reflejo|highlight/.test(name + semClass + semObj)) {
    return { type: 'satin', reason: 'Detalle anatómico — satén fino', confidence: 0.93, layer: 'detail' };
  }
  if (/background|fondo|bg/.test(name + semClass + semObj)) {
    return { type: 'fill', reason: 'Fondo detectado — relleno Tatami base', confidence: 0.92, layer: 'background' };
  }

  // ── Geometry rules ──
  if (area < 4 || avgWidth < 0.8) {
    return { type: 'running_stitch', reason: `Área mínima (${area.toFixed(1)}mm²) — pespunte`, confidence: 0.90, layer: 'detail' };
  }
  if ((color === '#000000' || color === '#1a1a1a') && area < 50) {
    return { type: 'running_stitch', reason: 'Negro fino — contorno en pespunte', confidence: 0.88, layer: 'outline' };
  }
  if (avgWidth < 5 && (compact < 0.45 || inertia > 2.5)) {
    return { type: 'satin', reason: `Forma estrecha (${avgWidth.toFixed(1)}mm) — satén`, confidence: 0.88, layer: 'satin' };
  }
  if (area < 60 && compact < 0.40) {
    return { type: 'satin', reason: `Forma alargada baja compacidad (${compact.toFixed(2)}) — satén`, confidence: 0.82, layer: 'satin' };
  }
  if (area >= 30 && compact >= 0.35) {
    return { type: 'fill', reason: `Zona compacta (${area.toFixed(0)}mm²) — relleno Tatami`, confidence: 0.90, layer: 'fill' };
  }
  if (area < 30 && avgWidth < 8) {
    return { type: 'satin', reason: `Área media + forma estrecha — satén`, confidence: 0.78, layer: 'satin' };
  }

  return { type: 'fill', reason: 'Forma genérica — relleno Tatami', confidence: 0.70, layer: 'fill' };
}

// ─── 2. Optimal Stitch Angle (PCA) ───────────────────────────────────────────

function computeOptimalAngle(region) {
  // Use pre-computed PCA angle from regionBuilder if available
  if (region.orientation !== undefined) return region.orientation;

  const pts = region.path_points || [];
  if (pts.length < 3) return 45;

  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of pts) {
    const dx = x - cx, dy = y - cy;
    sxx += dx*dx; sxy += dx*dy; syy += dy*dy;
  }
  const angle = 0.5 * Math.atan2(2*sxy, sxx - syy);
  return Math.round(((angle * 180 / Math.PI) + 180) % 180);
}

// ─── 3. Density & Compensation ───────────────────────────────────────────────

function computeDensityAndCompensation(region, stitchType, fabricType) {
  const area     = region.area_mm2    || 0;
  const avgWidth = region.avg_width_mm || 3;
  const maxThick = region.max_thickness_mm || avgWidth;
  const fabric   = fabricType || 'Algodón';
  const densityMult = FABRIC_DENSITY[fabric] || 1.0;
  const pullMult    = FABRIC_PULL[fabric]    || 1.0;

  let baseDensity;
  if (stitchType === 'fill') {
    baseDensity = area > 400 ? 0.32 : area > 200 ? 0.37 : area > 80 ? 0.42 : area > 30 ? 0.47 : 0.52;
  } else if (stitchType === 'satin') {
    // Wider satin → tighter columns to avoid gaps
    baseDensity = avgWidth > 8 ? 0.40 : avgWidth > 5 ? 0.45 : 0.52;
  } else {
    baseDensity = 1.5; // running stitch: 1.5mm stitch length
  }

  const density = +(baseDensity * densityMult).toFixed(3);

  // Pull compensation: larger / wider shapes pull more
  let baseComp = 0.10;
  if (stitchType !== 'running_stitch') {
    if (area > 200 || maxThick > 15) baseComp = 0.20;
    else if (area > 80 || maxThick > 8) baseComp = 0.17;
    else if (area > 30) baseComp = 0.14;
    else baseComp = 0.10;
  }
  const compensation = +(baseComp * pullMult).toFixed(3);

  return { density, compensation };
}

// ─── 4. Underlay Strategy ─────────────────────────────────────────────────────

function computeUnderlay(region, stitchType, fabricType) {
  if (stitchType === 'running_stitch') return null;

  const area     = region.area_mm2   || 0;
  const avgWidth = region.avg_width_mm || 3;
  const hex      = (region.color || '#888').toLowerCase();
  const r = parseInt(hex.slice(1,3),16)||0, g = parseInt(hex.slice(3,5),16)||0, b = parseInt(hex.slice(5,7),16)||0;
  const luminance  = 0.299*r + 0.587*g + 0.114*b;
  const isLight    = luminance > 180;
  const isStretch  = fabricType === 'Lycra';
  const isDense    = ['Denim','Lino'].includes(fabricType);

  if (stitchType === 'satin') {
    if (avgWidth > 6 || isStretch) {
      return { type: 'center_run', density: 1.0, angle: 90, reason: 'Satén ancho — run central estabilizador' };
    }
    return { type: 'center_run', density: 1.2, angle: 90, reason: 'Satén — run central' };
  }

  // Fill underlay
  if (isStretch) {
    return { type: 'zigzag_plus_edge', density: 0.7, angle: 45, reason: 'Tejido elástico — zigzag + perimetral' };
  }
  if (area > 500 || (isLight && area > 100)) {
    return { type: 'grid', density: 0.8, angle: 45, reason: isLight ? 'Color claro grande — grid para máxima cobertura' : 'Zona muy grande — grid underlay' };
  }
  if (area > 150 || isDense) {
    return { type: 'edge_run_plus_zigzag', density: 0.9, angle: 45, reason: 'Zona amplia — perimetral + zigzag' };
  }
  if (area > 30) {
    return { type: 'edge_run', density: 1.0, angle: 0, reason: 'Relleno estándar — run perimetral' };
  }
  return null; // small fills: no underlay needed
}

// ─── 5. Layer Ordering ────────────────────────────────────────────────────────

function getLayerRank(region, stitchType, layerHint) {
  // Explicit layer_order from digitizer takes precedence
  if (region.layer_order !== undefined) return region.layer_order;
  // Use layer hint from classification
  const baseRank = LAYER_RANK[layerHint] ?? LAYER_RANK[stitchType] ?? 1;
  // Background regions always first
  const area = region.area_mm2 || 0;
  if (area > 600) return 0; // large background
  return baseRank;
}

// ─── 6 + 7. Color Grouping & Travel Path ─────────────────────────────────────

/**
 * Groups regions by color, orders groups largest-first (minimise resets),
 * then within each group orders by layer rank.
 * Inside same layer: greedy nearest-centroid TSP to minimise jumps.
 */
function optimizeSequence(regionPlans) {
  // Group by color
  const colorMap = new Map();
  for (const rp of regionPlans) {
    const c = rp.color;
    if (!colorMap.has(c)) colorMap.set(c, []);
    colorMap.get(c).push(rp);
  }

  // Sort color groups: largest total area first
  const colorGroups = [...colorMap.entries()]
    .map(([color, plans]) => ({
      color,
      plans,
      totalArea: plans.reduce((s, p) => s + (p.areaMm2||0), 0),
    }))
    .sort((a, b) => b.totalArea - a.totalArea);

  const sequenced = [];
  let colorChanges = 0;
  let jumpCount = 0;
  let cx = 0.5, cy = 0.5; // machine head position (normalized)

  for (const group of colorGroups) {
    if (sequenced.length > 0) colorChanges++;

    // Sort within group by layer rank, then greedy travel
    group.plans.sort((a, b) => a.layerRank - b.layerRank);

    // Greedy TSP within same layer-rank tiers
    const visited   = new Set();
    const ordered   = [];
    let headX = cx, headY = cy;

    while (ordered.length < group.plans.length) {
      const remaining = group.plans.filter((_, i) => !visited.has(i));
      // Find minimum rank among remaining
      const minRank = Math.min(...remaining.map(r => r.layerRank));
      const tier    = remaining.filter(r => r.layerRank === minRank);

      let best = tier[0], bestDist = Infinity, bestIdx = -1;
      for (const r of tier) {
        const [rx, ry] = r.centroid || [0.5, 0.5];
        const d = Math.hypot(rx - headX, ry - headY);
        if (d < bestDist) { bestDist = d; best = r; bestIdx = group.plans.indexOf(r); }
      }
      if (!best || bestIdx === -1) break;
      visited.add(bestIdx);
      ordered.push(best);
      const [rx, ry] = best.centroid || [0.5, 0.5];
      // Count jumps: distance > 5mm (normalized ~0.05 on 100mm design)
      if (Math.hypot(rx - headX, ry - headY) > 0.05) jumpCount++;
      headX = rx; headY = ry;
    }

    sequenced.push(...ordered);
    // Update head to last position of this color group
    if (ordered.length > 0) {
      const last = ordered[ordered.length-1];
      const [lx, ly] = last.centroid || [0.5, 0.5];
      cx = lx; cy = ly;
    }
  }

  return {
    sequenced,
    colorChanges,
    uniqueColors: colorGroups.length,
    jumpCount,
  };
}

// ─── 8. Production Warnings ───────────────────────────────────────────────────

function generateWarnings(regions, regionPlans, config) {
  const warnings = [];
  const uniqueColors  = new Set(regionPlans.map(r => r.color)).size;
  const totalStitches = regionPlans.reduce((s, r) => s + r.estimatedStitches, 0);

  // Color count
  if (uniqueColors > 15) {
    warnings.push({ level: 'error', code: 'TOO_MANY_COLORS', message: `${uniqueColors} colores — excede la mayoría de máquinas (máx. 15). Reducir paleta.` });
  } else if (uniqueColors > 10) {
    warnings.push({ level: 'warn', code: 'HIGH_COLOR_COUNT', message: `${uniqueColors} colores. Considera reducir a ≤10 para mayor compatibilidad.` });
  }

  // Stitch count
  if (totalStitches > 100000) {
    warnings.push({ level: 'warn', code: 'VERY_HIGH_STITCH_COUNT', message: `~${(totalStitches/1000).toFixed(0)}k puntadas. Bordado muy largo. Considera reducir densidad o simplificar.` });
  } else if (totalStitches > 50000) {
    warnings.push({ level: 'info', code: 'HIGH_STITCH_COUNT', message: `~${(totalStitches/1000).toFixed(0)}k puntadas — bordado complejo pero viable.` });
  }

  // Tiny regions
  const tinyCount = regions.filter(r => (r.area_mm2||0) < 5).length;
  if (tinyCount > 3) {
    warnings.push({ level: 'warn', code: 'TINY_REGIONS', message: `${tinyCount} regiones < 5mm² — pueden perderse en producción física.` });
  }

  // Wide satin
  const satinWide = regionPlans.filter(r => r.stitchType === 'satin' && (r.areaMm2||0) > 200).length;
  if (satinWide > 0) {
    warnings.push({ level: 'warn', code: 'SATIN_TOO_WIDE', message: `${satinWide} zona(s) satin muy amplia(s) — riesgo de puntadas flojas. Cambiar a fill.` });
  }

  // Small fill
  const smallFill = regionPlans.filter(r => r.stitchType === 'fill' && (r.areaMm2||0) < 15).length;
  if (smallFill > 0) {
    warnings.push({ level: 'info', code: 'FILL_SMALL', message: `${smallFill} zona(s) fill < 15mm² — considera running stitch para mejor resultado.` });
  }

  // Stretch fabric missing underlay
  if (config.fabric_type === 'Lycra') {
    const noUnderlay = regionPlans.filter(r => r.stitchType === 'fill' && !r.underlay).length;
    if (noUnderlay > 0) {
      warnings.push({ level: 'warn', code: 'LYCRA_NO_UNDERLAY', message: `Tejido Lycra: ${noUnderlay} zona(s) fill sin underlay — necesario para estabilizar.` });
    }
  }

  // High jump count
  const jumps = regionPlans.reduce((s, r) => s + (r.jumpsBefore || 0), 0);
  if (jumps > 30) {
    warnings.push({ level: 'info', code: 'HIGH_JUMPS', message: `Alta densidad de saltos (~${jumps}). El Travel Optimizer puede reducirlos.` });
  }

  return warnings;
}

// ─── 9. Time & Thread Estimation ─────────────────────────────────────────────

function estimateProduction(totalStitches, colorChanges, jumpCount) {
  const stitchSec  = (totalStitches / MACHINE_SPM) * 60;
  const changeSec  = colorChanges * COLOR_CHANGE_SEC;
  const jumpSec    = jumpCount * JUMP_PENALTY_SEC;
  const totalSec   = stitchSec + changeSec + jumpSec;
  const totalMin   = totalSec / 60;

  const threadMm   = totalStitches * THREAD_MM_PER_STITCH;
  const threadGrams = threadMm / MM_PER_GRAM;

  return {
    totalMinutes:   +totalMin.toFixed(1),
    stitchMinutes:  +(stitchSec/60).toFixed(1),
    colorMinutes:   +(changeSec/60).toFixed(1),
    jumpMinutes:    +(jumpSec/60).toFixed(1),
    formatted: totalMin < 1
      ? '<1 min'
      : totalMin < 60
      ? `${Math.round(totalMin)} min`
      : `${Math.floor(totalMin/60)}h ${Math.round(totalMin%60)}min`,
    threadMm:     Math.round(threadMm),
    threadGrams:  +threadGrams.toFixed(1),
  };
}

// ─── Viability Score ──────────────────────────────────────────────────────────

function computeViabilityScore(warnings, regionPlans, colorChanges) {
  let score = 100;
  for (const w of warnings) {
    if (w.level === 'error') score -= 25;
    else if (w.level === 'warn') score -= 8;
    else score -= 2;
  }
  if (colorChanges > 10) score -= 10;
  if (colorChanges > 15) score -= 10;
  const lowConf = regionPlans.filter(r => r.confidence < 0.75).length;
  score -= Math.min(15, lowConf * 2);
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─── Narrative Summary ────────────────────────────────────────────────────────

function buildNarrative({ fillCount, satinCount, runCount, uniqueColors, colorChanges, viabilityScore, production, warnings, jumpCount }) {
  const parts = [];
  if (fillCount > 0 && satinCount > 0) {
    parts.push(`Diseño mixto: ${fillCount} zona(s) fill Tatami + ${satinCount} zona(s) satén.`);
  } else if (fillCount > 0) {
    parts.push(`Diseño de relleno (${fillCount} zonas Tatami).`);
  } else if (satinCount > 0) {
    parts.push(`Diseño de satén puro (${satinCount} zonas) — ideal para formas y texto.`);
  }
  if (runCount > 0) parts.push(`${runCount} contorno(s) en pespunte.`);
  parts.push(`${uniqueColors} hilo(s) · ${colorChanges} cambio(s) · ~${jumpCount} salto(s) · ${production.formatted}.`);
  if (viabilityScore >= 85) parts.push('✓ Diseño viable para producción directa.');
  else if (viabilityScore >= 60) parts.push('⚠ Revisión recomendada antes de producción.');
  else parts.push('✗ Problemas detectados — revisa las advertencias antes de producir.');
  return parts.join(' ');
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Generates a complete, intelligent stitch plan for a set of regions.
 *
 * @param {Array}  regions  - enriched regions from RegionBuilder
 * @param {Object} config   - { width_mm, height_mm, fabric_type, ... }
 * @returns {StitchPlan}
 */
export function generateStitchPlan(regions, config = {}) {
  const { width_mm = 100, height_mm = 100, fabric_type = 'Algodón' } = config;

  if (!regions || regions.length === 0) return null;

  // ── Step 1–5: Classify + compute per-region decisions ──
  const regionPlans = regions
    .filter(r => (r.path_points?.length ?? 0) >= 3 || (r.area_mm2 || 0) > 0)
    .map(region => {
      const classification = classifyStitchType(region);
      const stitchType     = classification.type;
      const optimalAngle   = computeOptimalAngle(region);
      const { density, compensation } = computeDensityAndCompensation(region, stitchType, fabric_type);
      const underlay   = computeUnderlay(region, stitchType, fabric_type);
      const layerRank  = getLayerRank(region, stitchType, classification.layer);

      // Stitch count: use pre-computed if available, otherwise canonical formula
      const area  = region.area_mm2   || 0;
      const perim = region.perimeter_mm || Math.max(1, Math.sqrt(area) * 3.5);
      let estimatedStitches = region.stitch_count > 0 ? region.stitch_count : 0;
      if (!estimatedStitches) {
        if (stitchType === 'fill')          estimatedStitches = Math.round(area * 2.5 * (1 / Math.max(0.25, density)));
        else if (stitchType === 'satin')    estimatedStitches = Math.round(perim * 2 * (area / Math.max(1, perim)));
        else                                estimatedStitches = Math.round(perim / 1.5);
      }

      return {
        regionId:          region.id,
        regionName:        region.name || region.id,
        color:             region.color || '#000000',
        areaMm2:           area,
        perimeterMm:       perim,
        centroid:          region.centroid || [0.5, 0.5],

        // Stitch decisions
        stitchType,
        reason:            classification.reason,
        confidence:        classification.confidence,
        optimalAngle,
        density,
        compensation,
        underlay,
        layerRank,

        // Underlay flag (for UI compatibility)
        hasUnderlay: !!underlay,

        // Production
        estimatedStitches,

        // Geometry snapshot (from regionBuilder)
        avgWidthMm:    region.avg_width_mm   || 0,
        maxThicknessMm: region.max_thickness_mm || 0,
        convexity:     region.convexity      || 1,
        complexity:    region.complexity     || { score: 0, level: 'simple' },
        qualityScore:  region.qualityScore   || 80,

        // Semantic context
        semanticObject: region.semantic_object || null,
        semanticClass:  region.semantic_class  || null,
      };
    });

  // ── Step 6–7: Color grouping + travel path optimization ──
  const { sequenced, colorChanges, uniqueColors, jumpCount } = optimizeSequence(regionPlans);

  // Attach travel order to plans
  const finalSequence = sequenced.map((rp, i) => ({
    ...rp,
    travelOrder:  i + 1,
    colorChangeAt: i === 0 || sequenced[i].color !== sequenced[i-1]?.color,
  }));

  // ── Step 8: Warnings ──
  const warnings = generateWarnings(regions, finalSequence, config);

  // ── Step 9: Production estimates ──
  const totalStitches = finalSequence.reduce((s, r) => s + r.estimatedStitches, 0);
  const production    = estimateProduction(totalStitches, colorChanges, jumpCount);

  // ── Viability ──
  const viabilityScore = computeViabilityScore(warnings, finalSequence, colorChanges);

  // ── Summary counts ──
  const fillCount  = finalSequence.filter(r => r.stitchType === 'fill').length;
  const satinCount = finalSequence.filter(r => r.stitchType === 'satin').length;
  const runCount   = finalSequence.filter(r => r.stitchType === 'running_stitch').length;
  const withUnderlay = finalSequence.filter(r => r.hasUnderlay).length;

  return {
    // Full ordered sequence with all decisions
    sequence: finalSequence,

    // Summary statistics
    summary: {
      totalRegions: finalSequence.length,
      uniqueColors,
      colorChanges,
      totalStitches,
      jumpCount,
      fillCount,
      satinCount,
      runCount,
      withUnderlay,
      viabilityScore,
      production,
      fabricType:    fabric_type,
      designSizeMm: `${width_mm}×${height_mm}`,
    },

    // Actionable warnings
    warnings,

    // Human-readable narrative
    narrative: buildNarrative({ fillCount, satinCount, runCount, uniqueColors, colorChanges, viabilityScore, production, warnings, jumpCount }),
  };
}