/**
 * Stage 7: Stitch Optimizer (Travel Path)
 * Input:  ctx.regions, ctx.config
 * Output: ctx.optimized (OptimizedPlan)
 *
 * Uses travelOptimizer.js (superior: real entry/exit points, correct physical scale).
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

  const result = optimizeTravelPath(ctx.regions, {
    width_mm:  ctx.config.width_mm  || 100,
    height_mm: ctx.config.height_mm || 100,
    speedSpm:  ctx.config.machine_speed || 800,
  });

  // Store full result for downstream consumers (NeedlePathPanel, metrics bar)
  ctx.optimized = result;

  if (result && Array.isArray(result.optimizedSequence) && result.optimizedSequence.length > 0) {
    ctx.regions = result.optimizedSequence;
  }
}