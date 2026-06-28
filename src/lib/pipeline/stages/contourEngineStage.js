/**
 * Stage 3: Contour Engine
 * Input:  ctx.enhanced (or ctx.imageUrl), ctx.config, ctx.analysis
 * Output: ctx.contours (ContourSet)
 */

import { traceImageContours } from '../../contourTracer.js';
import { getModeStrategy } from '../../digitizeModes.js';

export async function runContourEngine(ctx) {
  const strategy   = getModeStrategy(ctx.config.mode || 'hybrid');
  const sourceUrl  = ctx.enhanced?.enhancedUrl || ctx.imageUrl;
  const colorCount = strategy.vectorizer?.color_count || ctx.config.color_count || 8;
  const rdpEpsilon = strategy.vectorizer?.rdpEpsilon || 0.003;

  // Fast mode skips expensive client-side tracing — let backend do it
  if (strategy.id === 'fast') {
    ctx.contours = null;
    return;
  }

  // traceImageContours(url, maxColors) — rdpEpsilon is used internally via mode config
  ctx.contours = await traceImageContours(sourceUrl, colorCount);
}