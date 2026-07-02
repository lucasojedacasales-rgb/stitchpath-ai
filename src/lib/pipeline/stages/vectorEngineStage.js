/**
 * Stage 4: Vector Engine
 * Input:  ctx.enhanced, ctx.contours, ctx.analysis, ctx.config
 * Output: ctx.vectorRegions (normalized, background-filtered)
 *
 * Resilience:
 *   • Backend hybridDigitize runs in try/catch; on failure or invalid output,
 *     falls back to ctx.contours.regions.
 *   • Every region passes through normalizeRegionForPipeline → guarantees
 *     id, color, hex, path_points (0–1), area_norm, area_mm2, perimeter_mm,
 *     centroid, stitch_type.
 *   • Colors are clamped to the real contour palette — IA-invented colors
 *     (e.g. yellow on a blue image) are snapped to the nearest real color.
 *   • Background regions are filtered out.
 *   • No adaptive optimizer is invoked here.
 */

import { base44 } from '@/api/base44Client';
import { getModeStrategy } from '../../digitizeModes.js';
import {
  normalizeRegionForPipeline,
  filterBackgroundRegions,
  clampColorToPalette,
  diagnosticValidate,
} from '../regionNormalize.js';

export async function runVectorEngine(ctx) {
  const strategy = getModeStrategy(ctx.config.mode || 'hybrid');
  const bp       = strategy.backend;
  const cfg      = ctx.config;
  const aiStrategy = ctx.aiStrategy || null;

  console.log(`[vector] contours detected: ${ctx.contours?.regions?.length ?? 0}`);

  // Real color palette from contour engine — the only source of truth for color
  const contourPalette = (ctx.contours?.regions || [])
    .map(r => r.hex || r.color)
    .filter(Boolean);

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
    rawRegions = raw.regions || [];
    backendOk  = true;
    ctx._backendMeta = {
      total_stitches:     raw.total_stitches,
      estimated_time_min: raw.estimated_time_min,
      colors_used:        raw.colors_used,
    };
    console.log(`[vector] backend regions: ${rawRegions.length}`);
  } catch (err) {
    console.error('[vector] hybridDigitize falló:', err.message);
  }

  // ── Normalize + clamp colors to real palette ──────────────────────────────
  let normalized = rawRegions
    .map(r => normalizeRegionForPipeline(r, ctx, cfg))
    .filter(Boolean)
    .map(r => ({ ...r, color: clampColorToPalette(r.color, contourPalette), hex: clampColorToPalette(r.color, contourPalette) }));

  console.log(`[vector] regions before bg filter: ${normalized.length}`);

  // ── Fallback: if backend failed or returned nothing valid, use contours ──
  if (normalized.length === 0) {
    const contourRegions = ctx.contours?.regions || [];
    normalized = contourRegions
      .map(r => normalizeRegionForPipeline(r, ctx, cfg))
      .filter(Boolean);
    console.log(`[vector] fallback used: ${contourRegions.length} contornos → ${normalized.length} normalizadas`);
  }

  // ── Background filter ─────────────────────────────────────────────────────
  const filtered = filterBackgroundRegions(normalized, ctx);
  console.log(`[vector] regions after bg filter: ${filtered.length}`);

  // ── Diagnostic validation (logs only) ─────────────────────────────────────
  diagnosticValidate(filtered, ctx);

  ctx.vectorRegions = filtered;
  console.log(`[vector] final coordinate mode: normalized 0–1 (${ctx.vectorRegions.length} regiones)`);
}