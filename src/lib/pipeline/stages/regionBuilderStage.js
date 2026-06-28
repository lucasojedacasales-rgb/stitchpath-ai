/**
 * Stage 5: Region Builder
 * Input:  ctx.vectorRegions, ctx.config
 * Output: ctx.regions (EnrichedRegion[])
 */

import { enrichAllRegions } from '../../regionBuilder.js';

export async function runRegionBuilder(ctx) {
  if (!ctx.vectorRegions || ctx.vectorRegions.length === 0) {
    ctx.regions = [];
    return;
  }

  const { width_mm = 100, height_mm = 100 } = ctx.config;

  // Auto-name any unnamed regions before enrichment
  const named = ctx.vectorRegions.map((r, i) => ({
    ...r,
    name: r.name || autoName(r, i),
  }));

  ctx.regions = enrichAllRegions(named, width_mm, height_mm);
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