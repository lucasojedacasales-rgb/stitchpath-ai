/**
 * Stage 3: Contour Engine
 * Input:  ctx.enhanced (or ctx.imageUrl), ctx.config, ctx.analysis
 * Output: ctx.contours (ContourSet)
 *
 * Uses the professional contour engine (contourEngine.js) which delivers
 * Wilcom-equivalent quality: sub-pixel detection, Bézier smoothing, adaptive
 * Douglas-Peucker, Chaikin subdivision, corner preservation, gap closing, and
 * noise/short-segment removal.
 */

import { traceContoursProf } from '../../contourEngine.js';
import { getModeStrategy }   from '../../digitizeModes.js';

// Per-mode quality presets — map strategy knobs to contourEngine options
const MODE_OPTIONS = {
  fast:      { analysisSize: 512,  chaikinPasses: 1, rdpBaseEpsilon: 1.5, minSegmentPx: 5 },
  standard:  { analysisSize: 800,  chaikinPasses: 2, rdpBaseEpsilon: 1.0, minSegmentPx: 4 },
  precision: { analysisSize: 1200, chaikinPasses: 3, rdpBaseEpsilon: 0.6, minSegmentPx: 2 },
  hybrid:    { analysisSize: 1024, chaikinPasses: 2, rdpBaseEpsilon: 0.8, minSegmentPx: 3 },
  ultra:     { analysisSize: 1600, chaikinPasses: 3, rdpBaseEpsilon: 0.4, minSegmentPx: 2 },
};

export async function runContourEngine(ctx) {
  const strategy   = getModeStrategy(ctx.config.mode || 'hybrid');
  const sourceUrl  = ctx.enhanced?.enhancedUrl || ctx.imageUrl;
  const colorCount = strategy.vectorizer?.color_count || ctx.config.color_count || 8;

  const modeOpts = { ...(MODE_OPTIONS[strategy.id] || MODE_OPTIONS.hybrid) };

  // Adaptive RDP epsilon: denser edges → tighter epsilon to preserve detail.
  // edgeDensityMap is a 2D grid of Sobel density [0,1]. Compute the mean.
  if (ctx.analysis?.edgeDensityMap) {
    const grid = ctx.analysis.edgeDensityMap;
    const flatMean = grid.flat().reduce((s, v) => s + v, 0) / (grid.length * grid[0].length);
    // Adaptive RDP epsilon: clamp tightening to 75% of base (was 55% — caused sub-pixel micro-segments)
    // Max tightening: 25%, max loosening: 20% — conservative range to prevent oversegmentation
    const edgeFactor = 1.0 - (flatMean - 0.3) * 0.5; // reduced from 0.8 → gentler adaptation
    modeOpts.rdpBaseEpsilon = +(modeOpts.rdpBaseEpsilon * Math.max(0.75, Math.min(1.20, edgeFactor))).toFixed(3);
  }

  ctx.contours = await traceContoursProf(sourceUrl, colorCount, modeOpts);
}