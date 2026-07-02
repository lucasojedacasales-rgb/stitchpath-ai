/**
 * outlineGenerator.js — StitchPath AI
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates real outline objects as independent embroidery entities — not
 * just canvas borders. Each outline becomes a standalone stitch object with
 * its own color, stitch type, and priority.
 *
 * Generates:
 *   - outer silhouette outline (from the outermost region boundary)
 *   - inner outlines at high-contrast borders between regions
 *
 * Stitch type by width:
 *   < 0.8mm  → run stitch
 *   0.8–2.0mm → satin
 *   > 2.0mm  → satin wide (or fill if very wide)
 *
 * Public API:
 *   generateOutlines(regions, config) → { outlines, report }
 *   stitchTypeForWidth(widthMm)       → 'running_stitch' | 'satin' | 'fill'
 */

const HIGH_CONTRAST_THRESHOLD = 80;
const DARK_LUM_THRESHOLD = 60;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = (hex || '#888888').replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) || 128,
    g: parseInt(h.slice(2, 4), 16) || 128,
    b: parseInt(h.slice(4, 6), 16) || 128,
  };
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function colorDistance(c1, c2) {
  const a = hexToRgb(c1), b = hexToRgb(c2);
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function computeBbox(pts) {
  if (!pts || pts.length === 0) return { minX: 0.5, maxX: 0.5, minY: 0.5, maxY: 0.5, w: 0, h: 0 };
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

function perimeterNorm(pts) {
  if (!pts || pts.length < 2) return 0;
  let p = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    p += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  }
  return p;
}

function dedupePoints(pts) {
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-5) {
      out.push([p[0], p[1]]);
    }
  }
  return out;
}

function ensureClosed(pts) {
  if (pts.length < 3) return pts;
  const f = pts[0], l = pts[pts.length - 1];
  if (Math.hypot(f[0] - l[0], f[1] - l[1]) > 0.01) return [...pts, [f[0], f[1]]];
  return pts;
}

// ─── Stitch type selection ─────────────────────────────────────────────────────

export function stitchTypeForWidth(widthMm) {
  if (widthMm < 0.8) return 'running_stitch';
  if (widthMm <= 2.0) return 'satin';
  return 'fill';
}

// ─── Outer silhouette outline ──────────────────────────────────────────────────

/**
 * Generates the outer silhouette outline from the outermost fill region.
 * The outermost fill = largest bounding box that contains other fills.
 *
 * @returns {Object|null} outline object
 */
function generateOuterSilhouette(regions, config) {
  const fills = regions.filter(r =>
    (r.region_class === 'fill' || (!r.region_class && r.stitch_type === 'fill')) &&
    r.path_points && r.path_points.length >= 8
  );
  if (fills.length === 0) return null;

  // Find the fill with the largest bbox that contains other fills
  let bestFill = null, bestScore = -1;
  for (const f of fills) {
    const bbox = computeBbox(f.path_points);
    let containedCount = 0;
    for (const other of fills) {
      if (other.id === f.id) continue;
      const ob = computeBbox(other.path_points);
      if (ob.minX >= bbox.minX - 0.02 && ob.maxX <= bbox.maxX + 0.02 &&
          ob.minY >= bbox.minY - 0.02 && ob.maxY <= bbox.maxY + 0.02) {
        containedCount++;
      }
    }
    const score = bbox.w * bbox.h + containedCount * 0.5;
    if (score > bestScore) { bestScore = score; bestFill = f; }
  }
  if (!bestFill) return null;

  const outlinePts = ensureClosed(dedupePoints(bestFill.path_points));
  if (outlinePts.length < 8) return null;

  const perim = perimeterNorm(outlinePts);
  if (perim < 0.15) return null;

  const widthMm = config.width_mm || 100;
  const heightMm = config.height_mm || 100;
  const perimMm = perim * Math.max(widthMm, heightMm);
  // Estimate outline width from area/perimeter ratio
  const areaNorm = bestFill.area_mm2 / (widthMm * heightMm) || 0;
  const estWidthMm = areaNorm > 0 && perim > 0 ? (areaNorm * widthMm * heightMm) / perimMm : 1.0;

  const outlineColor = '#1a1a1a'; // dark outline for cartoon clean look
  const stitchType = stitchTypeForWidth(Math.max(0.5, Math.min(1.5, estWidthMm)));

  console.log(`[outline-generator] outer silhouette from ${bestFill.name || bestFill.id}: pts=${outlinePts.length} stitch=${stitchType}`);

  return {
    id: `outline_outer_${bestFill.id}`,
    parentRegionId: bestFill.id,
    type: 'contour',
    region_class: 'outer_outline',
    stitch_type: stitchType,
    contour_class: 'outer_silhouette',
    contour_points: outlinePts,
    path_points: outlinePts,
    hex: outlineColor,
    color: outlineColor,
    contour_color: outlineColor,
    contour_width_mm: Math.max(0.5, Math.min(1.5, estWidthMm)),
    confidence: 85,
    source: 'outline_generator_outer',
    closed: true,
    name: `${(bestFill.name || 'body').replace(/_(fill|sat|run|contour|outline|detail)$/i, '')}_outer_outline`,
    visible: true,
    priority: 7, // sewn last for maximum definition
    area_mm2: bestFill.area_mm2,
    perimeter_mm: perimMm,
  };
}

// ─── Inner outlines ────────────────────────────────────────────────────────────

/**
 * Generates inner outlines at high-contrast borders between adjacent regions.
 * Each outline follows the boundary of a fill region where a high-contrast
 * neighbor exists.
 */
function generateInnerOutlines(regions, config) {
  const fills = regions.filter(r =>
    (r.region_class === 'fill' || (!r.region_class && r.stitch_type === 'fill')) &&
    r.path_points && r.path_points.length >= 8
  );

  const outlines = [];
  const widthMm = config.width_mm || 100;
  const heightMm = config.height_mm || 100;

  for (const fill of fills) {
    const bbox = computeBbox(fill.path_points);
    if (bbox.w <= 0) continue;

    // Check for high-contrast neighbors
    let hasHighContrastNeighbor = false;
    for (const other of fills) {
      if (other.id === fill.id) continue;
      const ob = computeBbox(other.path_points);
      if (ob.w <= 0) continue;
      // Check bbox overlap or adjacency
      const xOverlap = Math.max(0, Math.min(bbox.maxX, ob.maxX) - Math.max(bbox.minX, ob.minX));
      const yOverlap = Math.max(0, Math.min(bbox.maxY, ob.maxY) - Math.max(bbox.minY, ob.minY));
      const isAdjacent = (xOverlap > 0 && yOverlap > -0.05) || (yOverlap > 0 && xOverlap > -0.05);
      if (!isAdjacent) continue;

      const contrast = colorDistance(
        fill.color || fill.hex || '#888888',
        other.color || other.hex || '#888888'
      );
      if (contrast > HIGH_CONTRAST_THRESHOLD) {
        hasHighContrastNeighbor = true;
        break;
      }
    }

    if (!hasHighContrastNeighbor) continue;

    // Check if this fill already has an outer outline generated
    // (don't duplicate the outer silhouette as an inner outline)
    if (regions.some(r => r.region_class === 'outer_outline' && r.parentRegionId === fill.id)) continue;

    const outlinePts = ensureClosed(dedupePoints(fill.path_points));
    if (outlinePts.length < 8) continue;

    const perim = perimeterNorm(outlinePts);
    if (perim < 0.12) continue;

    const perimMm = perim * Math.max(widthMm, heightMm);
    const outlineColor = '#1a1a1a';
    const stitchType = stitchTypeForWidth(0.6); // inner outlines are typically thin

    outlines.push({
      id: `outline_inner_${fill.id}`,
      parentRegionId: fill.id,
      type: 'contour',
      region_class: 'inner_outline',
      stitch_type: stitchType,
      contour_class: 'inner_border',
      contour_points: outlinePts,
      path_points: outlinePts,
      hex: outlineColor,
      color: outlineColor,
      contour_color: outlineColor,
      contour_width_mm: 0.6,
      confidence: 70,
      source: 'outline_generator_inner',
      closed: true,
      name: `${(fill.name || 'region').replace(/_(fill|sat|run|contour|outline|detail)$/i, '')}_inner_outline`,
      visible: true,
      priority: 6,
      area_mm2: fill.area_mm2,
      perimeter_mm: perimMm,
    });
  }

  console.log(`[outline-generator] inner outlines generated: ${outlines.length}`);
  return outlines;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Generates all outline objects (outer silhouette + inner outlines).
 * Outlines are independent embroidery entities — not canvas borders.
 *
 * @param {Array}  regions — classified regions
 * @param {Object} config  — { width_mm, height_mm, generateOutlines }
 * @returns {{ outlines, report }}
 */
export function generateOutlines(regions, config = {}) {
  // Only generate when enabled (default ON for cartoon characters)
  const enabled = config.generateOutlines !== false;
  console.log(`[outline-generator] enabled: ${enabled}`);

  if (!enabled) {
    return { outlines: [], report: { enabled: false, outerCount: 0, innerCount: 0, total: 0 } };
  }

  const outer = generateOuterSilhouette(regions, config);
  const inner = generateInnerOutlines(regions, config);

  const outlines = [];
  if (outer) outlines.push(outer);
  outlines.push(...inner);

  // Deduplicate: don't add inner outline if it duplicates the outer
  const deduped = deduplicateOutlines(outlines);

  console.log(`[outline-generator] total outlines: ${deduped.length} (outer: ${outer ? 1 : 0}, inner: ${inner.length})`);
  console.log(`[outline-generator] outline names: ${deduped.map(o => o.name).join(', ') || 'none'}`);

  return {
    outlines: deduped,
    report: {
      enabled,
      outerCount: outer ? 1 : 0,
      innerCount: inner.length,
      total: deduped.length,
      outlines: deduped.map(o => ({
        id: o.id,
        name: o.name,
        class: o.region_class,
        stitchType: o.stitch_type,
        widthMm: o.contour_width_mm,
        priority: o.priority,
      })),
    },
  };
}

function deduplicateOutlines(outlines) {
  if (outlines.length < 2) return outlines;
  const keep = [];
  for (const o of outlines) {
    const dup = keep.find(k =>
      k.contour_color === o.contour_color &&
      bboxSimilar(computeBbox(k.contour_points), computeBbox(o.contour_points))
    );
    if (!dup) keep.push(o);
  }
  return keep;
}

function bboxSimilar(a, b) {
  const iou = bboxIoU(a, b);
  return iou > 0.85;
}

function bboxIoU(a, b) {
  const ix = Math.max(a.minX, b.minX), iy = Math.max(a.minY, b.minY);
  const ix2 = Math.min(a.maxX, b.maxX), iy2 = Math.min(a.maxY, b.maxY);
  const iw = Math.max(0, ix2 - ix), ih = Math.max(0, iy2 - iy);
  const inter = iw * ih;
  const ua = a.w * a.h + b.w * b.h - inter;
  return ua > 0 ? inter / ua : 0;
}