/**
 * Stage 6: Stitch Planner
 * Input:  ctx.regions, ctx.config
 * Output: ctx.plan (StitchPlan)
 */

import { generateStitchPlan } from '../../stitchPlanner.js';

export async function runStitchPlanner(ctx) {
  if (!ctx.regions || ctx.regions.length === 0) {
    ctx.plan = null;
    return;
  }

  ctx.plan = generateStitchPlan(ctx.regions, ctx.config);
}