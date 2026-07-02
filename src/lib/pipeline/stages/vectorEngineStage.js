/**
 * Stage 4: Vector Engine
 * Input:  ctx.enhanced, ctx.contours, ctx.analysis, ctx.config
 * Output: ctx.vectorRegions (VectorRegion[])
 *
 * This stage calls the hybridDigitize backend function which performs:
 * - AI labeling (Claude Vision) on client contours, OR
 * - Pure AI region generation when no contours exist
 *
 * Resilience:
 *   • If hybridDigitize fails or returns no valid regions, falls back to
 *     ctx.contours.regions so vectorization never breaks the whole pipeline.
 *   • ctx.vectorRegions is never left empty when ctx.contours.regions has data.
 *   • Normalized (0–1) path_points are preserved; mm coords are not re-scaled.
 *   • No adaptive optimizer is invoked here.
 */

import { base44 } from '@/api/base44Client';
import { getModeStrategy } from '../../digitizeModes.js';

export async function runVectorEngine(ctx) {
  const strategy = getModeStrategy(ctx.config.mode || 'hybrid');
  const bp       = strategy.backend;
  const cfg      = ctx.config;

  // Resolve AI strategy from decision engine if available
  const aiStrategy = ctx.aiStrategy || null;

  // Distill semantic map into compact form to avoid payload bloat
  const semanticSummary = ctx.semanticMap?.objects?.length
    ? ctx.semanticMap.objects.map(o => ({
        label:       o.label,
        group:       o.object_group,
        bbox:        o.bbox,
        color:       o.color_hex,
        stitch_type: o.stitch_type,
        priority:    o.priority,
        geometry:    o.geometry,
        complexity:  o.complexity,
      }))
    : null;

  // Forward analysis W/H for correct mm² geometry computation inside hybridDigitize
  if (ctx.contours) {
    ctx.contours.analysisW = ctx.contours.analysisW || 1024;
    ctx.contours.analysisH = ctx.contours.analysisH || 1024;
  }

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
    semantic_objects: semanticSummary,
    content_type:     ctx.analysis?.contentType || null,
    vector_engine:    bp.vector_engine,
    tatami_density:   aiStrategy
      ? (aiStrategy.stitchType === 'satin' ? 0.6 : aiStrategy.stitchType === 'running' ? 0.2 : 0.4)
      : bp.tatami_density || cfg.tatami_density || 0.4,
    fill_angle:       cfg.fill_angle ?? null,
    max_regions:      bp.max_regions || 150,
    stitch_strategy:  strategy.stitchStrategy,
  };

  let rawRegions = [];
  let backendOk  = false;

  try {
    const res = await base44.functions.invoke('hybridDigitize', payload);

    if (!res.data?.success) {
      throw new Error(res.data?.error || 'hybridDigitize returned no success');
    }

    const raw = res.data.data?.response || res.data.data;
    rawRegions   = raw.regions || [];
    backendOk    = true;
    ctx._backendMeta = {
      total_stitches:     raw.total_stitches,
      estimated_time_min: raw.estimated_time_min,
      colors_used:        raw.colors_used,
    };
    console.log(`[VectorEngine] Regiones recibidas del backend: ${rawRegions.length}`);
  } catch (err) {
    console.error('[VectorEngine] hybridDigitize falló — usando contornos como fallback:', err.message);
  }

  // Validate backend regions
  let valid = rawRegions.filter(isValidRegion);

  // ── Fallback: if backend failed or returned no valid regions, use contours ──
  if (valid.length === 0) {
    const contourRegions = ctx.contours?.regions || [];
    if (contourRegions.length > 0) {
      valid = contourRegionsAsVectorRegions(ctx.contours, cfg);
      console.log(`[VectorEngine] Fallback a contornos: ${contourRegions.length} → ${valid.length} regiones válidas`);
    } else {
      console.warn('[VectorEngine] Sin contornos ni regiones del backend — vectorRegions vacío');
    }
  }

  ctx.vectorRegions = valid;
  console.log(`[VectorEngine] Regiones finales usadas: ${ctx.vectorRegions.length} (backend: ${backendOk ? 'OK' : 'fallback'})`);
}

// ─── Validation ─────────────────────────────────────────────────────────────

function isValidRegion(r) {
  if (!r) return false;
  if (!r.path_points || r.path_points.length < 3)           return false;
  if (!r.hex && !r.color)                                   return false;
  const hasArea = (r.area_mm2 && r.area_mm2 > 0.1) || (r.area_norm && r.area_norm > 0);
  if (!hasArea)                                             return false;
  if (r.perimeter_mm !== undefined && r.perimeter_mm <= 0.3) return false;
  if (r.isEdgeRegion === true)                              return false;
  return true;
}

/**
 * Converts contour-engine regions (normalized 0–1, hex, area_norm) into the
 * vector-region shape expected by downstream stages, WITHOUT re-scaling
 * coordinates. Computes area_mm2 from area_norm only when missing.
 */
function contourRegionsAsVectorRegions(contours, config) {
  if (!contours?.regions?.length) return [];
  const w = config.width_mm  || 100;
  const h = config.height_mm || 100;

  return contours.regions
    .filter(r => r.path_points && r.path_points.length >= 3 && (r.hex || r.color))
    .map(r => ({
      ...r,
      color:        r.color || r.hex,
      area_mm2:     r.area_mm2 || (r.area_norm || 0) * w * h,
      stitch_type:  r.stitch_type || 'fill',
      name:         r.name || `region_${r.hex?.slice(1) || 'auto'}`,
    }))
    .filter(isValidRegion);
}