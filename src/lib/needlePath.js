/**
 * needlePath.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Motor de cálculo del recorrido óptimo de la aguja entre regiones.
 * Minimiza saltos y cambios de hilo basándose en:
 *  - Proximidad euclidiana entre centroides
 *  - Prioridad de regiones (capas base primero)
 *  - Agrupación por color (evita cambios innecesarios)
 *  - Ponderaciones configurables
 */

// ─── Constantes de optimización ──────────────────────────────────────────────

const OPTIMIZATION_WEIGHTS = {
  distanceFactor:  0.4,   // peso de la proximidad en TSP
  colorChangePenalty: 100, // penalización por cambio de hilo (en mm equivalentes)
  priorityBonus:   0.3,   // bonus para regiones prioritarias
};

// ─── Helpers geométricos ──────────────────────────────────────────────────────

function getCentroid(region) {
  if (region.centroid) return region.centroid;
  if (region.path_points?.length === 0) return [0.5, 0.5];
  const pts = region.path_points;
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return [cx, cy];
}

function distance(p1, p2) {
  return Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
}

// ─── Costo de transición (penaliza cambios de hilo y distancia) ─────────────

function transitionCost(fromRegion, toRegion, config = {}) {
  const { distanceFactor = 0.4, colorChangePenalty = 100 } = config;

  const c1 = getCentroid(fromRegion);
  const c2 = getCentroid(toRegion);
  const dist = distance(c1, c2);

  // Penalización por cambio de color
  const colorPenalty = fromRegion.color !== toRegion.color ? colorChangePenalty : 0;

  // Costo total: distancia + penalización por color (normalizado a [0,1])
  return dist * distanceFactor + (colorPenalty / 100) * (1 - distanceFactor);
}

// ─── TSP Greedy con soporte a prioridad y color ──────────────────────────────

function greedyTSPWithPriority(regions, startPos = [0.5, 0.5], config = {}) {
  if (regions.length === 0) return [];

  const remaining = [...regions];
  const ordered = [];
  let cursor = startPos;
  let lastColor = null;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestCost = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const c = getCentroid(candidate);

      // Base: distancia euclidiana
      let cost = distance(cursor, c);

      // Bonus por ser del mismo color (evita cambios)
      if (lastColor && candidate.color === lastColor) {
        cost *= 0.7; // 30% de descuento si mismo color
      }

      // Bonus por prioridad (regiones prioritarias primero)
      if (candidate.priority) {
        cost *= Math.max(0.5, 1 - candidate.priority / 5 * 0.3);
      }

      // Penalidad por cambio de color (más grave si hay alternativas del mismo color)
      if (lastColor && candidate.color !== lastColor) {
        const sameColorAlternative = remaining.some(
          r => r.color === lastColor && r.id !== candidate.id
        );
        if (sameColorAlternative) {
          cost *= 1.5; // penaliza cambio si hay alternativas
        }
      }

      if (cost < bestCost) {
        bestCost = cost;
        bestIdx = i;
      }
    }

    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    cursor = getCentroid(next);
    lastColor = next.color;
  }

  return ordered;
}

// ─── Agrupación por color con optimización intra-grupo ─────────────────────

function optimizeByColorGroup(regions, config = {}) {
  // Agrupar por color
  const colorGroups = {};
  for (const r of regions) {
    const color = r.color || '#000000';
    if (!colorGroups[color]) colorGroups[color] = [];
    colorGroups[color].push(r);
  }

  // Convertir a array y ordenar grupos por área total (grandes primero)
  const groups = Object.entries(colorGroups)
    .map(([color, regs]) => ({
      color,
      regions: regs,
      totalArea: regs.reduce((s, r) => s + (r.area_mm2 || 0), 0),
      avgPriority: regs.reduce((s, r) => s + (r.priority || 1), 0) / regs.length,
    }))
    .sort((a, b) => b.avgPriority - a.avgPriority || b.totalArea - a.totalArea);

  // Dentro de cada grupo: TSP local
  for (const group of groups) {
    group.optimizedRegions = greedyTSPWithPriority(group.regions, [0.5, 0.5], config);
  }

  // Ordenar grupos por proximidad global (TSP de grupos)
  const groupCentroids = groups.map(g => {
    const cs = g.optimizedRegions.map(getCentroid);
    return [
      cs.reduce((s, c) => s + c[0], 0) / cs.length,
      cs.reduce((s, c) => s + c[1], 0) / cs.length,
    ];
  });

  const groupsWithCentroid = groups.map((g, i) => ({
    ...g,
    groupCentroid: groupCentroids[i],
  }));

  const orderedGroups = greedyTSPWithPriority(groupsWithCentroid, [0.5, 0.5], config);

  return {
    sequence: orderedGroups.flatMap(g => g.optimizedRegions),
    groups: orderedGroups.map(g => ({
      color: g.color,
      count: g.regions.length,
      totalArea: g.totalArea,
      regionIds: g.optimizedRegions.map(r => r.id),
    })),
  };
}

// ─── Cálculo de métricas de recorrido ──────────────────────────────────────

export function calculateNeedlePathMetrics(sequence, designWidthMm = 100, designHeightMm = 100) {
  if (!sequence || sequence.length === 0) {
    return {
      totalDistance: 0,
      totalJumps: 0,
      colorChanges: 0,
      averageJumpDistance: 0,
      metrics: {},
    };
  }

  let totalDistance = 0;
  let totalJumps = 0;
  let colorChanges = 0;
  const jumps = [];
  let prevColor = null;
  let prevPos = [0, 0]; // inicio en esquina

  for (const region of sequence) {
    const c = getCentroid(region);
    const jumpDist = distance(prevPos, c) * designWidthMm; // escalar a mm

    if (jumpDist > 0.5) {
      totalJumps++;
      jumps.push(jumpDist);
      totalDistance += jumpDist;
    }

    if (prevColor && region.color !== prevColor) {
      colorChanges++;
    }

    prevColor = region.color;
    prevPos = c;
  }

  const averageJumpDistance = jumps.length > 0
    ? jumps.reduce((s, j) => s + j, 0) / jumps.length
    : 0;

  const maxJumpDistance = jumps.length > 0 ? Math.max(...jumps) : 0;
  const minJumpDistance = jumps.length > 0 ? Math.min(...jumps) : 0;

  return {
    totalDistance: Math.round(totalDistance),
    totalJumps,
    colorChanges,
    averageJumpDistance: Math.round(averageJumpDistance * 10) / 10,
    maxJumpDistance: Math.round(maxJumpDistance * 10) / 10,
    minJumpDistance: Math.round(minJumpDistance * 10) / 10,
    regionCount: sequence.length,
    uniqueColors: new Set(sequence.map(r => r.color)).size,
  };
}

// ─── Estimación de tiempo de máquina ──────────────────────────────────────

export function estimateMachineTime(sequence, metrics, speedSpm = 800) {
  const totalStitches = sequence.reduce((s, r) => s + (r.stitch_count || 0), 0);

  // Tiempo de puntadas (segundos)
  const stitchSeconds = (totalStitches / speedSpm) * 60;

  // Tiempo de saltos (asumiendo 300 mm/s de velocidad de salto)
  const jumpSeconds = (metrics.totalDistance || 0) / 300;

  // Tiempo de cambios de hilo (30 segundos por cambio)
  const colorSeconds = (metrics.colorChanges || 0) * 30;

  const totalSeconds = stitchSeconds + jumpSeconds + colorSeconds;

  return {
    stitchSeconds: Math.round(stitchSeconds),
    jumpSeconds: Math.round(jumpSeconds),
    colorSeconds,
    totalSeconds: Math.round(totalSeconds),
    formatted: formatTime(Math.round(totalSeconds)),
  };
}

// ─── Generador de reporte de recorrido ────────────────────────────────────

export function generatePathReport(sequence, metrics, machineTime) {
  const parts = [];

  parts.push(`Recorrido optimizado:`);
  parts.push(`  • ${sequence.length} regiones procesadas en ${metrics.uniqueColors} color(es)`);
  parts.push(`  • Distancia total de saltos: ${metrics.totalDistance} mm`);
  parts.push(`  • Número de saltos: ${metrics.totalJumps}`);
  parts.push(`  • Cambios de hilo: ${metrics.colorChanges}`);
  parts.push(`  • Salto promedio: ${metrics.averageJumpDistance} mm`);
  parts.push(`Tiempo total máquina: ${machineTime.formatted}`);
  parts.push(`  • Puntadas: ${machineTime.stitchSeconds}s`);
  parts.push(`  • Saltos: ${machineTime.jumpSeconds}s`);
  parts.push(`  • Cambios hilo: ${machineTime.colorSeconds}s`);

  return parts.join('\n');
}

// ─── API principal ────────────────────────────────────────────────────────────

/**
 * Calcula el recorrido óptimo de la aguja entre regiones.
 * @param {Array}  regions - regiones enriquecidas
 * @param {Object} config  - { width_mm, height_mm, speed_spm }
 * @returns {Object} { sequence, metrics, machineTime, report, groups }
 */
export function optimizeNeedlePath(regions, config = {}) {
  const {
    width_mm = 100,
    height_mm = 100,
    speed_spm = 800,
  } = config;

  if (!regions || regions.length === 0) {
    return {
      sequence: [],
      metrics: null,
      machineTime: null,
      report: 'Sin regiones para procesar',
      groups: [],
    };
  }

  // 1. Optimizar secuencia considerando color y prioridad
  const { sequence, groups } = optimizeByColorGroup(regions, OPTIMIZATION_WEIGHTS);

  // 2. Calcular métricas del recorrido
  const metrics = calculateNeedlePathMetrics(sequence, width_mm, height_mm);

  // 3. Estimar tiempo de máquina
  const machineTime = estimateMachineTime(sequence, metrics, speed_spm);

  // 4. Generar reporte
  const report = generatePathReport(sequence, metrics, machineTime);

  return {
    sequence,        // orden optimizado de regiones
    metrics,         // distancias, saltos, cambios de color
    machineTime,     // desglose de tiempo
    report,          // reporte legible
    groups,          // agrupaciones por color
  };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatTime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}