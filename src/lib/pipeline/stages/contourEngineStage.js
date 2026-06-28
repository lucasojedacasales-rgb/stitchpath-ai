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

  // Fast mode skips expensive client-side tracing — let backend do it
  if (strategy.id === 'fast') {
    ctx.contours = null;
    return;
  }

  // Map mode strategy to contour engine options
  const contourOpts = {
    analysisSize:        strategy.preprocess?.outputSize || 900,
    minPixelArea:        strategy.vectorizer?.minPixelArea || 10,
    minSegmentLengthPx:  strategy.id === 'ultra' ? 1.0 : strategy.id === 'precision' ? 1.5 : 2.0,
    cornerAngleDeg:      strategy.id === 'ultra' ? 110 : strategy.id === 'precision' ? 115 : 120,
    rdpBaseEpsilon:      strategy.id === 'ultra' ? 0.4 : strategy.id === 'precision' ? 0.6 : 0.8,
    chaikinPasses:       strategy.vectorizer?.smoothPasses ?? 2,
    gapClosurePx:        strategy.id === 'ultra' ? 2 : 4,
  };

  ctx.contours = await traceImageContours(sourceUrl, colorCount, contourOpts);
}