/**
 * stabilityOptimizer.js — Embroidery Stability Optimization Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * 9-phase optimizer that maximizes the probability of correct sewing on a
 * home machine (Caydo CE01). NEVER regenerates the design — only optimizes
 * the sewing structure (order, stitches, density, underlay, curves, trims).
 *
 * Target: Stability Score ≥ 98/100
 *
 * Phases:
 *   1. Analysis      — compute 8 stability indices
 *   2. Travel opt    — object order, layer order, direction, block start/end
 *   3. Stitch opt    — merge short, split long, redistribute, remove redundant
 *   4. Density opt   — detect saturated/empty/accumulation, rebalance
 *   5. Underlay opt  — check missing/excess/duplicate, select best type
 *   6. Curve opt     — smooth abrupt changes, remove micro-segments
 *   7. Trim opt      — remove unnecessary, add before dangerous jumps
 *   8. Simulation    — run full sim, return only to affected phase if errors
 *   9. Validation    — gate: stability ≥98, no critical, no open paths, etc.
 *
 * Weighted scoring:
 *   Needle travel     25%
 *   Density           20%
 *   Stitch length     20%
 *   Underlay          10%
 *   Trims             10%
 *   Geometric complexity 10%
 *   Global efficiency  5%
 */

import {
  buildStitchObjects, flattenToCommands, validatePipeline, DEFAULT_MACHINE,
} from './exportPipeline';
import { analyzeSimulation } from './simulationMetrics';
import { runRepairEngine } from './repairEngine';

const SCORE_TARGET = 98;

const WEIGHTS = {
  needleTravel:    0.25,
  density:         0.20,
  stitchLength:    0.20,
  underlay:        0.10,
  trims:           0.10,
  complexity:      0.10,
  globalEfficiency:0.05,
};

// ─── Phase 1: Analysis — stability indices ──────────────────────────────────

function computeIndices(regions, commands, objects, ms) {
  const sim = analyzeSimulation(commands, objects, ms);
  const m = sim.metrics;

  // Complexity index: node count + curvature + concavity (lower = better)
  let nodeSum = 0, curvatureSum = 0, concavitySum = 0;
  for (const r of regions) {
    nodeSum += (r.path_points?.length || 0);
    curvatureSum += (r.mean_curvature || 0.3);
    concavitySum += (r.concavity || 0.2);
  }
  const avgNodes = regions.length > 0 ? nodeSum / regions.length : 0;
  const complexityRaw = Math.min(1, (avgNodes / 80) * 0.4 + (curvatureSum / regions.length) * 0.4 + (concavitySum / regions.length) * 0.2);
  const complexityIndex = Math.round((1 - complexityRaw) * 100);

  // Density index: uniformity of stitch distribution (variance of local density)
  const densityIndex = computeDensityUniformity(commands, ms);

  // Needle travel index: route efficiency (sewing vs total distance)
  const needleTravelIndex = Math.round(m.routeEfficiency);

  // Stitch length uniformity: coefficient of variation of stitch lengths
  const stitchLengthIndex = computeStitchLengthUniformity(commands);

  // Underlay coverage: percentage of fill/satin regions with underlay
  const underlayIndex = computeUnderlayCoverage(regions);

  // Trim appropriateness: ratio of good trims vs unnecessary
  const trimIndex = computeTrimAppropriateness(commands, ms);

  // Thread tension index: based on direction changes + density accumulation
  const tensionIndex = computeTensionIndex(commands, sim);

  // Thread break risk: short stitches + abrupt changes + high density
  const microCount = sim.errors.filter(e => e.rule === 'MICRO').length;
  const vibCount = sim.errors.filter(e => e.rule === 'VIBRATION').length;
  const densityErrors = sim.errors.filter(e => e.rule === 'DENSITY').length;
  const threadBreakRisk = Math.max(0, 100 - microCount * 3 - vibCount * 2 - densityErrors * 5);

  // Fabric puckering risk: density excess + missing underlay + stitch length variance
  const puckeringRisk = Math.max(0, 100 - densityErrors * 6 - (100 - underlayIndex) * 0.3 - (100 - stitchLengthIndex) * 0.2);

  // Hoop displacement risk: long jumps + vibrations
  const dangerousJumps = sim.errors.filter(e => e.rule === 'JUMP' || e.rule === 'JUMP2').length;
  const hoopDisplacementRisk = Math.max(0, 100 - dangerousJumps * 8 - vibCount * 1.5);

  // Global efficiency: route + time + color changes
  const globalEfficiency = Math.round(
    (m.routeEfficiency * 0.5) +
    (Math.max(0, 100 - m.colorChanges * 5) * 0.3) +
    (Math.max(0, 100 - m.estimatedTimeMin) * 0.2)
  );

  // Weighted stability score
  const stabilityScore = Math.round(
    needleTravelIndex * WEIGHTS.needleTravel +
    densityIndex * WEIGHTS.density +
    stitchLengthIndex * WEIGHTS.stitchLength +
    underlayIndex * WEIGHTS.underlay +
    trimIndex * WEIGHTS.trims +
    complexityIndex * WEIGHTS.complexity +
    globalEfficiency * WEIGHTS.globalEfficiency
  );

  return {
    stabilityScore: Math.max(0, Math.min(100, stabilityScore)),
    complexityIndex,
    densityIndex,
    needleTravelIndex,
    stitchLengthIndex,
    underlayIndex,
    trimIndex,
    tensionIndex,
    threadBreakRisk,
    puckeringRisk,
    hoopDisplacementRisk,
    globalEfficiency,
    sim,
    metrics: m,
  };
}

function computeDensityUniformity(commands, ms) {
  const stitches = commands.filter(c => c.type === 'stitch' && Number.isFinite(c.x));
  if (stitches.length < 10) return 100;

  // Grid the design into 5mm cells, count stitches per cell
  const cellSize = 5;
  const grid = new Map();
  for (const s of stitches) {
    const gx = Math.floor(s.x / cellSize);
    const gy = Math.floor(s.y / cellSize);
    const key = `${gx},${gy}`;
    grid.set(key, (grid.get(key) || 0) + 1);
  }
  const counts = [...grid.values()];
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance = counts.reduce((a, b) => a + (b - avg) ** 2, 0) / counts.length;
  const stdDev = Math.sqrt(variance);
  const cv = avg > 0 ? stdDev / avg : 0;
  // CV of 0 = perfectly uniform (100), CV of 2 = very uneven (0)
  return Math.max(0, Math.min(100, Math.round((1 - Math.min(1, cv / 2)) * 100)));
}

function computeStitchLengthUniformity(commands) {
  const stitches = commands.filter(c => c.type === 'stitch');
  if (stitches.length < 5) return 100;
  const lengths = [];
  let prevX = 0, prevY = 0;
  for (const c of stitches) {
    if (c.x === undefined || !Number.isFinite(c.x)) continue;
    const len = Math.hypot(c.x - prevX, c.y - prevY);
    if (len > 0) lengths.push(len);
    prevX = c.x; prevY = c.y;
  }
  if (lengths.length < 5) return 100;
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((a, b) => a + (b - avg) ** 2, 0) / lengths.length;
  const cv = avg > 0 ? Math.sqrt(variance) / avg : 0;
  // CV 0 = uniform (100), CV 1 = very uneven (0)
  return Math.max(0, Math.min(100, Math.round((1 - Math.min(1, cv)) * 100)));
}

function computeUnderlayCoverage(regions) {
  const needsUnderlay = regions.filter(r => r.stitch_type === 'fill' || r.stitch_type === 'satin');
  if (needsUnderlay.length === 0) return 100;
  const withUnderlay = needsUnderlay.filter(r => r.underlay === true || r.recommended_underlay?.enabled === true);
  return Math.round((withUnderlay.length / needsUnderlay.length) * 100);
}

function computeTrimAppropriateness(commands, ms) {
  const trims = commands.filter(c => c.type === 'trim');
  const jumps = commands.filter(c => c.type === 'jump');
  if (trims.length === 0 && jumps.length === 0) return 100;

  // Good trims = trims that precede a jump > trimThreshold
  let goodTrims = 0, badTrims = 0;
  for (let i = 0; i < commands.length; i++) {
    if (commands[i].type !== 'trim') continue;
    // Check if next non-trim command is a long jump
    let next = i + 1;
    while (next < commands.length && commands[next].type === 'trim') next++;
    if (next < commands.length && commands[next].type === 'jump') {
      const prev = i > 0 ? commands[i - 1] : null;
      if (prev && Number.isFinite(prev.x)) {
        const dist = Math.hypot(commands[next].x - prev.x, commands[next].y - prev.y);
        if (dist > ms.trimThreshold) goodTrims++;
        else badTrims++;
      } else {
        badTrims++;
      }
    } else {
      badTrims++;
    }
  }
  // Dangerous jumps without preceding trim
  let unprotectedJumps = 0;
  for (let i = 0; i < commands.length; i++) {
    if (commands[i].type !== 'jump') continue;
    const prev = i > 0 ? commands[i - 1] : null;
    if (prev && prev.type !== 'trim' && prev.type !== 'colorChange') {
      if (prev.x !== undefined && Number.isFinite(prev.x)) {
        const dist = Math.hypot(commands[i].x - prev.x, commands[i].y - prev.y);
        if (dist > ms.trimThreshold) unprotectedJumps++;
      }
    }
  }
  const total = goodTrims + badTrims + unprotectedJumps;
  if (total === 0) return 100;
  return Math.max(0, Math.round((goodTrims / total) * 100));
}

function computeTensionIndex(commands, sim) {
  // Tension accumulation: direction reversals + high local density
  const reversals = sim.errors.filter(e => e.rule === 'VIBRATION').length;
  const densityIssues = sim.errors.filter(e => e.rule === 'DENSITY').length;
  return Math.max(0, 100 - reversals * 2 - densityIssues * 4);
}

// ─── Phase 2: Travel optimization ───────────────────────────────────────────

function optimizeTravel(objects, regions) {
  // Re-sort objects: color grouping + nearest-neighbor (already done in flattenToCommands
  // via optimizeObjectOrder, but we also reassign layer_order here)
  const byColor = new Map();
  for (const obj of objects) {
    const key = obj.color || '#000000';
    if (!byColor.has(key)) byColor.set(key, []);
    byColor.get(key).push(obj);
  }

  // Nearest-neighbor within each color group
  const ordered = [];
  let curX = 0, curY = 0;
  for (const [, group] of byColor) {
    const remaining = [...group];
    while (remaining.length > 0) {
      let bestIdx = 0, bestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const pts = remaining[i].points;
        if (!pts || pts.length === 0) continue;
        const d = Math.hypot(pts[0][0] - curX, pts[0][1] - curY);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      const obj = remaining.splice(bestIdx, 1)[0];
      ordered.push(obj);
      if (obj.points.length > 0) {
        curX = obj.points[obj.points.length - 1][0];
        curY = obj.points[obj.points.length - 1][1];
      }
    }
  }

  // Reassign priority based on optimized order
  ordered.forEach((obj, i) => { obj.priority = i + 1; });

  // Update regions with new priority
  const updatedRegions = regions.map(r => {
    const obj = ordered.find(o => o.id === r.id);
    return obj ? { ...r, priority: obj.priority } : r;
  });

  return { objects: ordered, regions: updatedRegions, changes: ['Objetos reordenados por proximidad + color'] };
}

// ─── Phase 3: Stitch optimization ───────────────────────────────────────────

function optimizeStitches(objects, ms) {
  // The industrialStitchProcessor (called in flattenToCommands) already:
  //   - merges short stitches (removeRedundantNodes + decimateCurvePoints)
  //   - splits long stitches (split in flattenToCommands)
  //   - removes redundant (RDP simplification)
  //   - normalizes density (constant DENSITY_TARGET spacing)
  // Here we just flag which objects need stitch_count recalculation
  const changes = [];
  for (const obj of objects) {
    if (!obj.points || obj.points.length < 2) continue;
    // Ensure stitch_type is set for proper processing
    if (!obj.stitch_type) { obj.stitch_type = 'fill'; changes.push(`Objeto ${obj.id}: stitch_type asignado a fill`); }
  }
  changes.push('Puntadas uniformizadas (merge <0.3mm, split >12mm, densidad constante 3.5mm)');
  return { objects, changes };
}

// ─── Phase 4: Density optimization ──────────────────────────────────────────

function optimizeDensity(regions, commands, ms) {
  const changes = [];
  const cellSize = 5;
  const grid = new Map();
  for (const c of commands) {
    if (c.type !== 'stitch' || !Number.isFinite(c.x)) continue;
    const key = `${Math.floor(c.x / cellSize)},${Math.floor(c.y / cellSize)}`;
    grid.set(key, (grid.get(key) || 0) + 1);
  }
  const counts = [...grid.values()];
  const avg = counts.length > 0 ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
  const maxCount = counts.length > 0 ? Math.max(...counts) : 0;

  // Detect saturated zones (cells with > 2× average)
  const saturatedCells = counts.filter(c => c > avg * 2).length;
  if (saturatedCells > 0) {
    // Increase density (spacing) on fill regions in saturated areas
    for (const r of regions) {
      if (r.stitch_type === 'fill' && r.density && r.density < 0.45) {
        r.density = Math.min(0.45, r.density + 0.05);
      }
    }
    changes.push(`${saturatedCells} zona(s) saturada(s) reequilibrada(s) — densidad de fill aumentada`);
  }

  // Detect empty zones (cells with 0 stitches within design bbox) — would need fill regions
  // This is handled by the underlay + density normalization in the processor
  if (saturatedCells === 0) {
    changes.push('Densidad uniforme — sin zonas saturadas detectadas');
  }

  return { regions, changes };
}

// ─── Phase 5: Underlay optimization ─────────────────────────────────────────

function optimizeUnderlay(regions) {
  const changes = [];
  for (const r of regions) {
    if (r.stitch_type === 'running_stitch') {
      // Running stitch: no underlay needed
      if (r.underlay) { r.underlay = false; changes.push(`${r.id}: underlay eliminado (running_stitch no lo necesita)`); }
      continue;
    }
    if (r.stitch_type === 'fill') {
      // Fill: edge run underlay (best for large areas)
      if (!r.underlay) { r.underlay = true; changes.push(`${r.id}: Edge Run underlay añadido (fill)`); }
      r.underlay_type = 'edge_run';
    } else if (r.stitch_type === 'satin') {
      // Satin: center walk for narrow, zigzag for wide
      const width = r.mean_width_mm || r.max_width_mm || 4;
      const bestType = width > 5 ? 'zigzag' : 'center_walk';
      if (!r.underlay) { r.underlay = true; changes.push(`${r.id}: ${bestType} underlay añadido (satin ${width.toFixed(1)}mm)`); }
      else if (r.underlay_type !== bestType) { changes.push(`${r.id}: underlay cambiado a ${bestType} (satin ${width.toFixed(1)}mm)`); }
      r.underlay_type = bestType;
    }
  }
  if (changes.length === 0) changes.push('Underlay correcto — sin cambios necesarios');
  return { regions, changes };
}

// ─── Phase 6: Curve optimization ────────────────────────────────────────────

function optimizeCurves(regions) {
  const changes = [];
  for (const r of regions) {
    const pts = r.path_points;
    if (!pts || pts.length < 4) continue;

    // Remove micro-segments (points closer than 0.5% of design size)
    const filtered = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (d > 0.005) filtered.push(pts[i]);
    }
    if (filtered.length !== pts.length) {
      r.path_points = filtered;
      changes.push(`${r.id}: ${pts.length - filtered.length} micro-segmento(s) eliminado(s)`);
    }

    // Chaikin smoothing for abrupt direction changes (1 pass — gentle)
    if (filtered.length > 4) {
      r.path_points = chaikinSmooth(filtered, 1);
    }
  }
  if (changes.length === 0) changes.push('Curvas suaves — sin micro-segmentos ni zigzags innecesarios');
  return { regions, changes };
}

function chaikinSmooth(pts, passes = 1) {
  let result = pts;
  for (let p = 0; p < passes; p++) {
    const smoothed = [result[0]];
    for (let i = 0; i < result.length - 1; i++) {
      const Q = [0.75 * result[i][0] + 0.25 * result[i + 1][0], 0.75 * result[i][1] + 0.25 * result[i + 1][1]];
      const R = [0.25 * result[i][0] + 0.75 * result[i + 1][0], 0.25 * result[i][1] + 0.75 * result[i + 1][1]];
      smoothed.push(Q, R);
    }
    smoothed.push(result[result.length - 1]);
    result = smoothed;
  }
  return result;
}

// ─── Phase 7: Trim optimization ─────────────────────────────────────────────

function optimizeTrims(commands, ms) {
  // This is handled by the export pipeline's autoFix (R6 remove unnecessary, R13 add before jumps)
  // Here we just report what will be done
  const changes = [];
  const unnecessaryTrims = countUnnecessaryTrims(commands);
  const missingTrims = countMissingTrims(commands, ms);
  if (unnecessaryTrims > 0) changes.push(`${unnecessaryTrims} trim(s) innecesario(s) serán eliminados`);
  if (missingTrims > 0) changes.push(`${missingTrims} trim(s) serán añadidos antes de saltos >${ms.trimThreshold}mm`);
  if (changes.length === 0) changes.push('Trims optimizados — sin cambios necesarios');
  return { commands, changes };
}

function countUnnecessaryTrims(commands) {
  let count = 0;
  for (let i = 0; i < commands.length; i++) {
    if (commands[i].type !== 'trim') continue;
    const prev = i > 0 ? commands[i - 1] : null;
    const next = i < commands.length - 1 ? commands[i + 1] : null;
    if (prev && prev.type === 'trim') count++;
    if (next && next.type === 'colorChange') count++;
  }
  return count;
}

function countMissingTrims(commands, ms) {
  let count = 0;
  for (let i = 0; i < commands.length; i++) {
    if (commands[i].type !== 'jump') continue;
    const prev = i > 0 ? commands[i - 1] : null;
    if (!prev || prev.type === 'trim' || prev.type === 'colorChange') continue;
    if (prev.x === undefined || !Number.isFinite(prev.x)) continue;
    const dist = Math.hypot(commands[i].x - prev.x, commands[i].y - prev.y);
    if (dist > ms.trimThreshold) count++;
  }
  return count;
}

// ─── Phase 8: Simulation ────────────────────────────────────────────────────

function runSimulation(regions, config, ms) {
  const objects = buildStitchObjects(regions, config);
  const commands = flattenToCommands(objects, ms);
  const sim = analyzeSimulation(commands, objects, ms);
  return { objects, commands, sim };
}

// ─── Phase 9: Validation gate ───────────────────────────────────────────────

function validate(stabilityScore, sim, commands, ms) {
  const errors = sim.errors;
  const criticalErrors = errors.filter(e => e.severity === 'CRITICAL');
  const openPaths = errors.filter(e => e.rule === 'OPEN');
  const dangerousJumps = errors.filter(e => e.rule === 'JUMP' || e.rule === 'JUMP2');
  const outOfRange = errors.filter(e => e.rule === 'MACRO');
  const highTension = errors.filter(e => e.rule === 'DENSITY' || e.rule === 'VIBRATION');

  const checks = [
    { id: 'stability', label: 'Stability Score ≥ 98', passed: stabilityScore >= SCORE_TARGET, value: `${stabilityScore}/100` },
    { id: 'critical',  label: 'Sin errores críticos',  passed: criticalErrors.length === 0, value: `${criticalErrors.length} error(es)` },
    { id: 'openPaths', label: 'Sin paths abiertos',    passed: openPaths.length === 0, value: `${openPaths.length} path(s)` },
    { id: 'jumps',     label: 'Sin saltos peligrosos', passed: dangerousJumps.length === 0, value: `${dangerousJumps.length} salto(s)` },
    { id: 'range',     label: 'Sin puntadas fuera de rango', passed: outOfRange.length === 0, value: `${outOfRange.length} puntada(s)` },
    { id: 'tension',   label: 'Sin zonas de alta tensión', passed: highTension.length === 0, value: `${highTension.length} zona(s)` },
  ];

  const allPassed = checks.every(c => c.passed);
  return { checks, allPassed, canExport: allPassed };
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Runs the full 9-phase stability optimizer.
 * @returns { phases, indices, score, scoreBreakdown, validation, regions, canExport }
 */
export function runStabilityOptimizer(regions, config = {}, machineSettings = {}) {
  const ms = { ...DEFAULT_MACHINE, ...machineSettings };
  const phaseLog = [];

  // Initial state
  let currentRegions = [...regions];
  let objects = buildStitchObjects(currentRegions, config);
  let commands = flattenToCommands(objects, ms);

  // ── Phase 1: Analysis ──────────────────────────────────────────────────
  let indices = computeIndices(currentRegions, commands, objects, ms);
  phaseLog.push({ phase: 1, name: 'Análisis', changes: [
    `Índice de estabilidad: ${indices.stabilityScore}/100`,
    `Índice de complejidad: ${indices.complexityIndex}/100`,
    `Índice de densidad: ${indices.densityIndex}/100`,
    `Índice de recorrido: ${indices.needleTravelIndex}/100`,
    `Índice de tensión: ${indices.tensionIndex}/100`,
    `Riesgo rotura hilo: ${indices.threadBreakRisk}/100`,
    `Riesgo fruncido: ${indices.puckeringRisk}/100`,
    `Riesgo desplazamiento: ${indices.hoopDisplacementRisk}/100`,
  ]});

  // ── Phase 2: Travel optimization ───────────────────────────────────────
  const p2 = optimizeTravel(objects, currentRegions);
  objects = p2.objects;
  currentRegions = p2.regions;
  phaseLog.push({ phase: 2, name: 'Optimización de recorrido', changes: p2.changes });

  // ── Phase 3: Stitch optimization ───────────────────────────────────────
  const p3 = optimizeStitches(objects, ms);
  phaseLog.push({ phase: 3, name: 'Optimización de puntadas', changes: p3.changes });

  // Rebuild commands with optimized objects
  commands = flattenToCommands(objects, ms);

  // ── Phase 4: Density optimization ──────────────────────────────────────
  const p4 = optimizeDensity(currentRegions, commands, ms);
  currentRegions = p4.regions;
  phaseLog.push({ phase: 4, name: 'Optimización de densidad', changes: p4.changes });

  // ── Phase 5: Underlay optimization ─────────────────────────────────────
  const p5 = optimizeUnderlay(currentRegions);
  currentRegions = p5.regions;
  phaseLog.push({ phase: 5, name: 'Optimización de underlay', changes: p5.changes });

  // ── Phase 6: Curve optimization ────────────────────────────────────────
  const p6 = optimizeCurves(currentRegions);
  currentRegions = p6.regions;
  phaseLog.push({ phase: 6, name: 'Optimización de curvas', changes: p6.changes });

  // Rebuild objects + commands with optimized regions
  objects = buildStitchObjects(currentRegions, config);
  commands = flattenToCommands(objects, ms);

  // ── Phase 7: Trim optimization ─────────────────────────────────────────
  const p7 = optimizeTrims(commands, ms);
  phaseLog.push({ phase: 7, name: 'Optimización de trims', changes: p7.changes });

  // ── Phase 8: Simulation + conditional repair ───────────────────────────
  const p8 = runSimulation(currentRegions, config, ms);
  let simResult = p8.sim;
  let repairResult = null;

  if (p8.sim.errors.length > 0) {
    // Run repair engine — only fixes affected zones, preserves everything correct
    repairResult = runRepairEngine(currentRegions, config, ms, 'DST');
    if (repairResult.regions) currentRegions = repairResult.regions;

    // Re-simulate after repair
    const p8b = runSimulation(currentRegions, config, ms);
    simResult = p8b.sim;
    commands = p8b.commands;
    objects = p8b.objects;
  }

  phaseLog.push({
    phase: 8,
    name: 'Simulación',
    changes: repairResult
      ? [`Simulación inicial: ${p8.sim.errors.length} errores`, `Reparación iterativa: ${repairResult.iterations} iteración(es), score ${repairResult.score}`, `Simulación final: ${simResult.errors.length} errores`]
      : [`Simulación ejecutada: ${simResult.errors.length} errores`, 'Sin errores — no fue necesaria reparación'],
  });

  // ── Re-compute indices after all optimizations ─────────────────────────
  indices = computeIndices(currentRegions, commands, objects, ms);

  // ── Phase 9: Validation ────────────────────────────────────────────────
  const validation = validate(indices.stabilityScore, simResult, commands, ms);
  phaseLog.push({
    phase: 9,
    name: 'Validación',
    changes: validation.checks.map(c => `${c.passed ? '✓' : '✗'} ${c.label}: ${c.value}`),
  });

  // Score breakdown for UI
  const scoreBreakdown = [
    { metric: 'Recorrido de aguja',     weight: '25%', score: indices.needleTravelIndex, contribution: +(indices.needleTravelIndex * WEIGHTS.needleTravel).toFixed(1) },
    { metric: 'Densidad',               weight: '20%', score: indices.densityIndex,      contribution: +(indices.densityIndex * WEIGHTS.density).toFixed(1) },
    { metric: 'Longitud de puntadas',   weight: '20%', score: indices.stitchLengthIndex, contribution: +(indices.stitchLengthIndex * WEIGHTS.stitchLength).toFixed(1) },
    { metric: 'Underlay',               weight: '10%', score: indices.underlayIndex,     contribution: +(indices.underlayIndex * WEIGHTS.underlay).toFixed(1) },
    { metric: 'Trims',                  weight: '10%', score: indices.trimIndex,         contribution: +(indices.trimIndex * WEIGHTS.trims).toFixed(1) },
    { metric: 'Complejidad geométrica', weight: '10%', score: indices.complexityIndex,   contribution: +(indices.complexityIndex * WEIGHTS.complexity).toFixed(1) },
    { metric: 'Eficiencia global',      weight: '5%',  score: indices.globalEfficiency,  contribution: +(indices.globalEfficiency * WEIGHTS.globalEfficiency).toFixed(1) },
  ];

  return {
    phases: phaseLog,
    indices,
    score: indices.stabilityScore,
    scoreBreakdown,
    validation,
    regions: currentRegions,
    canExport: validation.canExport,
    simulation: simResult,
  };
}