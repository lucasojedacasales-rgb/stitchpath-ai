/**
 * lib/vectorizer/engines/kmeans.js
 * ─────────────────────────────────────────────────────────────────────────────
 * K-Means fallback engine: pure JavaScript, always available.
 *
 * This is the original contourTracer with default parameters.
 * Used as fallback when Potrace/VTracer fail, or as a baseline
 * for quality comparison.
 *
 * Best for: any image type (generic), fallback, quality baseline.
 */

import { traceImageContours } from '../../contourTracer.js';

export const kmeansEngine = {
  name: 'kmeans',

  /**
   * K-means is always a valid option — moderate score for all types.
   * It's the safe fallback when other engines don't excel.
   */
  score(profile) {
    // Never top-scores unless other engines have very low scores
    if (profile.isBinary)   return 0.45;
    if (profile.isColorRich) return 0.55;
    return 0.50;
  },

  /**
   * Runs standard k-means contour tracing (baseline engine).
   *
   * @param {string} imageUrl
   * @param {number} colorCount
   * @param {Object} opts
   * @returns {Promise<ContourSet>}
   */
  async run(imageUrl, colorCount, opts) {
    const result = await traceImageContours(imageUrl, colorCount, opts);

    if (result?.regions) {
      result.regions = result.regions.map(r => ({ ...r, _vectorEngine: 'kmeans' }));
    }
    result._engine = 'kmeans';
    return result;
  },
};