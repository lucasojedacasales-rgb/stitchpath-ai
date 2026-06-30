/**
 * Auto-Iteration Engine for StitchPath AI
 * Evaluates digitization results against 8 quality criteria
 * and suggests parameter adjustments for the next iteration.
 */

export const CRITERIA = {
  C1: { id: 'C1', name: 'Colores correctos',       description: 'Colores fieles a la imagen original' },
  C2: { id: 'C2', name: 'Regiones definidas',       description: 'Sin sobre/sub-segmentación' },
  C3: { id: 'C3', name: 'Tipos de puntada',         description: 'Fill grandes, satin detalles, run líneas' },
  C4: { id: 'C4', name: 'Contornos limpios',        description: 'Sin dientes de sierra excesivos' },
  C5: { id: 'C5', name: 'Densidad apropiada',       description: 'Ni demasiado apretado ni separado' },
  C6: { id: 'C6', name: 'Simulación coherente',     description: 'Editor y simulación coinciden' },
  C7: { id: 'C7', name: 'Sin errores',              description: 'Todas las regiones con puntadas válidas' },
  C8: { id: 'C8', name: 'Progreso lógico',          description: 'Fills → Detalles → Satins' },
};

/**
 * Evaluate regions against all 8 criteria.
 * Returns { C1..C8: { pass, note }, score, failures }
 */
export function evaluateResult(regions, config) {
  const results = {};
  const totalRegions = regions.length;

  // ── C1: Color correctness ────────────────────────────────────────
  const uniqueColors = new Set(regions.map(r => r.color));
  const expectedColors = config.color_count || 6;
  let colorContaminated = false;
  const colorArr = [...uniqueColors];
  for (let i = 0; i < colorArr.length - 1 && !colorContaminated; i++) {
    for (let j = i + 1; j < colorArr.length; j++) {
      if (colorDeltaE(colorArr[i], colorArr[j]) < 8) { colorContaminated = true; break; }
    }
  }
  const colorRatio = uniqueColors.size / Math.max(1, expectedColors);
  results.C1 = {
    pass: !colorContaminated && colorRatio >= 0.25,
    note: colorContaminated
      ? 'Colores demasiado similares (posible contaminación cromática)'
      : colorRatio < 0.25
        ? `Solo ${uniqueColors.size} colores únicos para ${expectedColors} esperados`
        : `${uniqueColors.size} colores únicos ✓`,
  };

  // ── C2: Region definition ────────────────────────────────────────
  const tinyRegions = regions.filter(r => (r.area_mm2 || 0) < 1).length;
  const maxExpected  = expectedColors * 10;
  results.C2 = {
    pass: totalRegions >= 2 && totalRegions <= maxExpected && tinyRegions < totalRegions * 0.1,
    note: totalRegions < 2
      ? 'Muy pocas regiones (bajo-segmentación)'
      : totalRegions > maxExpected
        ? `Sobre-segmentación: ${totalRegions} regiones (máx. esperado ${maxExpected})`
        : tinyRegions > 0
          ? `${tinyRegions} regiones fragmentadas (<1mm²)`
          : `${totalRegions} regiones bien definidas ✓`,
  };

  // ── C3: Stitch type appropriateness ─────────────────────────────
  const badFills   = regions.filter(r => r.stitch_type === 'fill'  && (r.area_mm2 || 0) < 5).length;
  const badSatins  = regions.filter(r => r.stitch_type === 'satin' && (r.area_mm2 || 0) > 200).length;
  results.C3 = {
    pass: badFills === 0 && badSatins === 0,
    note: badFills > 0
      ? `${badFills} regiones pequeñas usan FILL (deberían ser SATIN/RUN)`
      : badSatins > 0
        ? `${badSatins} regiones grandes usan SATIN (deberían ser FILL)`
        : 'Tipos de puntada correctos ✓',
  };

  // ── C4: Contour cleanliness ──────────────────────────────────────
  const complexRegions = regions.filter(r => {
    const pts   = r.path_points?.length || 0;
    const perim = r.perimeter_mm || 1;
    return (pts / perim) > 5 && pts > 50;
  }).length;
  results.C4 = {
    pass: complexRegions < totalRegions * 0.15,
    note: complexRegions > 0
      ? `${complexRegions} regiones con contornos irregulares (posible zig-zag)`
      : 'Contornos limpios ✓',
  };

  // ── C5: Density ──────────────────────────────────────────────────
  const densities   = regions.map(r => r.density || r.tatami_density || 0.4);
  const avgDensity  = densities.reduce((a, b) => a + b, 0) / Math.max(1, densities.length);
  results.C5 = {
    pass: avgDensity >= 0.2 && avgDensity <= 0.8,
    note: avgDensity < 0.2
      ? `Densidad muy baja (${avgDensity.toFixed(2)}mm) — huecos visibles`
      : avgDensity > 0.8
        ? `Densidad muy alta (${avgDensity.toFixed(2)}mm) — puntadas apretadas`
        : `Densidad media: ${avgDensity.toFixed(2)}mm ✓`,
  };

  // ── C6: Simulation coherence ─────────────────────────────────────
  const incoherent = regions.filter(r => r.stitch_type === 'satin' && (r.area_mm2 || 0) > 200).length;
  results.C6 = {
    pass: incoherent === 0,
    note: incoherent > 0
      ? `${incoherent} satins de gran área generan incoherencia visual`
      : 'Simulación coherente con el editor ✓',
  };

  // ── C7: No processing errors ─────────────────────────────────────
  const zeroStitch = regions.filter(r => (r.stitch_count || 0) === 0).length;
  const hugeStitch = regions.filter(r => (r.stitch_count || 0) > 15000 && (r.area_mm2 || 0) < 50).length;
  results.C7 = {
    pass: zeroStitch === 0 && hugeStitch === 0,
    note: zeroStitch > 0
      ? `${zeroStitch} regiones con 0 puntadas`
      : hugeStitch > 0
        ? `${hugeStitch} regiones con puntadas excesivas (>15k en área pequeña)`
        : 'Sin errores de procesamiento ✓',
  };

  // ── C8: Logical stitch progress ──────────────────────────────────
  const fills  = regions.filter(r => r.stitch_type === 'fill');
  const satins = regions.filter(r => r.stitch_type === 'satin');
  const fillsBeforeSatins = fills.length === 0 || satins.length === 0 ||
    fills.every(f => satins.every(s => (f.priority || 0) <= (s.priority || 999)));
  results.C8 = {
    pass: fills.length > 0 && fillsBeforeSatins,
    note: fills.length === 0
      ? 'Sin regiones fill — falta la base del bordado'
      : !fillsBeforeSatins
        ? 'Satins ordenados ANTES que fills — orden incorrecto'
        : 'Orden correcto: fills → satins ✓',
  };

  const score    = Object.values(results).filter(r => r.pass).length;
  const failures = Object.keys(results).filter(k => !results[k].pass);

  return { ...results, score, total: 8, failures };
}

/**
 * Adjust config parameters based on evaluation failures.
 * Returns { newConfig, changes[] }
 */
export function adjustConfig(failures, config, iteration) {
  const newConfig = { ...config };
  const changes   = [];

  for (const criterion of failures) {
    switch (criterion) {
      case 'C1': {
        if (config.color_count < 12) {
          newConfig.color_count = Math.min(16, config.color_count + 2);
          changes.push(`color_count ${config.color_count} → ${newConfig.color_count}`);
        } else {
          newConfig.color_count = Math.max(4, config.color_count - 1);
          changes.push(`color_count reducido ${config.color_count} → ${newConfig.color_count}`);
        }
        break;
      }
      case 'C2': {
        const modes = ['fast', 'standard', 'hybrid', 'precision', 'ultra'];
        const idx = modes.indexOf(config.mode);
        if (idx < modes.length - 1) {
          newConfig.mode = modes[idx + 1];
          changes.push(`mode: ${config.mode} → ${newConfig.mode}`);
        }
        break;
      }
      case 'C3': {
        newConfig.vector_engine = 'hybrid';
        changes.push('vector_engine → hybrid (mejor clasificación tipos)');
        break;
      }
      case 'C4': {
        if (config.mode !== 'standard' && config.mode !== 'hybrid') {
          newConfig.mode = 'standard';
          changes.push(`mode → standard (mejora suavizado contornos)`);
        }
        break;
      }
      case 'C5': {
        const d = config.tatami_density || 0.4;
        newConfig.tatami_density = d < 0.2
          ? Math.min(0.6, d + 0.1)
          : Math.max(0.25, d - 0.05);
        changes.push(`tatami_density ${d.toFixed(2)} → ${newConfig.tatami_density.toFixed(2)}`);
        break;
      }
      case 'C6': {
        newConfig.vector_engine = 'hybrid';
        changes.push('vector_engine → hybrid (coherencia simulación)');
        break;
      }
      case 'C7': {
        newConfig.mode = 'precision';
        changes.push('mode → precision (reducir errores procesamiento)');
        break;
      }
      case 'C8': {
        // Priority ordering is handled by the pipeline, no config change needed
        changes.push('Verificar prioridades fill < satin en pipeline');
        break;
      }
    }
  }

  return { newConfig, changes };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function colorDeltaE(hex1, hex2) {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  return Math.sqrt(2 * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + 3 * (b1 - b2) ** 2) / 10;
}

function hexToRgb(hex) {
  const c = (hex || '#000000').replace('#', '');
  return [
    parseInt(c.slice(0, 2), 16) || 0,
    parseInt(c.slice(2, 4), 16) || 0,
    parseInt(c.slice(4, 6), 16) || 0,
  ];
}