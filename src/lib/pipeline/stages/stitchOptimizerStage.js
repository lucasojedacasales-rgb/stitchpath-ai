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
    // Skip optimizer — keep regions as-is, populate minimal optimized wrapper
    ctx.optimized = null;
    return;
  }

  if (!ctx.regions || ctx.regions.length === 0) {
    ctx.optimized = null;
    return;
  }

  ctx.optimized = optimizeTravelPath(ctx.regions, ctx.config);

  // Apply optimized order back to ctx.regions so downstream stages use it
  if (ctx.optimized?.optimizedSequence?.length > 0) {
    ctx.regions = ctx.optimized.optimizedSequence;
  }
}