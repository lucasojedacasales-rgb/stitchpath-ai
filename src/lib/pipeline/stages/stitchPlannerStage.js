/**
 * Stage 6: Stitch Planner
 * Input:  ctx.regions, ctx.config
 * Output: ctx.plan (StitchPlan) + ctx.pathMetrics (needle path optimization)
 *
 * Generates strategic stitch plan (types, angles, layers) and calculates
 * optimal needle path to minimize jumps and color changes.
 */

import { generateStitchPlan } from '../../stitchPlanner.js';
import { optimizeNeedlePath } from '../../needlePath.js';

export async function runStitchPlanner(ctx) {
  if (!ctx.regions || ctx.regions.length === 0) {
    ctx.plan = null;
    ctx.pathMetrics = null;
    return;
  }

  // Generate stitch plan (types, angles, underlays)
  ctx.plan = generateStitchPlan(ctx.regions, ctx.config);

  // Optimize needle path considering priority and position
  const pathConfig = {
    width_mm: ctx.config.width_mm || 100,
    height_mm: ctx.config.height_mm || 100,
    speed_spm: ctx.config.machine_speed || 800,
  };

  ctx.pathMetrics = optimizeNeedlePath(ctx.regions, pathConfig);
}