/**
 * Stage 4: Vector Engine
 * Input:  ctx.enhanced, ctx.contours, ctx.analysis, ctx.config
 * Output: ctx.vectorRegions (VectorRegion[])
 *
 * This stage calls the hybridDigitize backend function which performs:
 * - AI labeling (Claude Vision) on client contours, OR
 * - Pure AI region generation when no contours exist
 */

import { base44 } from '@/api/base44Client';
import { getModeStrategy } from '../../digitizeModes.js';

export async function runVectorEngine(ctx) {
  const strategy = getModeStrategy(ctx.config.mode || 'hybrid');
  const bp       = strategy.backend;
  const cfg      = ctx.config;

  // Resolve AI strategy from decision engine if available
  const aiStrategy = ctx.aiStrategy || null;

  const payload = {
    image_url:        ctx.enhanced?.enhancedUrl || ctx.imageUrl,
    mode:             bp.mode,
    width_mm:         cfg.width_mm  || 100,
    height_mm:        cfg.height_mm || 100,
    color_count:      aiStrategy ? aiStrategy.recommendedParams?.maxColors : bp.color_count || cfg.color_count || 8,
    remove_bg:        cfg.remove_bg || false,
    use_ia_vision:    aiStrategy ? true : bp.use_ia_vision,
    use_full_bg:      bp.use_full_bg,
    image_analysis:   ctx.analysis  || null,
    traced_contours:  ctx.contours  || null,
    semantic_regions: ctx.semantic?.regions || null,
    image_type:       ctx.semantic?.imageType || ctx.contours?.imageType || null,
    vector_engine:    ctx._vectorizerMeta?.engine || bp.vector_engine,
    tatami_density:   aiStrategy
      ? (aiStrategy.stitchType === 'satin' ? 0.6 : aiStrategy.stitchType === 'running' ? 0.2 : 0.4)
      : bp.tatami_density || cfg.tatami_density || 0.4,
    fill_angle:       cfg.fill_angle ?? null,
    max_regions:      bp.max_regions || 150,
    stitch_strategy:  strategy.stitchStrategy,
  };

  const res = await base44.functions.invoke('hybridDigitize', payload);

  if (!res.data?.success) {
    throw new Error(res.data?.error || 'hybridDigitize returned no success');
  }

  const raw = res.data.data?.response || res.data.data;
  ctx.vectorRegions = (raw.regions || []).filter(isValidRegion);
  ctx._backendMeta  = {
    total_stitches:     raw.total_stitches,
    estimated_time_min: raw.estimated_time_min,
    colors_used:        raw.colors_used,
  };
}

function isValidRegion(r) {
  if ((r.area_mm2 || 0) <= 0.3)                          return false;
  if (r.perimeter_mm !== undefined && r.perimeter_mm <= 0.5) return false;
  if (r.isEdgeRegion === true)                            return false;
  if (!r.path_points || r.path_points.length < 3)        return false;
  return true;
}