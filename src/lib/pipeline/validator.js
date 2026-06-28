/**
 * Pipeline Validator — Verifica que los valores finales cumplan rangos esperados
 * Después de cada etapa clave, registra métricas y alerta si algo está fuera de rango.
 */

const EXPECTED_RANGES = {
  regions: { min: 12, max: 15, label: 'Regiones' },
  colors: { min: 6, max: 8, label: 'Colores únicos' },
  stitches: { min: 8000, max: 10000, label: 'Puntadas totales' },
  avgStitchesPerRegion: { min: 500, max: 1000, label: 'Puntadas/región' },
};

export function validateStage(stageName, metrics) {
  const results = [];
  
  for (const [key, spec] of Object.entries(EXPECTED_RANGES)) {
    if (!(key in metrics)) continue;
    
    const value = metrics[key];
    const ok = value >= spec.min && value <= spec.max;
    const status = ok ? '✅' : '⚠️';
    const range = `[${spec.min}–${spec.max}]`;
    
    results.push({
      key,
      value,
      ok,
      status,
      range,
      label: spec.label,
      message: `${status} ${spec.label}: ${value} ${range}`,
    });
    
    if (!ok) {
      console.warn(`[VALIDATOR] ${stageName}: ${spec.label} OUT OF RANGE: ${value} (expected ${range})`);
    }
  }
  
  // Log summary
  if (results.length > 0) {
    console.group(`📊 [${stageName}] Validation Summary`);
    results.forEach(r => console.log(r.message));
    console.groupEnd();
  }
  
  return {
    stageName,
    timestamp: new Date().toISOString(),
    metrics,
    validation: results,
    allPassed: results.every(r => r.ok),
  };
}

export function validateFinalPipeline(ctx) {
  if (!ctx.regions || ctx.regions.length === 0) {
    console.error('[VALIDATOR] No regions in final context');
    return null;
  }

  const regionCount = ctx.regions.length;
  const colorSet = new Set(ctx.regions.map(r => r.color));
  const colorCount = colorSet.size;
  const totalStitches = ctx.regions.reduce((s, r) => s + (r.stitch_count || 0), 0);
  const avgStitchesPerRegion = regionCount > 0 ? Math.round(totalStitches / regionCount) : 0;

  // Validate region structure
  const structureIssues = [];
  for (const region of ctx.regions.slice(0, 5)) {
    if (!region.centroid || region.centroid.length !== 2) {
      structureIssues.push(`Region ${region.id || '?'}: missing/invalid centroid`);
    }
    if (!region.path_points || region.path_points.length < 3) {
      structureIssues.push(`Region ${region.id || '?'}: invalid path_points`);
    }
    if (!region.name || region.name === 'undefined') {
      structureIssues.push(`Region ${region.id || '?'}: missing semantic name`);
    }
    if (!region.stitch_type) {
      structureIssues.push(`Region ${region.id || '?'}: missing stitch_type`);
    }
  }

  const metrics = {
    regions: regionCount,
    colors: colorCount,
    stitches: totalStitches,
    avgStitchesPerRegion,
  };

  const validation = validateStage('FINAL_PIPELINE', metrics);

  console.group('🔍 [FINAL VALIDATION] Complete Pipeline Report');
  console.log('Expected Ranges:', EXPECTED_RANGES);
  console.log('Actual Metrics:', metrics);
  console.log('Color List:', Array.from(colorSet));
  if (structureIssues.length > 0) {
    console.warn('⚠️ Structure Issues:', structureIssues);
  }
  console.groupEnd();

  return {
    ...validation,
    metrics,
    colorSet: Array.from(colorSet),
    structureIssues,
    readyForProduction: validation.allPassed && structureIssues.length === 0,
  };
}