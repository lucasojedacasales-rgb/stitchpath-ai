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

// Per-mode quality presets — map strategy knobs to contourEngine options.
// RDP epsilons raised across all modes to prevent sub-pixel micro-segmentation
// while preserving real geometric detail. minSegmentPx raised to filter noise.
const MODE_OPTIONS = {
  fast:      { analysisSize: 512,  chaikinPasses: 1, rdpBaseEpsilon: 2.2, minSegmentPx: 7,  cornerAngleDeg: 125, gapCloseThreshold: 14 },
  standard:  { analysisSize: 800,  chaikinPasses: 2, rdpBaseEpsilon: 1.5, minSegmentPx: 5,  cornerAngleDeg: 130, gapCloseThreshold: 12 },
  precision: { analysisSize: 1200, chaikinPasses: 3, rdpBaseEpsilon: 0.8, minSegmentPx: 3,  cornerAngleDeg: 120, gapCloseThreshold: 10 },
  hybrid:    { analysisSize: 1024, chaikinPasses: 3, rdpBaseEpsilon: 1.1, minSegmentPx: 4,  cornerAngleDeg: 128, gapCloseThreshold: 12 },
  ultra:     { analysisSize: 1600, chaikinPasses: 4, rdpBaseEpsilon: 0.6, minSegmentPx: 2,  cornerAngleDeg: 115, gapCloseThreshold: 8  },
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
    // Conservative adaptation: max tightening 15%, max loosening 15%.
    // High edge density often correlates with JPEG noise, not real detail —
    // over-tightening there causes micro-segmentation of smooth contours.
    const edgeFactor = 1.0 - (flatMean - 0.3) * 0.3;
    modeOpts.rdpBaseEpsilon = +(modeOpts.rdpBaseEpsilon * Math.max(0.85, Math.min(1.15, edgeFactor))).toFixed(3);
  }

  ctx.contours = await traceContoursProf(sourceUrl, colorCount, modeOpts);
}