/**
 * lib/vectorizer/engines/vtracer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * VTracer-style engine: optimized for full-color images, gradients, illustrations.
 *
 * Strategy:
 *  - Uses more color clusters to capture subtle hue transitions
 *  - Applies lighter smoothing to preserve organic curves
 *  - Uses wider gap closure to bridge near-touching color boundaries
 *  - Segments in LAB color space (via pre-quantization) for perceptual accuracy
 *
 * Best for: photos, anime, illustrations, multi-color designs with gradients.
 */

import { traceImageContours } from '../../contourTracer.js';

export const vtracerEngine = {
  name: 'vtracer',

  /**
   * Scores how well this engine fits the image profile (0–1).
   */
  score(profile) {
    if (profile.imageType === 'photo')                 return 0.95;
    if (profile.isColorRich && profile.hasGradients)   return 0.90;
    if (profile.imageType === 'anime')                 return 0.85;
    if (profile.colorCount > 5)                        return 0.80;
    if (profile.hasFineDetails)                        return 0.70;
    if (profile.isBinary)                              return 0.25;
    return 0.55;
  },

  /**
   * Runs the VTracer-style vectorization.
   * Uses more colors and softer curves than Potrace.
   *
   * @param {string} imageUrl
   * @param {number} colorCount
   * @param {Object} opts
   * @returns {Promise<ContourSet>}
   */
  async run(imageUrl, colorCount, opts) {
    // VTracer strategy: more colors, softer smoothing, wider gaps
    const vtracerOpts = {
      ...opts,
      rdpBaseEpsilon:     (opts.rdpBaseEpsilon || 0.8) * 1.2, // softer — organic curves
      chaikinPasses:      Math.min(4, (opts.chaikinPasses || 2) + 1), // more smoothing
      cornerAngleDeg:     (opts.cornerAngleDeg || 120) + 10,  // fewer corners (smoother)
      gapClosurePx:       (opts.gapClosurePx || 4) + 2,       // wider gap bridging
      minSegmentLengthPx: (opts.minSegmentLengthPx || 2.0) * 1.3,
    };

    // VTracer benefits from more colors to capture gradients
    const useColors = Math.min(colorCount * 1.5, 16);
    const result = await traceImageContours(imageUrl, Math.round(useColors), vtracerOpts);

    // Post-process: merge very similar adjacent colors (gradient merging)
    if (result?.regions) {
      result.regions = mergeGradientRegions(result.regions);
      result.regions = result.regions.map(r => ({ ...r, _vectorEngine: 'vtracer' }));
    }
    result._engine = 'vtracer';
    return result;
  },
};

// ─── Gradient Region Merge ────────────────────────────────────────────────────

/**
 * Merges very similar color regions that are likely gradient steps.
 * Only merges if: colors are perceptually close AND centroids are near.
 */
function mergeGradientRegions(regions) {
  if (!regions || regions.length < 2) return regions;

  const merged  = [];
  const used    = new Set();
  const CDIST   = 30;  // max color distance to consider a gradient pair
  const SPATIAL = 0.1; // max centroid distance

  for (let i = 0; i < regions.length; i++) {
    if (used.has(i)) continue;
    const a = regions[i];
    let kept = { ...a };

    for (let j = i + 1; j < regions.length; j++) {
      if (used.has(j)) continue;
      const b = regions[j];
      if (colorDist(a.rgb, b.rgb) > CDIST) continue;
      const [ax, ay] = a.centroid || [0.5, 0.5];
      const [bx, by] = b.centroid || [0.5, 0.5];
      if (Math.hypot(ax - bx, ay - by) > SPATIAL) continue;

      // Merge: keep the larger region's shape, blend color
      const totalPx = (a.pixelCount || 1) + (b.pixelCount || 1);
      const wa = (a.pixelCount || 1) / totalPx;
      const wb = (b.pixelCount || 1) / totalPx;
      kept = {
        ...kept,
        pixelCount: totalPx,
        coverage:   (a.coverage || 0) + (b.coverage || 0),
        rgb:        blendRgb(a.rgb, b.rgb, wa, wb),
        hex:        rgbToHex(blendRgb(a.rgb, b.rgb, wa, wb)),
      };
      used.add(j);
    }

    merged.push(kept);
  }

  return merged;
}

function colorDist(a, b) {
  if (!a || !b) return 999;
  return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);
}

function blendRgb(a, b, wa, wb) {
  if (!a || !b) return a || b || [0,0,0];
  return [
    Math.round(a[0]*wa + b[0]*wb),
    Math.round(a[1]*wa + b[1]*wb),
    Math.round(a[2]*wa + b[2]*wb),
  ];
}

function rgbToHex([r, g, b]) {
  return '#' + [r,g,b].map(v => Math.round(v).toString(16).padStart(2,'0')).join('');
}