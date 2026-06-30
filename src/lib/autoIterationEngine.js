/**
 * ─────────────────────────────────────────────────────────────────────────────
 * StitchPath AI — Motor de Optimización Iterativa
 * Evalúa 26 métricas de calidad, produce score 0-100 y ajusta parámetros.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Definición de métricas (26) con peso y categoría ─────────────────────────
export const METRICS = [
  // Grupo 1: Geometría (35 pts)
  { id: 'm01', name: 'Precisión de contornos',      weight: 6, group: 'Geometría' },
  { id: 'm02', name: 'Suavidad de curvas',           weight: 5, group: 'Geometría' },
  { id: 'm03', name: 'Esquinas deformadas',          weight: 4, group: 'Geometría' },
  { id: 'm04', name: 'Ruido vectorización',          weight: 4, group: 'Geometría' },
  { id: 'm05', name: 'Bordes dentados',              weight: 5, group: 'Geometría' },
  { id: 'm06', name: 'Deformaciones',                weight: 4, group: 'Geometría' },
  { id: 'm07', name: 'Líneas rotas',                 weight: 4, group: 'Geometría' },
  // Grupo 2: Calidad de puntada (35 pts)
  { id: 'm08', name: 'Continuidad de puntadas',      weight: 5, group: 'Puntada' },
  { id: 'm09', name: 'Densidad correcta',            weight: 6, group: 'Puntada' },
  { id: 'm10', name: 'Longitud de puntadas',         weight: 4, group: 'Puntada' },
  { id: 'm11', name: 'Calidad del relleno',          weight: 6, group: 'Puntada' },
  { id: 'm12', name: 'Calidad del satén',            weight: 5, group: 'Puntada' },
  { id: 'm13', name: 'Huecos visibles',              weight: 6, group: 'Puntada' },
  { id: 'm14', name: 'Dirección de costura',         weight: 3, group: 'Puntada' },
  // Grupo 3: Producción (18 pts)
  { id: 'm15', name: 'Compensación del pull',        weight: 3, group: 'Producción' },
  { id: 'm16', name: 'Eliminación de saltos',        weight: 4, group: 'Producción' },
  { id: 'm17', name: 'Reducción cortes de hilo',     weight: 4, group: 'Producción' },
  { id: 'm18', name: 'Secuencia óptima',             weight: 4, group: 'Producción' },
  { id: 'm19', name: 'Estabilidad del bordado',      weight: 3, group: 'Producción' },
  // Grupo 4: Integridad del diseño (12 pts)
  { id: 'm20', name: 'Agujeros entre objetos',       weight: 2, group: 'Diseño' },
  { id: 'm21', name: 'Superposiciones',              weight: 2, group: 'Diseño' },
  { id: 'm22', name: 'Objetos duplicados',           weight: 2, group: 'Diseño' },
  { id: 'm23', name: 'Objetos perdidos',             weight: 3, group: 'Diseño' },
  { id: 'm24', name: 'Colores incorrectos',          weight: 3, group: 'Diseño' },
  { id: 'm25', name: 'Cambios innecesarios color',   weight: 2, group: 'Diseño' },
  { id: 'm26', name: 'Detalles pequeños perdidos',   weight: 2, group: 'Diseño' },
];

const TOTAL_WEIGHT = METRICS.reduce((s, m) => s + m.weight, 0); // 100

// ── Evaluador principal ───────────────────────────────────────────────────────
/**
 * Evalúa un conjunto de regiones contra las 26 métricas.
 * @returns { scores: {m01..m26: {score, note}}, quality: 0-100, breakdown: {} }
 */
export function evaluateQuality(regions, config) {
  const W  = config.width_mm  || 100;
  const H  = config.height_mm || 100;
  const cc = config.color_count || 6;
  const scores = {};

  // ── Grupo 1: Geometría ─────────────────────────────────────────────────────

  // m01 · Precisión de contornos
  // Ratio pts/mm de perímetro: ideal 1-3 pts/mm; más = zigzag, menos = simplificado
  {
    const ratios = regions.map(r => {
      const pts = r.path_points?.length || 0;
      const pm  = r.perimeter_mm || 10;
      return pts / pm;
    }).filter(x => x > 0);
    const avg = ratios.length ? ratios.reduce((a,b)=>a+b,0)/ratios.length : 2;
    const score = avg < 0.5 ? 50 : avg > 8 ? Math.max(0, 100 - (avg - 8) * 10) : 100 - Math.abs(avg - 2) * 8;
    scores.m01 = { score: clamp(score), note: `${avg.toFixed(1)} pts/mm perímetro` };
  }

  // m02 · Suavidad de curvas
  // Varianza del ángulo entre segmentos consecutivos; alta varianza = curvas bruscas
  {
    let totalVar = 0, count = 0;
    for (const r of regions) {
      const pts = r.path_points;
      if (!pts || pts.length < 3) continue;
      let angles = [];
      for (let i = 1; i < pts.length - 1; i++) {
        const dx1 = pts[i][0] - pts[i-1][0], dy1 = pts[i][1] - pts[i-1][1];
        const dx2 = pts[i+1][0] - pts[i][0],  dy2 = pts[i+1][1] - pts[i][1];
        const a1  = Math.atan2(dy1, dx1), a2 = Math.atan2(dy2, dx2);
        let da = Math.abs(a2 - a1);
        if (da > Math.PI) da = 2 * Math.PI - da;
        angles.push(da);
      }
      if (angles.length > 0) {
        const mean = angles.reduce((a,b)=>a+b,0)/angles.length;
        totalVar += mean;
        count++;
      }
    }
    const avgAngle = count ? totalVar / count : 0.3;
    const score = Math.max(0, 100 - avgAngle * 120);
    scores.m02 = { score: clamp(score), note: `Variación angular media: ${(avgAngle * 180/Math.PI).toFixed(1)}°` };
  }

  // m03 · Esquinas deformadas
  // Regiones con alto corner_count relativo a su tamaño
  {
    const bad = regions.filter(r => {
      const corners = r._metrics?.corner_count || 0;
      const area    = r.area_mm2 || 100;
      return corners > 0 && (corners / Math.sqrt(area)) > 3;
    }).length;
    const score = Math.max(0, 100 - (bad / Math.max(1, regions.length)) * 200);
    scores.m03 = { score: clamp(score), note: `${bad} regiones con esquinas deformadas` };
  }

  // m04 · Ruido de vectorización
  // Micro-regiones (<2mm²) vs total
  {
    const micro = regions.filter(r => (r.area_mm2 || 0) < 2).length;
    const ratio = micro / Math.max(1, regions.length);
    const score = Math.max(0, 100 - ratio * 300);
    scores.m04 = { score: clamp(score), note: `${micro} micro-regiones (<2mm²) de ${regions.length}` };
  }

  // m05 · Bordes dentados
  // pts/perimeter >> normal indica dentado; evaluar compacidad vs pts count
  {
    const jagged = regions.filter(r => {
      const pts  = r.path_points?.length || 0;
      const area = r.area_mm2 || 1;
      // Para una región circular perfecta: pts ≈ 4*sqrt(area) ~ perimeter/2
      const expected = 4 * Math.sqrt(area);
      return pts > expected * 3 && area < 50;
    }).length;
    const score = Math.max(0, 100 - (jagged / Math.max(1, regions.length)) * 250);
    scores.m05 = { score: clamp(score), note: `${jagged} regiones con bordes dentados` };
  }

  // m06 · Deformaciones
  // Inertia_ratio extremo respecto al tipo de puntada
  {
    const deformed = regions.filter(r => {
      const ir = r._metrics?.inertia_ratio || 1;
      if (r.stitch_type === 'fill' && ir > 6) return true;
      if (r.stitch_type === 'satin' && ir > 15) return true;
      return false;
    }).length;
    const score = Math.max(0, 100 - (deformed / Math.max(1, regions.length)) * 200);
    scores.m06 = { score: clamp(score), note: `${deformed} regiones con deformación geométrica` };
  }

  // m07 · Líneas rotas
  // Running stitch con muy pocas puntadas respecto a su perímetro esperado
  {
    const broken = regions.filter(r => {
      if (r.stitch_type !== 'running_stitch') return false;
      const expected = (r.perimeter_mm || 10) / 2;
      return (r.stitch_count || 0) < expected * 0.3;
    }).length;
    const score = Math.max(0, 100 - broken * 20);
    scores.m07 = { score: clamp(score), note: `${broken} líneas rotas (running stitch)` };
  }

  // ── Grupo 2: Calidad de puntada ────────────────────────────────────────────

  // m08 · Continuidad de puntadas
  // Regiones con 0 puntadas
  {
    const zero = regions.filter(r => (r.stitch_count || 0) === 0).length;
    const score = Math.max(0, 100 - zero * 25);
    scores.m08 = { score: clamp(score), note: `${zero} regiones sin puntadas` };
  }

  // m09 · Densidad correcta
  // Densidad ideal: 0.3-0.6mm; penalizar fuera de rango
  {
    const dens = regions.map(r => r.density || r.tatami_density || 0.4);
    const bad  = dens.filter(d => d < 0.2 || d > 0.9).length;
    const avg  = dens.reduce((a,b)=>a+b,0) / Math.max(1, dens.length);
    const score = Math.max(0, 100 - (bad/Math.max(1,dens.length))*150 - Math.abs(avg - 0.4)*30);
    scores.m09 = { score: clamp(score), note: `Densidad media: ${avg.toFixed(2)}mm, ${bad} fuera de rango` };
  }

  // m10 · Longitud de puntadas
  // Estimada: stitch_count * stitch_length / area, comparar con perimeter
  {
    const bad = regions.filter(r => {
      if (!r.stitch_count || !r.area_mm2) return false;
      const totalLen = r.stitch_count * 2.5; // 2.5mm nominal
      const area     = r.area_mm2;
      // Para fill: totalLen/area debería ser 1/(density) ≈ 2-4
      // Para satin: totalLen / perimeter debería ser 1-3
      if (r.stitch_type === 'fill') {
        const ratio = totalLen / area;
        return ratio < 0.5 || ratio > 10;
      }
      return false;
    }).length;
    const score = Math.max(0, 100 - (bad/Math.max(1,regions.length))*200);
    scores.m10 = { score: clamp(score), note: `${bad} regiones con longitud de puntada anómala` };
  }

  // m11 · Calidad del relleno
  // Fills con stitch_count apropiado para su área
  {
    const fills = regions.filter(r => r.stitch_type === 'fill');
    if (fills.length === 0) {
      scores.m11 = { score: 50, note: 'Sin regiones fill' };
    } else {
      const good = fills.filter(r => {
        const density = r.density || 0.4;
        const expected = (r.area_mm2 || 0) / (density * 2.5);
        const actual   = r.stitch_count || 0;
        return actual > expected * 0.4 && actual < expected * 3;
      }).length;
      const score = (good / fills.length) * 100;
      scores.m11 = { score: clamp(score), note: `${good}/${fills.length} fills con puntadas correctas` };
    }
  }

  // m12 · Calidad del satén
  // Satins con ancho correcto (< 8mm ideal)
  {
    const satins = regions.filter(r => r.stitch_type === 'satin');
    if (satins.length === 0) {
      scores.m12 = { score: 80, note: 'Sin regiones satén' };
    } else {
      const good = satins.filter(r => {
        const area  = r.area_mm2 || 0;
        const perim = r.perimeter_mm || 1;
        const width = area / (perim / 2); // ancho estimado
        return area > 0 && area < 200 && width < 8;
      }).length;
      const score = (good / satins.length) * 100;
      scores.m12 = { score: clamp(score), note: `${good}/${satins.length} satens bien dimensionados` };
    }
  }

  // m13 · Huecos visibles
  // Cobertura total estimada del diseño
  {
    const designArea = W * H;
    const covered    = regions.reduce((s, r) => s + (r.area_mm2 || 0), 0);
    const covRatio   = Math.min(1, covered / designArea);
    // Diseño típico cubre 40-80% del área del bastidor
    const score = covRatio < 0.05 ? 20 : covRatio > 0.95 ? 70 : 100 - Math.abs(covRatio - 0.5) * 40;
    scores.m13 = { score: clamp(score), note: `Cobertura estimada: ${(covRatio*100).toFixed(0)}%` };
  }

  // m14 · Dirección de costura
  // Regiones fill con ángulo coherente (no todos 0° — eso es sospechoso)
  {
    const fills  = regions.filter(r => r.stitch_type === 'fill' && r.angle !== undefined);
    const angles = fills.map(r => r.angle || 0);
    const uniqueAngles = new Set(angles.map(a => Math.round(a / 15) * 15)).size;
    const score = fills.length === 0 ? 70 : Math.min(100, 50 + uniqueAngles * 10);
    scores.m14 = { score: clamp(score), note: `${uniqueAngles} direcciones distintas en fills` };
  }

  // ── Grupo 3: Producción ────────────────────────────────────────────────────

  // m15 · Compensación del pull
  {
    const hasPull = regions.filter(r => r.pull_compensation && r.pull_compensation > 0).length;
    const needsPull = regions.filter(r => r.stitch_type !== 'running_stitch').length;
    const score = needsPull === 0 ? 100 : (hasPull / needsPull) * 100;
    scores.m15 = { score: clamp(score), note: `${hasPull}/${needsPull} regiones con pull compensation` };
  }

  // m16 · Eliminación de saltos
  // Estimado: color_changes / total_regions — menos cambios = mejor
  {
    const colors = new Set(regions.map(r => r.color)).size;
    const ratio  = colors / Math.max(1, regions.length);
    const score  = Math.max(0, 100 - ratio * 150);
    scores.m16 = { score: clamp(score), note: `${colors} colores en ${regions.length} regiones` };
  }

  // m17 · Reducción de cortes de hilo
  // Regiones del mismo color que están separadas (subcóptimo)
  {
    const colorGroups = {};
    for (const r of regions) {
      if (!colorGroups[r.color]) colorGroups[r.color] = 0;
      colorGroups[r.color]++;
    }
    const fragmented = Object.values(colorGroups).filter(c => c > 3).length;
    const score = Math.max(0, 100 - fragmented * 15);
    scores.m17 = { score: clamp(score), note: `${fragmented} colores con más de 3 regiones fragmentadas` };
  }

  // m18 · Secuencia de cosido óptima
  {
    const fills  = regions.filter(r => r.stitch_type === 'fill');
    const satins = regions.filter(r => r.stitch_type === 'satin');
    const allFillsBeforeSatins = fills.length === 0 || satins.length === 0 ||
      fills.every(f => satins.every(s => (f.priority || 0) <= (s.priority || 999)));
    const hasUnderlay = regions.filter(r => r.underlay && r.stitch_type === 'fill').length;
    const needsUnderlay = fills.filter(r => (r.area_mm2 || 0) > 20).length;
    const underlayRatio = needsUnderlay === 0 ? 1 : hasUnderlay / needsUnderlay;
    const score = (allFillsBeforeSatins ? 70 : 20) + underlayRatio * 30;
    scores.m18 = { score: clamp(score), note: allFillsBeforeSatins ? 'Secuencia fills→satins correcta' : 'Secuencia invertida' };
  }

  // m19 · Estabilidad del bordado
  // Underlay en fills grandes
  {
    const largeFills = regions.filter(r => r.stitch_type === 'fill' && (r.area_mm2 || 0) > 30);
    const withUnderlay = largeFills.filter(r => r.underlay).length;
    const score = largeFills.length === 0 ? 100 : (withUnderlay / largeFills.length) * 100;
    scores.m19 = { score: clamp(score), note: `${withUnderlay}/${largeFills.length} fills grandes con underlay` };
  }

  // ── Grupo 4: Integridad del diseño ────────────────────────────────────────

  // m20 · Agujeros entre objetos
  // Regiones sin vecinos próximos (posibles agujeros)
  {
    const isolated = regions.filter(r => {
      const [cx, cy] = r.centroid || [0.5, 0.5];
      return !regions.some(other => {
        if (other.id === r.id) return false;
        const [ox, oy] = other.centroid || [0.5, 0.5];
        return Math.hypot(cx-ox, cy-oy) < 0.15;
      });
    }).length;
    const score = Math.max(0, 100 - (isolated / Math.max(1, regions.length)) * 50);
    scores.m20 = { score: clamp(score), note: `${isolated} regiones potencialmente aisladas` };
  }

  // m21 · Superposiciones
  // Centroid distance < threshold AND different colors
  {
    let overlaps = 0;
    for (let i = 0; i < regions.length - 1; i++) {
      for (let j = i + 1; j < regions.length; j++) {
        const ri = regions[i], rj = regions[j];
        if (ri.color === rj.color) continue;
        const [cx, cy] = ri.centroid || [0.5, 0.5];
        const [ox, oy] = rj.centroid || [0.5, 0.5];
        const d = Math.hypot(cx-ox, cy-oy);
        const sizeI = Math.sqrt((ri.area_mm2||1)/(W*H));
        const sizeJ = Math.sqrt((rj.area_mm2||1)/(W*H));
        if (d < (sizeI + sizeJ) * 0.3) overlaps++;
      }
    }
    const score = Math.max(0, 100 - overlaps * 10);
    scores.m21 = { score: clamp(score), note: `${overlaps} superposiciones detectadas` };
  }

  // m22 · Objetos duplicados
  // Mismo color + área similar + centroid cercano
  {
    let dups = 0;
    for (let i = 0; i < regions.length - 1; i++) {
      for (let j = i + 1; j < regions.length; j++) {
        const ri = regions[i], rj = regions[j];
        if (ri.color !== rj.color) continue;
        const areaRatio = Math.min(ri.area_mm2||1, rj.area_mm2||1) / Math.max(ri.area_mm2||1, rj.area_mm2||1);
        const [cx, cy] = ri.centroid || [0.5, 0.5];
        const [ox, oy] = rj.centroid || [0.5, 0.5];
        const d = Math.hypot(cx-ox, cy-oy);
        if (areaRatio > 0.85 && d < 0.05) dups++;
      }
    }
    const score = Math.max(0, 100 - dups * 30);
    scores.m22 = { score: clamp(score), note: `${dups} posibles duplicados` };
  }

  // m23 · Objetos perdidos
  // Color_count esperado vs encontrado
  {
    const found    = new Set(regions.map(r => r.color)).size;
    const expected = cc;
    const ratio    = Math.min(found, expected) / Math.max(1, expected);
    const score    = ratio * 100;
    scores.m23 = { score: clamp(score), note: `${found}/${expected} colores detectados` };
  }

  // m24 · Colores incorrectos
  // Colores demasiado similares entre sí (contaminación)
  {
    const colors = [...new Set(regions.map(r => r.color))];
    let contaminated = 0;
    for (let i = 0; i < colors.length - 1; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        if (colorDeltaE(colors[i], colors[j]) < 10) contaminated++;
      }
    }
    const score = Math.max(0, 100 - contaminated * 20);
    scores.m24 = { score: clamp(score), note: `${contaminated} pares de colores demasiado similares` };
  }

  // m25 · Cambios innecesarios de color
  // Colorchanges / regiones — ideal < 0.5
  {
    const colors = new Set(regions.map(r => r.color)).size;
    const ratio  = colors / Math.max(1, regions.length);
    const score  = ratio < 0.5 ? 100 : Math.max(0, 100 - (ratio - 0.5) * 100);
    scores.m25 = { score: clamp(score), note: `Ratio cambios/región: ${ratio.toFixed(2)}` };
  }

  // m26 · Detalles pequeños perdidos
  // Regiones pequeñas (<5mm²) vs total — si hay muy pocas puede ser que se perdieron
  {
    const small  = regions.filter(r => (r.area_mm2 || 0) < 5).length;
    const ratio  = small / Math.max(1, regions.length);
    // Ideal: 10-30% de regiones son detalles pequeños
    const score  = ratio < 0.05 ? 50 : ratio > 0.5 ? 70 : 100;
    scores.m26 = { score: clamp(score), note: `${small} detalles pequeños (${(ratio*100).toFixed(0)}% del total)` };
  }

  // ── Calcular score total ponderado ────────────────────────────────────────
  let weighted = 0;
  for (const m of METRICS) {
    weighted += (scores[m.id]?.score || 0) * m.weight;
  }
  const quality = weighted / TOTAL_WEIGHT;

  // ── Breakdown por grupo ───────────────────────────────────────────────────
  const groups = {};
  for (const m of METRICS) {
    if (!groups[m.group]) groups[m.group] = { total: 0, weight: 0 };
    groups[m.group].total  += (scores[m.id]?.score || 0) * m.weight;
    groups[m.group].weight += m.weight;
  }
  const breakdown = {};
  for (const [g, v] of Object.entries(groups)) {
    breakdown[g] = Math.round(v.total / v.weight);
  }

  // ── Métricas más débiles ──────────────────────────────────────────────────
  const weakest = METRICS
    .map(m => ({ ...m, score: scores[m.id]?.score || 0, note: scores[m.id]?.note || '' }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 6);

  return { scores, quality: Math.round(quality), breakdown, weakest };
}

// ── Ajuste automático de parámetros ──────────────────────────────────────────
/**
 * Analiza los defectos y devuelve un nuevo config optimizado.
 * @returns { newConfig, changes[] }
 */
export function adjustParameters(scores, quality, config, iteration) {
  const newConfig = { ...config };
  const changes   = [];

  const s = (id) => scores[id]?.score || 100;

  // Priorizar los defectos más graves primero

  // Colores / segmentación
  if (s('m24') < 70 || s('m23') < 70) {
    if (config.color_count < 12) {
      newConfig.color_count = Math.min(16, config.color_count + 2);
      changes.push(`color_count ${config.color_count}→${newConfig.color_count} (mejorar separación cromática)`);
    }
  } else if (s('m04') < 60 && config.color_count > 4) {
    newConfig.color_count = Math.max(4, config.color_count - 1);
    changes.push(`color_count ${config.color_count}→${newConfig.color_count} (reducir ruido vectorización)`);
  }

  // Contornos irregulares / ruido → cambiar modo
  if (s('m01') < 65 || s('m05') < 65 || s('m02') < 65) {
    const modeMap = { fast: 'standard', standard: 'hybrid', hybrid: 'precision', precision: 'ultra', ultra: 'ultra' };
    if (modeMap[config.mode] !== config.mode) {
      newConfig.mode = modeMap[config.mode] || 'hybrid';
      changes.push(`mode ${config.mode}→${newConfig.mode} (mejorar contornos)`);
    }
  }

  // Densidad
  if (s('m09') < 65 || s('m13') < 65) {
    const d = config.tatami_density || 0.4;
    if (s('m13') < 65) {
      // huecos → densidad más alta
      newConfig.tatami_density = Math.min(0.65, d + 0.05);
      changes.push(`tatami_density ${d.toFixed(2)}→${newConfig.tatami_density.toFixed(2)} (cerrar huecos)`);
    } else {
      // demasiado apretado
      newConfig.tatami_density = Math.max(0.25, d - 0.05);
      changes.push(`tatami_density ${d.toFixed(2)}→${newConfig.tatami_density.toFixed(2)} (reducir densidad)`);
    }
  }

  // Estabilidad → forzar underlay
  if (s('m19') < 70 || s('m18') < 70) {
    newConfig.force_underlay = true;
    changes.push('force_underlay: true (aumentar estabilidad)');
  }

  // Pull compensation
  if (s('m15') < 70) {
    newConfig.tension_comp = Math.min(1.0, (config.tension_comp || 0.5) + 0.1);
    changes.push(`tension_comp ${(config.tension_comp||0.5).toFixed(1)}→${newConfig.tension_comp.toFixed(1)}`);
  }

  // Objetos duplicados / superposiciones → simplificar
  if (s('m22') < 60 || s('m21') < 60) {
    newConfig.vector_engine = 'hybrid';
    changes.push('vector_engine→hybrid (reducir duplicados/superposiciones)');
  }

  // Si ya estamos en iteración tardía y el score es alto, afinar
  if (iteration >= 3 && quality >= 80) {
    newConfig.mode = 'precision';
    if (!changes.some(c => c.includes('mode')))
      changes.push('mode→precision (refinamiento fino)');
  }

  if (changes.length === 0) {
    changes.push('Sin ajustes adicionales (convergencia)');
  }

  return { newConfig, changes };
}

// ── Criterio de parada ────────────────────────────────────────────────────────
export function shouldStop(history, maxIterations = 15) {
  if (history.length === 0) return false;
  const last = history[history.length - 1];

  // Criterio 1: calidad perfecta
  if (last.quality >= 98) return true;

  // Criterio 2: dos iteraciones consecutivas sin mejora significativa
  if (history.length >= 2) {
    const prev = history[history.length - 2];
    const improvement = last.quality - prev.quality;
    if (improvement < 0.5 && history.length >= 3) return true;
  }

  // Criterio 3: máximo de iteraciones
  if (history.length >= maxIterations) return true;

  return false;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function clamp(v) { return Math.max(0, Math.min(100, Math.round(v))); }

function colorDeltaE(hex1, hex2) {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  return Math.sqrt(2*(r1-r2)**2 + 4*(g1-g2)**2 + 3*(b1-b2)**2) / 10;
}

function hexToRgb(hex) {
  const c = (hex || '#000000').replace('#', '');
  return [parseInt(c.slice(0,2),16)||0, parseInt(c.slice(2,4),16)||0, parseInt(c.slice(4,6),16)||0];
}