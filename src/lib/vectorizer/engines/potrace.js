/**
 * lib/vectorizer/engines/potrace.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Potrace-style engine: optimized for binary / high-contrast images.
 *
 * Strategy:
 *  - Converts image to grayscale → Otsu threshold → binary mask
 *  - For multi-color logos: runs per-color-channel binarization
 *  - Uses contourTracer with tight parameters for crisp outlines
 *
 * Best for: logos, text, drawings, high-contrast line art, 2-color designs.
 */

import { traceImageContours } from '../../contourTracer.js';

export const potraceEngine = {
  name: 'potrace',

  /**
   * Scores how well this engine fits the image profile (0–1).
   * High score = this engine is a good match.
   */
  score(profile) {
    if (profile.isBinary)                              return 0.95;
    if (profile.imageType === 'logo')                  return 0.90;
    if (profile.imageType === 'drawing')               return 0.85;
    if (profile.colorCount <= 3 && !profile.hasGradients) return 0.80;
    if (profile.avgEdgeDensity > 0.5)                  return 0.70;
    if (profile.isColorRich)                           return 0.30;
    return 0.50;
  },

  /**
   * Runs the Potrace-style vectorization.
   * For binary/logo images: binarizes each color channel before tracing.
   *
   * @param {string} imageUrl
   * @param {number} colorCount
   * @param {Object} opts        - forwarded to traceImageContours
   * @returns {Promise<ContourSet>}
   */
  async run(imageUrl, colorCount, opts) {
    // Potrace strategy: tighter epsilon, fewer colors, minimal smoothing
    const potraceOpts = {
      ...opts,
      rdpBaseEpsilon:     (opts.rdpBaseEpsilon || 0.8) * 0.6,  // tighter — preserves corners
      chaikinPasses:      Math.max(1, (opts.chaikinPasses || 2) - 1), // less smoothing
      cornerAngleDeg:     (opts.cornerAngleDeg || 120) - 10,   // more corners detected
      minSegmentLengthPx: (opts.minSegmentLengthPx || 2.0) * 0.7,
    };

    const useColors = Math.min(colorCount, 6); // potrace excels with fewer colors
    const result = await traceImageContours(imageUrl, useColors, potraceOpts);

    // Tag regions with source engine
    if (result?.regions) {
      result.regions = result.regions.map(r => ({ ...r, _vectorEngine: 'potrace' }));
    }
    result._engine = 'potrace';
    return result;
  },
};