/**
 * Stage 5: Region Builder
 * Input:  ctx.vectorRegions, ctx.config
 * Output: ctx.regions (EnrichedRegion[])
 */

import { enrichAllRegions } from '../../regionBuilder.js';
import { getModeStrategy } from '../../digitizeModes.js';
import { normalizeRegionForPipeline, filterBackgroundRegions } from '../regionNormalize.js';
import { buildContoursForRegions } from '../../contourPathBuilder.js';

export async function runRegionBuilder(ctx) {
  if (!ctx.vectorRegions || ctx.vectorRegions.length === 0) {
    // Last-resort fallback: build regions directly from contours so the
    // pipeline always produces ctx.regions when contour data exists.
    const contourRegions = ctx.contours?.regions || [];
    if (contourRegions.length > 0) {
      ctx.vectorRegions = contourRegions
        .map(r => normalizeRegionForPipeline(r, ctx, ctx.config))
        .filter(Boolean);
      ctx.vectorRegions = filterBackgroundRegions(ctx.vectorRegions, ctx);
      console.log(`[RegionBuilder] Fallback contornos → ${ctx.vectorRegions.length} vectorRegions`);
    }
    if (!ctx.vectorRegions || ctx.vectorRegions.length === 0) {
      ctx.regions = [];
      return;
    }
  }

  const strategy = getModeStrategy(ctx.config.mode || 'hybrid');
  // Fast mode skips the Adaptive Engine to keep processing time low.
  // All other modes use it for geometry-driven parameter resolution.
  ctx._useAdaptiveEngine = strategy.stitchStrategy?.useAdaptiveEngine !== false;

  const { width_mm = 100, height_mm = 100, fabric_type = 'Algodón' } = ctx.config;

  // Background filter — color-aware (vectorEngineStage already filtered, this
  // is a safety net for the fallback path). Saturated objects are never removed.
  const nonBgRegions = filterBackgroundRegions(ctx.vectorRegions, ctx);

  // Apply semantic metadata to vector regions when available
  const semanticObjects = ctx.semanticMap?.objects || [];

  const named = nonBgRegions.map((r, i) => {
    const sem = findSemanticForRegion(r, semanticObjects);
    // Preserve the pixel-accurate color from the vector engine — never overwrite it.
    // LLM semantic color guesses (sem.color_hex) are unreliable and cause color mismatches.
    const originalColor = r.color || r.hex || '#888888';
    return {
      ...r,
      color: originalColor,
      // Semantic enrichment: override geometry/stitch params only — never color or layer_order.
      // priority: take the MAX of semantic and vector engine so foreground details always win.
      ...(sem ? {
        object:         sem.label,
        object_group:   sem.object_group,
        geometry:       sem.geometry,
        // complexity/curvature from semantic are LLM estimates — only use if we don't have computed values
        complexity:     r.complexity || sem.complexity,
        curvature:      r.curvature  || sem.curvature,
        // orientation from LLM is unreliable — let Adaptive Engine compute from PCA
        stitch_type:    sem.stitch_type,   // LLM has visual context we don't — respect it
        stitch_notes:   sem.stitch_notes,
        priority:       Math.max(sem.priority || 1, r.priority || r.layer_order || 1),
        // DO NOT spread sem.orientation — PCA from contourTracer is more accurate
      } : {}),
      // Restore color after semantic spread (belt-and-suspenders guard)
      color: originalColor,
      name: r.name || (sem ? sem.label : autoName(r, i)),
    };
  });

  // ── Build dedicated contour paths on the final regions ──────────────────
  // Backend-produced regions (hybridDigitize path) arrive without contours.
  // Fallback regions (from contours) may already have them — skip those.
  const needsContours = named.some(r => !r.contour);
  if (needsContours && named.length > 0) {
    const { contours } = buildContoursForRegions(named, { edgeMap: ctx.edgeMap });
    for (const r of named) {
      if (!r.contour) {
        const c = contours.get(r.id);
        if (c) r.contour = c;
      }
    }
  }

  ctx.regions = enrichAllRegions(named, width_mm, height_mm, fabric_type, ctx._useAdaptiveEngine);
  console.log(`[RegionBuilder] Regiones finales: ${ctx.regions.length}`);
}

// ─── Semantic matching ────────────────────────────────────────────────────────

function findSemanticForRegion(region, objects) {
  if (!objects?.length) return null;
  const [cx, cy] = region.centroid || [0.5, 0.5];
  let best = null, bestScore = -Infinity;

  for (const obj of objects) {
    const { x, y, w, h } = obj.bbox || {};
    if (x === undefined || w <= 0 || h <= 0) continue;
    const inside = cx >= x && cx <= x + w && cy >= y && cy <= y + h;
    // Normalized distance: dist / (bbox diagonal * 0.5) → 0 at center, 1 at bbox corner
    const distToCenter = Math.hypot(cx - (x + w / 2), cy - (y + h / 2));
    const bboxDiag     = Math.hypot(w, h);
    const normDist     = bboxDiag > 0 ? distToCenter / (bboxDiag * 0.5) : Infinity;
    // Score: positive when inside, negative when outside, normalized by bbox size.
    // This makes the threshold scale-invariant across small and large semantic objects.
    const score = inside ? (1 - normDist) : -normDist;
    if (score > bestScore) { bestScore = score; best = obj; }
  }

  // Accept: centroid inside bbox (score > 0) or within 30% of bbox diagonal outside (score > -0.3).
  // Rejects distant false positives while tolerating small centroid/bbox misalignments
  // that happen on irregular shapes where centroid falls just outside the LLM bbox.
  return bestScore > -0.3 ? best : null;
}

// ─── Auto-naming ──────────────────────────────────────────────────────────────

function closestColorName(hex) {
  if (!hex || hex.length < 7) return 'color';
  const h = hex.toLowerCase();
  const r = parseInt(h.slice(1,3),16) || 128;
  const g = parseInt(h.slice(3,5),16) || 128;
  const b = parseInt(h.slice(5,7),16) || 128;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const lum = (r + g + b) / 3, delta = max - min;
  if (lum < 30) return 'negro';
  if (lum > 230 && delta < 20) return 'blanco';
  if (delta < 25) return 'gris';
  let hue;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue = hue * 60; if (hue < 0) hue += 360;
  if (hue < 15 || hue >= 345) { if (delta < 80 && lum > 150) return 'rosa'; return 'rojo'; }
  if (hue < 45) return 'naranja';
  if (hue < 65) return 'amarillo';
  if (hue < 165) return 'verde';
  if (hue < 195) return 'cyan';
  if (hue < 255) return 'azul';
  if (hue < 285) return 'morado';
  return 'rosa';
}

function autoName(r, i) {
  const [cx, cy] = r.centroid || [0.5, 0.5];
  const v = cy < 0.33 ? 'sup' : cy > 0.66 ? 'inf' : 'cen';
  const h = cx < 0.33 ? '_izq' : cx > 0.66 ? '_der' : '';
  const abbr = r.stitch_type === 'fill' ? 'fill' : r.stitch_type === 'satin' ? 'sat' : 'run';
  return `${v}${h}_${closestColorName(r.color)}_${abbr}`;
}

// ─── Background-filter helpers (normalized 0–1 coordinates) ───────────────────

function polygonAreaNormalized(pts) {
  if (!pts || pts.length < 3) return 0;
  let a = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return Math.abs(a) / 2;
}

function touchesEdges(r, margin = 0.012) {
  const pts = r.path_points || [];
  if (pts.length === 0) return 0;
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  let count = 0;
  if (minX <= margin) count++;
  if (maxX >= 1 - margin) count++;
  if (minY <= margin) count++;
  if (maxY >= 1 - margin) count++;
  return count;
}