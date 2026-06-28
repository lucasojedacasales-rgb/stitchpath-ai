/**
 * Stage 3: Contour Engine + Semantic Segmenter
 * Input:  ctx.enhanced (or ctx.imageUrl), ctx.config, ctx.analysis
 * Output: ctx.contours (ContourSet), ctx.semantic (SemanticContourSet)
 *
 * Runs both engines in parallel:
 *  - contourTracer  → geometric contours (sub-pixel, Bézier, Chaikin)
 *  - semanticSegmenter → object-aware regions with stitch recommendations
 *
 * The semantic result enriches the traced contours so the backend receives
 * per-region metadata: objectType, recommended_stitch_type, priority, etc.
 */

import { runHybridVectorizer, buildImageProfile } from '../../vectorizer/index.js';
import { semanticSegment }                        from '../../semanticSegmenter.js';
import { getModeStrategy }                        from '../../digitizeModes.js';

export async function runContourEngine(ctx) {
  const strategy   = getModeStrategy(ctx.config.mode || 'hybrid');
  const sourceUrl  = ctx.enhanced?.enhancedUrl || ctx.imageUrl;
  const colorCount = strategy.vectorizer?.color_count || ctx.config.color_count || 8;

  // Fast mode: skip expensive client-side tracing — let backend handle it
  if (strategy.id === 'fast') {
    ctx.contours = null;
    ctx.semantic = null;
    return;
  }

  const contourOpts = {
    analysisSize:       strategy.preprocess?.outputSize || 900,
    minPixelArea:       strategy.vectorizer?.minPixelArea || 10,
    minSegmentLengthPx: strategy.id === 'ultra' ? 1.0 : strategy.id === 'precision' ? 1.5 : 2.0,
    cornerAngleDeg:     strategy.id === 'ultra' ? 110 : strategy.id === 'precision' ? 115 : 120,
    rdpBaseEpsilon:     strategy.id === 'ultra' ? 0.4 : strategy.id === 'precision' ? 0.6 : 0.8,
    chaikinPasses:      strategy.vectorizer?.smoothPasses ?? 2,
    gapClosurePx:       strategy.id === 'ultra' ? 2 : 4,
  };

  // Resolve engine override (config > strategy > 'hybrid' = auto)
  const forceEngine = ctx.config.vector_engine && ctx.config.vector_engine !== 'hybrid'
    ? ctx.config.vector_engine
    : strategy.backend?.vector_engine !== 'hybrid' ? strategy.backend?.vector_engine : null;

  // Detect image type from prior semantic/analysis context if available
  const imageType = ctx.semantic?.imageType || ctx.analysis?.contentType || null;

  // Run hybrid vectorizer + semantic segmenter in parallel
  const [vectorResult, semantic] = await Promise.all([
    runHybridVectorizer(
      sourceUrl, colorCount, contourOpts,
      ctx.analysis, imageType, forceEngine
    ),
    semanticSegment(sourceUrl, {
      color_count: colorCount,
      width_mm:    ctx.config.width_mm  || 100,
      height_mm:   ctx.config.height_mm || 100,
      mode:        ctx.config.mode || 'hybrid',
    }),
  ]);

  // Store which engine was used and its quality score in context
  ctx._vectorizerMeta = {
    engine:  vectorResult.engineUsed,
    quality: vectorResult.quality,
    profile: buildImageProfile(ctx.analysis, imageType),
  };

  const contours = vectorResult.contourSet;
  ctx.contours = contours;
  ctx.semantic = semantic;

  // Enrich contour regions with semantic metadata (matched by centroid proximity)
  if (contours?.regions?.length && semantic?.regions?.length) {
    ctx.contours = {
      ...contours,
      regions: enrichContoursWithSemantic(contours.regions, semantic.regions),
      imageType: semantic.imageType,
    };
  }
}

/**
 * For each geometric contour region, find the nearest semantic region by centroid
 * and copy object-level metadata onto it.
 */
function enrichContoursWithSemantic(contourRegions, semanticRegions) {
  return contourRegions.map(cr => {
    const [cx, cy] = cr.centroid || [0.5, 0.5];

    let best = null, bestDist = Infinity;
    for (const sr of semanticRegions) {
      const [sx, sy] = sr.centroid || [0.5, 0.5];
      const d = Math.hypot(cx-sx, cy-sy);
      if (d < bestDist) { bestDist = d; best = sr; }
    }

    if (!best || bestDist > 0.25) return cr; // no close match — leave as-is

    return {
      ...cr,
      semantic_object:         best.semantic_object,
      semantic_class:          best.semantic_class,
      object_confidence:       best.object_confidence,
      recommended_stitch_type: best.recommended_stitch_type,
      recommended_density:     best.recommended_density,
      recommended_angle:       best.recommended_angle,
      priority:                cr.priority ?? best.priority,
      image_type:              best.image_type,
    };
  });
}