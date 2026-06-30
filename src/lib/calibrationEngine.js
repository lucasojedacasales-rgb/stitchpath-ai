/**
 * ─────────────────────────────────────────────────────────────────────────────
 * StitchPath AI — Motor de Calibración Automática
 * 
 * Verifica los 10 criterios de aceptación para personajes tipo Kirby/cartoon
 * y genera ajustes de parámetros para el siguiente ciclo del pipeline.
 * 
 * CRITERIOS:
 * C1  Fondo no genera puntadas
 * C2  Contornos cerrados sin gaps
 * C3  Sin sobre-segmentación (mismos colores fusionados)
 * C4  Sin fusión agresiva (elementos distintos separados)
 * C5  Nombres semánticos
 * C6  Clasificación de puntada correcta
 * C7  Ángulos coherentes
 * C8  Densidad razonable (6k-12k puntadas a 100mm)
 * C9  Colores mapeados (máx 6-8)
 * C10 Preview correcto (sin artefactos)
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Detección de fondo ────────────────────────────────────────────────────────
// El fondo suele ser la región más grande Y en los bordes de la imagen (centroid cercano a esquinas)
// O un color neutro (gris/negro/blanco) con cobertura > 15% del área total
export function isBackgroundRegion(region, allRegions, W_mm, H_mm) {
  const [cx, cy] = region.centroid || [0.5, 0.5];
  const area     = region.area_mm2 || 0;
  const totalArea = allRegions.reduce((s, r) => s + (r.area_mm2 || 0), 0);
  const areaRatio = area / Math.max(1, totalArea);
  const color     = (region.color || '#888888').toLowerCase();

  // Criterio 1: mayor región Y centroid en bordes (borde = | cx-0.5 | > 0.35 OR | cy-0.5 | > 0.35)
  const isLargest   = areaRatio > 0.20;
  const isOnBorder  = Math.abs(cx - 0.5) > 0.30 || Math.abs(cy - 0.5) > 0.30;

  // Criterio 2: color gris/negro/blanco/beige (no-saturado)
  const rgb         = hexToRgb(color);
  const saturation  = colorSaturation(rgb.r, rgb.g, rgb.b);
  const luminance   = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  const isNeutral   = saturation < 0.15;
  const isDark      = luminance < 0.25;
  const isVeryLight = luminance > 0.88;

  // Fondo: (grande + en borde) O (grande + neutro/oscuro/muy claro)
  if (isLargest && isOnBorder) return true;
  if (isLargest && (isNeutral || isDark || isVeryLight)) return true;
  // También: región que abraza toda la imagen (cobertura > 25%)
  if (areaRatio > 0.30 && isNeutral) return true;

  return false;
}

// ── Evaluador de los 10 criterios ─────────────────────────────────────────────
export function evaluateCriteria(regions, config) {
  const results = {};
  const W = config.width_mm  || 100;
  const H = config.height_mm || 100;

  const nonBg = regions.filter(r => !r.is_background);
  const totalStitches = nonBg.reduce((s, r) => s + (r.stitch_count || 0), 0);
  const colors = [...new Set(nonBg.map(r => r.color))];

  // ── C1: Fondo no genera puntadas ──────────────────────────────────────────
  const bgRegions = regions.filter(r => r.is_background);
  const bgWithStitches = bgRegions.filter(r => (r.stitch_count || 0) > 0 || r.visible !== false);
  results.c1 = {
    pass:  bgWithStitches.length === 0,
    score: bgWithStitches.length === 0 ? 1 : 0,
    note:  bgWithStitches.length > 0 ? `${bgWithStitches.length} regiones de fondo generan puntadas` : 'OK: fondo excluido',
    fix:   'Marcar regiones de fondo como visible=false y excluirlas del conteo de puntadas',
  };

  // ── C2: Contornos cerrados ─────────────────────────────────────────────────
  const openContours = nonBg.filter(r => {
    const pts = r.path_points;
    if (!pts || pts.length < 3) return true;
    const d = Math.hypot(pts[0][0] - pts[pts.length-1][0], pts[0][1] - pts[pts.length-1][1]);
    return d > 0.01; // más del 1% de la imagen
  });
  results.c2 = {
    pass:  openContours.length === 0,
    score: Math.max(0, 1 - openContours.length / Math.max(1, nonBg.length)),
    note:  openContours.length > 0 ? `${openContours.length} contornos abiertos` : 'OK: todos cerrados',
    fix:   'gapCloseThreshold más alto, rdpBaseEpsilon más bajo',
  };

  // ── C3: Sin sobre-segmentación ─────────────────────────────────────────────
  // Detectar: mismo color, muchos fragmentos pequeños, centroids cercanos
  const colorGroups = {};
  for (const r of nonBg) {
    const key = normalizeColor(r.color);
    if (!colorGroups[key]) colorGroups[key] = [];
    colorGroups[key].push(r);
  }
  let overSegmented = 0;
  for (const [col, group] of Object.entries(colorGroups)) {
    if (group.length <= 2) continue; // hasta 2 fragmentos del mismo color es OK (izq/der)
    const avgArea = group.reduce((s,r) => s+(r.area_mm2||0),0) / group.length;
    const totalGroup = group.reduce((s,r) => s+(r.area_mm2||0),0);
    // Si hay más de 3 fragmentos del mismo color y la mayoría son pequeños → sobre-seg
    const smallFrag = group.filter(r => (r.area_mm2||0) < avgArea * 0.5).length;
    if (group.length > 3 && smallFrag > group.length * 0.6) overSegmented += group.length - 2;
  }
  results.c3 = {
    pass:  overSegmented === 0,
    score: Math.max(0, 1 - overSegmented / Math.max(1, nonBg.length) * 2),
    note:  overSegmented > 0 ? `~${overSegmented} fragmentos sobre-segmentados` : 'OK: sin sobre-segmentación',
    fix:   'minAreaPx más alto, aumentar color_count para separar mejor, reducir gapCloseThreshold',
  };

  // ── C4: Sin fusión agresiva ────────────────────────────────────────────────
  // Detectar: una región enorme que debería ser múltiples partes del personaje
  // Proxy: región con área > 40% del total que no es fondo
  const hugeRegions = nonBg.filter(r => {
    const totalNonBg = nonBg.reduce((s,x) => s+(x.area_mm2||0), 0);
    return (r.area_mm2||0) / Math.max(1, totalNonBg) > 0.50;
  });
  results.c4 = {
    pass:  hugeRegions.length === 0,
    score: hugeRegions.length === 0 ? 1 : 0.3,
    note:  hugeRegions.length > 0 ? `${hugeRegions.length} región muy grande (posible fusión agresiva)` : 'OK: separación correcta',
    fix:   'Aumentar color_count, reducir gapCloseThreshold entre colores distintos',
  };

  // ── C5: Nombres semánticos ─────────────────────────────────────────────────
  const BAD_PATTERN = /^region_\d+|^r_\d+|^\d+_|^blob_/i;
  const badNames = nonBg.filter(r => !r.name || BAD_PATTERN.test(r.name));
  results.c5 = {
    pass:  badNames.length === 0,
    score: 1 - badNames.length / Math.max(1, nonBg.length),
    note:  badNames.length > 0 ? `${badNames.length} nombres no semánticos` : 'OK: nombres descriptivos',
    fix:   'Aplicar renombrado semántico automático por color+posición+tipo',
    badRegions: badNames.map(r => r.id),
  };

  // ── C6: Clasificación de puntada correcta ──────────────────────────────────
  let wrongStitch = 0;
  for (const r of nonBg) {
    const area  = r.area_mm2 || 0;
    const width = r.mean_width_mm || r.max_width_mm || 5;
    const type  = r.stitch_type;
    // Cuerpo grande → debe ser fill
    if (area > 200 && type !== 'fill') wrongStitch++;
    // Detalle muy estrecho (<3mm) → debe ser satin o running
    if (width < 2.5 && area < 30 && type === 'fill') wrongStitch++;
    // Región enorme como satin → incorrecto
    if (area > 100 && type === 'satin') wrongStitch++;
  }
  results.c6 = {
    pass:  wrongStitch === 0,
    score: Math.max(0, 1 - wrongStitch / Math.max(1, nonBg.length)),
    note:  wrongStitch > 0 ? `${wrongStitch} clasificaciones incorrectas` : 'OK: tipos correctos',
    fix:   'Reconfigurar umbrales fill/satin en adaptiveEngine',
  };

  // ── C7: Ángulos coherentes ─────────────────────────────────────────────────
  const fills = nonBg.filter(r => r.stitch_type === 'fill');
  const allZero = fills.length > 2 && fills.every(r => (r.angle || 0) === 0);
  const allSame = fills.length > 2 && new Set(fills.map(r => r.angle || 0)).size === 1;
  results.c7 = {
    pass:  !allZero && !allSame,
    score: (!allZero && !allSame) ? 1 : 0.4,
    note:  allZero ? 'Todos los ángulos son 0° (sin variación PCA)' : allSame ? 'Todos los ángulos son idénticos' : 'OK: ángulos variados',
    fix:   'fill_angle=null para forzar cálculo PCA por región',
  };

  // ── C8: Densidad razonable ─────────────────────────────────────────────────
  const scaleFactor = (W * H) / (100 * 100); // ratio respecto a 100x100mm
  const normalizedStitches = totalStitches / Math.max(0.1, scaleFactor);
  results.c8 = {
    pass:  normalizedStitches >= 4000 && normalizedStitches <= 15000,
    score: normalizedStitches < 1000 ? 0 : normalizedStitches > 20000 ? 0.3 :
           normalizedStitches > 15000 ? 0.6 : normalizedStitches < 4000 ? 0.5 : 1,
    note:  `${totalStitches} puntadas totales (norm: ${Math.round(normalizedStitches)})`,
    fix:   normalizedStitches > 15000 ? 'Aumentar tatami_density (más espacio entre filas)' : 'Reducir tatami_density',
  };

  // ── C9: Colores mapeados ───────────────────────────────────────────────────
  results.c9 = {
    pass:  colors.length >= 2 && colors.length <= 8,
    score: colors.length === 0 ? 0 : colors.length > 12 ? 0.3 : colors.length > 8 ? 0.7 : 1,
    note:  `${colors.length} colores distintos`,
    fix:   colors.length > 8 ? `Reducir color_count a ${Math.max(6, colors.length - 2)}` : 'Aumentar color_count',
  };

  // ── C10: Preview correcto (proxy: sin regiones con 0 puntadas y visible=true) ──
  const emptyVisible = nonBg.filter(r => r.visible !== false && (r.stitch_count || 0) === 0);
  const tooManyRegions = nonBg.length > 50;
  results.c10 = {
    pass:  emptyVisible.length === 0 && !tooManyRegions,
    score: emptyVisible.length > 0 ? 0.5 : tooManyRegions ? 0.6 : 1,
    note:  emptyVisible.length > 0 ? `${emptyVisible.length} regiones sin puntadas visibles` :
           tooManyRegions ? `Demasiadas regiones (${nonBg.length} > 50)` : 'OK: preview limpio',
    fix:   'Filtrar regiones vacías, reducir max_regions',
  };

  // ── Score total ─────────────────────────────────────────────────────────────
  const scores = Object.values(results).map(r => r.score);
  const overallScore = Math.round(scores.reduce((a,b)=>a+b,0) / scores.length * 10);
  const passed = Object.values(results).filter(r => r.pass).length;

  return { criteria: results, score: overallScore, passed, total: 10 };
}

// ── Generar ajustes para el siguiente ciclo ───────────────────────────────────
export function generateCalibrationAdjustments(evalResult, config, iteration) {
  const c  = evalResult.criteria;
  const nc = { ...config };
  const changes = [];

  // C1: Fondo → activar remove_bg y marcar regiones
  if (!c.c1.pass) {
    nc.remove_bg = true;
    nc._filterBackground = true;
    changes.push('remove_bg=true para eliminar fondo de puntadas');
  }

  // C2: Contornos abiertos → más gap closing
  if (!c.c2.pass) {
    // Internamente usamos un flag que contourEngine.js lee
    nc._gapCloseFactor = (nc._gapCloseFactor || 1) * 1.3;
    changes.push(`gapCloseThreshold ×1.3 (iter ${iteration})`);
  }

  // C3: Sobre-segmentación → aumentar minArea y color_count
  if (!c.c3.pass) {
    nc._minAreaFactor = (nc._minAreaFactor || 1) * 1.4;
    nc.color_count = Math.min(12, (nc.color_count || 8) + 1);
    changes.push('minAreaPx ×1.4, color_count+1 para reducir fragmentación');
  }

  // C4: Fusión agresiva → reducir gapClose
  if (!c.c4.pass) {
    nc.color_count = Math.min(16, (nc.color_count || 8) + 2);
    changes.push('color_count+2 para separar regiones fusionadas');
  }

  // C5: Nombres semánticos → forzar renombrado (se aplica en post-proceso)
  if (!c.c5.pass) {
    nc._forceSemanticNames = true;
    changes.push('Activar renombrado semántico automático');
  }

  // C6: Clasificación incorrecta → ajustar modo
  if (!c.c6.pass) {
    if (nc.mode !== 'precision' && nc.mode !== 'ultra') {
      nc.mode = 'precision';
      changes.push('mode→precision para mejor clasificación stitch');
    }
  }

  // C7: Ángulos todos 0° → forzar PCA
  if (!c.c7.pass) {
    nc.fill_angle = null; // null = calcular PCA por región
    changes.push('fill_angle=null para forzar PCA por región');
  }

  // C8: Demasiadas puntadas → ajustar densidad
  if (!c.c8.pass) {
    const note = c.c8.note;
    if (note.includes('>') || (evalResult.criteria.c8.score < 0.7)) {
      nc.tatami_density = Math.min(0.65, (nc.tatami_density || 0.4) + 0.08);
      changes.push(`tatami_density→${nc.tatami_density.toFixed(2)} para reducir puntadas`);
    } else {
      nc.tatami_density = Math.max(0.25, (nc.tatami_density || 0.4) - 0.05);
      changes.push(`tatami_density→${nc.tatami_density.toFixed(2)} para aumentar puntadas`);
    }
  }

  // C9: Demasiados colores → reducir color_count
  if (!c.c9.pass) {
    const curr = nc.color_count || 8;
    if (curr > 8) {
      nc.color_count = Math.max(6, curr - 2);
      changes.push(`color_count ${curr}→${nc.color_count} para fusionar colores similares`);
    } else if (curr < 4) {
      nc.color_count = 6;
      changes.push('color_count→6 para detectar más colores');
    }
  }

  // C10: Regiones vacías → filtrar
  if (!c.c10.pass) {
    nc._filterEmptyRegions = true;
    nc.max_regions = Math.min(30, (nc.max_regions || 50));
    changes.push('Filtrar regiones sin puntadas, max_regions reducido');
  }

  // Refinamiento tardío
  if (iteration >= 4 && evalResult.score >= 7) {
    nc.mode = 'ultra';
    changes.push('mode→ultra para refinamiento final');
  }

  if (changes.length === 0) changes.push('Sin ajustes necesarios');

  return { newConfig: nc, changes };
}

// ── Post-procesado de regiones ─────────────────────────────────────────────────
/**
 * Aplica correcciones a las regiones DESPUÉS del pipeline:
 * - Detecta y marca fondo
 * - Renombra semánticamente
 * - Filtra vacías
 */
export function postProcessRegions(regions, config) {
  const W = config.width_mm  || 100;
  const H = config.height_mm || 100;

  // 1. Marcar fondo
  const withBg = regions.map(r => ({
    ...r,
    is_background: isBackgroundRegion(r, regions, W, H),
    visible: isBackgroundRegion(r, regions, W, H) ? false : (r.visible !== false),
    stitch_count: isBackgroundRegion(r, regions, W, H) ? 0 : (r.stitch_count || 0),
  }));

  // 2. Renombrado semántico
  const renamed = withBg.map(r => ({
    ...r,
    name: r.is_background ? 'fondo_tela' : semanticName(r, withBg, W, H),
  }));

  // 3. Filtrar regiones completamente vacías si el flag está activo
  const filtered = config._filterEmptyRegions
    ? renamed.filter(r => r.is_background || (r.path_points?.length >= 3 && (r.area_mm2 || 0) > 1))
    : renamed;

  return filtered;
}

// ── Nombres semánticos ────────────────────────────────────────────────────────
function semanticName(region, allRegions, W_mm, H_mm) {
  const [cx, cy] = region.centroid || [0.5, 0.5];
  const area     = region.area_mm2 || 0;
  const totalArea = allRegions.filter(r => !r.is_background).reduce((s,r) => s+(r.area_mm2||0),0);
  const areaRatio = area / Math.max(1, totalArea);
  const color     = (region.color || '#888888').toLowerCase();
  const rgb       = hexToRgb(color);
  const colorName = getColorName(rgb);
  const type      = region.stitch_type === 'fill' ? 'fill' : region.stitch_type === 'satin' ? 'sat' : 'run';

  // Detectar parte del personaje por posición y tamaño
  let part = '';

  // Cuerpo principal (mayor región no-fondo)
  if (areaRatio > 0.25) {
    part = 'cuerpo';
  }
  // Ojos (pequeños, oscuros, zona superior central)
  else if (area < 25 && (rgb.r + rgb.g + rgb.b) / 3 < 80 && cy < 0.55) {
    const side = cx < 0.45 ? '_izq' : cx > 0.55 ? '_der' : '';
    part = `ojo${side}`;
  }
  // Mejillas (pequeños, rosas/rojizos, zona media lateral)
  else if (area < 60 && cx !== undefined) {
    const saturationRed = (rgb.r - (rgb.g + rgb.b) / 2) / 255;
    const side = cx < 0.4 ? '_izq' : cx > 0.6 ? '_der' : '';
    if (saturationRed > 0.05 && cy > 0.35 && cy < 0.7) {
      part = `mejilla${side}`;
    }
  }
  // Boca (pequeña, zona inferior central)
  else if (area < 30 && cy > 0.55 && Math.abs(cx - 0.5) < 0.15) {
    part = 'boca';
  }
  // Pies (zona inferior, distintos del cuerpo)
  else if (cy > 0.70 && areaRatio > 0.03 && areaRatio < 0.20) {
    const side = cx < 0.45 ? '_izq' : cx > 0.55 ? '_der' : '';
    part = `pie${side}`;
  }
  // Brazos (zona media lateral)
  else if (cy > 0.3 && cy < 0.7 && (cx < 0.2 || cx > 0.8)) {
    const side = cx < 0.5 ? '_izq' : '_der';
    part = `brazo${side}`;
  }
  // Contorno/borde
  else if (region.stitch_type === 'running_stitch' || region.stitch_type === 'satin') {
    part = 'contorno';
  }
  // Detalle
  else {
    const vPos = cy < 0.33 ? 'sup' : cy > 0.66 ? 'inf' : 'cen';
    const hPos = cx < 0.33 ? '_izq' : cx > 0.66 ? '_der' : '';
    part = `detalle_${vPos}${hPos}`;
  }

  return `${part}_${colorName}_${type}`;
}

// ── Utilidades de color ───────────────────────────────────────────────────────
function hexToRgb(hex) {
  const h = (hex || '#888888').replace('#', '');
  return {
    r: parseInt(h.slice(0,2), 16) || 128,
    g: parseInt(h.slice(2,4), 16) || 128,
    b: parseInt(h.slice(4,6), 16) || 128,
  };
}

function colorSaturation(r, g, b) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l   = (max + min) / 2;
  if (max === min) return 0;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

function getColorName(rgb) {
  const { r, g, b } = rgb;
  const avg = (r + g + b) / 3;
  if (avg < 50)  return 'negro';
  if (avg > 210) return 'blanco';
  if (r > 160 && g < 100 && b < 100) return 'rojo';
  if (r > 160 && g > 80 && b < 100)  return 'naranja';
  if (r > 160 && g > 120 && b < 130) return 'amarillo';
  if (r > 180 && b > 150 && g < 130) return 'magenta';
  if (r > 150 && b > 120 && g < 120) return 'rosa';
  if (g > 150 && r < 100 && b < 100) return 'verde';
  if (b > 150 && r < 100 && g < 100) return 'azul';
  if (r > 120 && g > 80 && b < 80)   return 'marron';
  const sat = colorSaturation(r, g, b);
  if (sat < 0.12) return avg < 130 ? 'gris_oscuro' : 'gris';
  return 'color';
}

function normalizeColor(hex) {
  if (!hex) return 'unknown';
  const rgb = hexToRgb(hex);
  // Quantize to 32-step buckets for fuzzy grouping
  const qr = Math.round(rgb.r / 32) * 32;
  const qg = Math.round(rgb.g / 32) * 32;
  const qb = Math.round(rgb.b / 32) * 32;
  return `${qr}_${qg}_${qb}`;
}