/**
 * Stage 7: Stitch Optimizer (Travel Path)
 * Input:  ctx.regions, ctx.config
 * Output: ctx.optimized (OptimizedPlan)
 *
 * Only runs when the mode strategy enables travelOptimize.
 */

import { optimizeTravelPath } from '../../travelOptimizer.js';
import { getModeStrategy } from '../../digitizeModes.js';

export async function runStitchOptimizer(ctx) {
  const strategy = getModeStrategy(ctx.config.mode || 'hybrid');

  if (!strategy.stitchStrategy?.travelOptimize) {
    ctx.optimized = null;
    return;
  }

  if (!ctx.regions || ctx.regions.length === 0) {
    ctx.optimized = null;
    return;
  }

  // Pass design dimensions so the optimizer uses real mm² scale for metrics
  const travelConfig = {
    ...ctx.config,
    width_mm:  ctx.config.width_mm  || 100,
    height_mm: ctx.config.height_mm || 100,
    speedSpm:  ctx.config.machine_speed || 800,
  };

  ctx.optimized = optimizeTravelPath(ctx.regions, travelConfig);

  // Only apply the reordered sequence when the optimizer produced a valid result.
  // The optimizer already sorts by priority first (fills→satins→runs) then by
  // proximity within each layer, so this never inverts the build order.
  const seq = ctx.optimized?.optimizedSequence;
  if (Array.isArray(seq) && seq.length > 0) {
    ctx.regions = seq;
  }
}