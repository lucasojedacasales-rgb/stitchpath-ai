/**
 * Stage: Adaptive Engine
 * Input:  ctx.regions (enriched with geometry metrics)
 * Output: ctx.regions (with adaptive stitch decisions)
 *
 * Integra el motor adaptativo en el pipeline, decidiendo todos los parámetros
 * de bordado por región basado en su geometría.
 */

import { computeAllAdaptiveDecisions } from '../../adaptiveEngine.js';

export async function runAdaptiveEngine(ctx) {
  if (!ctx.regions || ctx.regions.length === 0) {
    return; // no regions, skip
  }

  const config = ctx.config || {};

  // Computar decisiones adaptativas para todas las regiones
  ctx.regions = computeAllAdaptiveDecisions(ctx.regions, config);

  // Log summary
  const summary = {
    total_regions: ctx.regions.length,
    by_stitch_type: {
      fill: ctx.regions.filter(r => r.stitch_type === 'fill').length,
      satin: ctx.regions.filter(r => r.stitch_type === 'satin').length,
      running_stitch: ctx.regions.filter(r => r.stitch_type === 'running_stitch').length,
    },
    avg_confidence: +(
      ctx.regions.reduce((s, r) => s + (r._adaptive?.overall_confidence || 0.7), 0) /
      ctx.regions.length
    ).toFixed(2),
  };

  if (ctx.telemetry) {
    ctx.telemetry.push({
      stage: 'adaptive_engine',
      timestamp: new Date().toISOString(),
      summary,
    });
  }
}