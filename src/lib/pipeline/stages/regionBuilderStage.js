/**
 * Stage 5: Region Builder
 * Input:  ctx.vectorRegions, ctx.config
 * Output: ctx.regions (EnrichedRegion[])
 */

import { enrichAllRegions } from '../../regionBuilder.js';
import { getModeStrategy } from '../../digitizeModes.js';

export async function runRegionBuilder(ctx) {
  if (!ctx.vectorRegions || ctx.vectorRegions.length === 0) {
    ctx.regions = [];
    return;
  }

  const strategy = getModeStrategy(ctx.config.mode || 'hybrid');
  // Fast mode skips the Adaptive Engine to keep processing time low.
  // All other modes use it for geometry-driven parameter resolution.
  ctx._useAdaptiveEngine = strategy.stitchStrategy?.useAdaptiveEngine !== false;

  const { width_mm = 100, height_mm = 100, fabric_type = 'Algodón' } = ctx.config;

  // Apply semantic metadata to vector regions when available
  const semanticObjects = ctx.semanticMap?.objects || [];

  const named = ctx.vectorRegions.map((r, i) => {
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

  ctx.regions = enrichAllRegions(named, width_mm, height_mm, fabric_type, ctx._useAdaptiveEngine);
}

// ─── Semantic matching ────────────────────────────────────────────────────────

function findSemanticForRegion(region, objects) {
  if (!objects?.length) return null;
  const [cx, cy] = region.centroid || [0.5, 0.5];
  let best = null, bestScore = -Infinity;

  for (const obj of objects) {
    const { x, y, w, h } = obj.bbox || {};
    if (x === undefined) continue;
    const inside = cx >= x && cx <= x + w && cy >= y && cy <= y + h;
    const dist   = Math.hypot(cx - (x + w / 2), cy - (y + h / 2));
    const score  = inside ? (1 - dist) : -dist;
    if (score > bestScore) { bestScore = score; best = obj; }
  }

  return bestScore > -0.3 ? best : null;
}

// ─── Auto-naming ──────────────────────────────────────────────────────────────

const COLOR_NAMES = {
  '#000000': 'negro', '#1a1a1a': 'negro', '#ffffff': 'blanco',
  '#ff0000': 'rojo',  '#00ff00': 'verde', '#0000ff': 'azul',
  '#ffff00': 'amarillo', '#ffa500': 'naranja', '#800080': 'morado',
  '#ff69b4': 'rosa',  '#ffc0cb': 'rosa',  '#8b4513': 'marron',
};

function closestColorName(hex) {
  if (!hex) return 'color';
  const h = hex.toLowerCase();
  if (COLOR_NAMES[h]) return COLOR_NAMES[h];
  const r = parseInt(h.slice(1,3),16), g = parseInt(h.slice(3,5),16), b = parseInt(h.slice(5,7),16);
  let best = 'color', bestD = Infinity;
  for (const [k, name] of Object.entries(COLOR_NAMES)) {
    const kr = parseInt(k.slice(1,3),16), kg = parseInt(k.slice(3,5),16), kb = parseInt(k.slice(5,7),16);
    const d = (r-kr)**2 + (g-kg)**2 + (b-kb)**2;
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}

function autoName(r, i) {
  const [cx, cy] = r.centroid || [0.5, 0.5];
  const v = cy < 0.33 ? 'sup' : cy > 0.66 ? 'inf' : 'cen';
  const h = cx < 0.33 ? '_izq' : cx > 0.66 ? '_der' : '';
  const abbr = r.stitch_type === 'fill' ? 'fill' : r.stitch_type === 'satin' ? 'sat' : 'run';
  return `${v}${h}_${closestColorName(r.color)}_${abbr}`;
}