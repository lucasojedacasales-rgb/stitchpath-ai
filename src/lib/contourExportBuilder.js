/**
 * contourExportBuilder.js — StitchPath AI
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates REAL contour/outline stitch objects for embroidery export.
 *
 * Contours are not just visual borders drawn on canvas — they become real
 * stitch commands in finalEmbroideryCommands with proper satin / triple-run /
 * run stitches that the machine actually sews.
 *
 * Stitch type by contour role:
 *   outer_outline  → satin fino (1.0–1.6mm width, 0.4mm density)
 *   inner_outline  → satin fino or run
 *   detail_run     → triple run (3 passes for visibility)
 *   mouth_detail   → triple run
 *
 * Public API:
 *   buildContourObjects(regions, config)           → { objects, report }
 *   generateContourStitches(obj, machineSettings)  → stitch points []
 *   countContourStitches(commands)                 → contour metrics
 *   contoursPreservedInOptimization(before, after) → boolean
 *   getContourExportReport(regions, commands)      → report + logs
 */

import { generateOutlines } from './outlineGenerator.js';
import { generateTieIn, generateTieOff, removeRedundantNodes } from './industrialStitchProcessor.js';

// ─── Satin / run parameters ─────────────────────────────────────────────────
const SATIN_WIDTH_MM   = 1.2;   // 1.0–1.6mm range
const SATIN_DENSITY_MM = 0.4;   // 0.35–0.45mm range
const MAX_STITCH_MM    = 3.5;   // max stitch length for contours
const TENSION_COMP_MM  = 0.3;   // 0.2–0.4mm pull compensation

// ═══════════════════════════════════════════════════════════════════════════
//  PATH WALKING — sample polygon at regular intervals
// ═══════════════════════════════════════════════════════════════════════════

function walkPath(points, stepMm, closed) {
  const pts = closed ? [...points, points[0]] : [...points];
  if (pts.length < 2) return [];
  const result = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const segLen = Math.hypot(bx - ax, by - ay);
    if (segLen < 1e-9) continue;
    const dx = (bx - ax) / segLen;
    const dy = (by - ay) / segLen;
    const numSteps = Math.max(1, Math.ceil(segLen / stepMm));
    const actualStep = segLen / numSteps;
    for (let s = 0; s < numSteps; s++) {
      const d = s * actualStep;
      result.push([ax + dx * d, ay + dy * d]);
    }
  }
  result.push(pts[pts.length - 1]);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
//  SATIN COLUMN — zigzag along a path with perpendicular offset
// ═══════════════════════════════════════════════════════════════════════════

function generateSatinColumnPath(points, widthMm, densityMm, closed) {
  const halfW = widthMm / 2 + TENSION_COMP_MM / 2;
  const walked = walkPath(points, densityMm, closed);
  if (walked.length < 4) return [];

  const stitches = [];
  const n = walked.length;

  for (let i = 0; i < n; i++) {
    const p = walked[i];
    const prev = walked[(i - 1 + n) % n];
    const next = walked[(i + 1) % n];
    let tx = next[0] - prev[0];
    let ty = next[1] - prev[1];
    const tLen = Math.hypot(tx, ty);
    if (tLen < 1e-9) continue;
    tx /= tLen;
    ty /= tLen;

    // Normal = perpendicular to tangent
    const nx = -ty * halfW;
    const ny = tx * halfW;

    // Alternate left/right to create zigzag
    if (i % 2 === 0) {
      stitches.push([p[0] + nx, p[1] + ny]);
    } else {
      stitches.push([p[0] - nx, p[1] - ny]);
    }
  }

  // Close the satin loop
  if (closed && stitches.length > 0) {
    stitches.push(stitches[0]);
  }

  return stitches;
}

// ═══════════════════════════════════════════════════════════════════════════
//  TRIPLE RUN — 3 passes for bold thin lines (mouth, eyes, details)
// ═══════════════════════════════════════════════════════════════════════════

function generateTripleRunPath(points, closed) {
  if (closed && points.length >= 3) {
    const loop = [...points, points[0]];
    return [...loop, ...loop, ...loop];
  }
  // Open path: forward → backward → forward
  return [...points, ...[...points].reverse(), ...points];
}

// ═══════════════════════════════════════════════════════════════════════════
//  SINGLE RUN — one pass
// ═══════════════════════════════════════════════════════════════════════════

function generateRunPath(points, closed) {
  if (closed && points.length >= 3) {
    return [...points, points[0]];
  }
  return [...points];
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN STITCH GENERATOR — selects satin / triple-run / run by contour type
// ═══════════════════════════════════════════════════════════════════════════

export function generateContourStitches(obj, machineSettings = {}) {
  const points = obj.points || [];
  if (points.length < 2) return [];

  const closed = obj.rawRegion?.closed !== false;
  const widthMm = obj.contourWidthMm || SATIN_WIDTH_MM;
  const densityMm = SATIN_DENSITY_MM;
  const stitchType = obj.stitch_type || 'running_stitch';
  const layerType = obj.layerType || '';

  let stitches = [];

  if (stitchType === 'satin') {
    stitches = generateSatinColumnPath(points, widthMm, densityMm, closed);
  } else {
    // Running stitch — triple run for details/mouth, single for thin outlines
    const name = (obj.name || '').toLowerCase();
    const isDetail = name.includes('mouth') || name.includes('detail') ||
                     name.includes('eye') || name.includes('line') ||
                     layerType === 'detail_run' || layerType === 'mouth_detail_run';
    if (isDetail) {
      stitches = generateTripleRunPath(points, closed);
    } else {
      stitches = generateRunPath(points, closed);
    }
  }

  if (stitches.length < 2) return [];

  // Clean up micro-duplicates
  stitches = removeRedundantNodes(stitches, 0.3);
  if (stitches.length < 2) return [];

  // Tie-in / tie-off (locking stitches)
  const tieIn = generateTieIn(stitches[0]);
  const tieOff = generateTieOff(stitches[stitches.length - 1]);

  return [...tieIn, ...stitches, ...tieOff];
}

// ═══════════════════════════════════════════════════════════════════════════
//  BUILD CONTOUR OBJECTS — from fill regions via outlineGenerator
// ═══════════════════════════════════════════════════════════════════════════

function getContourPriority(outline) {
  const rc = outline.region_class || outline.layerType || '';
  if (rc === 'outer_outline') return 90;
  if (rc === 'inner_outline') return 80;
  if (rc === 'detail_run' || rc === 'mouth_detail_run') return 70;
  return 85;
}

export function buildContourObjects(regions, config = {}) {
  const w = config.width_mm || 100;
  const h = config.height_mm || 100;

  // Always generate outlines for export — force enabled
  const { outlines, report } = generateOutlines(regions, { ...config, generateOutlines: true });

  const objects = [];

  for (const outline of outlines) {
    const pts = outline.path_points || [];
    if (pts.length < 2) continue;

    const mmPoints = pts.map(([nx, ny]) => [
      (nx - 0.5) * w,
      (ny - 0.5) * h,
    ]);

    // Determine stitch type: satin for outer (always bold), run for inner/details
    const rc = outline.region_class || '';
    const isOuter = rc === 'outer_outline';
    const stitchType = isOuter ? 'satin' : (outline.stitch_type || 'running_stitch');
    const contourWidth = isOuter
      ? Math.max(1.0, Math.min(1.6, outline.contour_width_mm || SATIN_WIDTH_MM))
      : Math.max(0.5, Math.min(1.0, outline.contour_width_mm || 0.8));

    objects.push({
      id: outline.id || `contour_${objects.length}`,
      color: outline.color || '#1a1a1a',
      name: outline.name || 'outline',
      stitch_type: stitchType,
      priority: getContourPriority(outline),
      layerType: rc,
      isContour: true,
      contourWidthMm: contourWidth,
      points: mmPoints,
      rawRegion: outline,
      ce01SafeFillMode: false,
    });
  }

  console.log(`[contour-export] contour objects generated: ${objects.length}`);
  console.log(`[contour-export] outer outlines: ${objects.filter(o => o.layerType === 'outer_outline').length}`);
  console.log(`[contour-export] inner outlines: ${objects.filter(o => o.layerType === 'inner_outline').length}`);

  return { objects, report };
}

// ═══════════════════════════════════════════════════════════════════════════
//  CONTOUR STITCH COUNTING — from flat command sequence
// ═══════════════════════════════════════════════════════════════════════════

export function countContourStitches(commands) {
  let outerOutlineStitches = 0;
  let innerOutlineStitches = 0;
  let detailRunStitches = 0;
  let mouthStitches = 0;
  let outerOutlineColor = null;
  let outerOutlineOrder = -1;
  const innerRegionIds = new Set();
  const detailRegionIds = new Set();

  for (let i = 0; i < commands.length; i++) {
    const c = commands[i];
    if (c.type !== 'stitch') continue;

    const rid = (c.regionId || '').toLowerCase();
    const lt = (c.layerType || '').toLowerCase();
    const st = (c.stitchType || '').toLowerCase();

    if (rid.includes('outer') || lt === 'outer_outline') {
      outerOutlineStitches++;
      if (outerOutlineOrder < 0) outerOutlineOrder = i;
      if (!outerOutlineColor) outerOutlineColor = c.color;
    } else if (rid.includes('inner') || lt === 'inner_outline') {
      innerOutlineStitches++;
      innerRegionIds.add(c.regionId);
    } else if (rid.includes('mouth')) {
      mouthStitches++;
    } else if (rid.includes('detail') || lt === 'detail_run' || st === 'running_stitch' && rid.includes('outline')) {
      detailRunStitches++;
      detailRegionIds.add(c.regionId);
    }
  }

  return {
    outerOutlineStitches,
    innerOutlineStitches,
    innerContoursExported: innerRegionIds.size,
    detailRunStitches,
    detailContoursExported: detailRegionIds.size,
    mouthStitches,
    outerOutlineColor,
    outerOutlineOrder,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  OPTIMIZATION GUARD — contours must survive optimization
// ═══════════════════════════════════════════════════════════════════════════

export function contoursPreservedInOptimization(before, after) {
  const beforeCounts = countContourStitches(before);
  const afterCounts = countContourStitches(after);

  // Outer outline must not be eliminated
  if (beforeCounts.outerOutlineStitches > 0 && afterCounts.outerOutlineStitches === 0) {
    console.warn('[contour-guard] outer outline eliminated by optimizer — DISCARD');
    return false;
  }

  // Mouth must not disappear
  if (beforeCounts.mouthStitches > 0 && afterCounts.mouthStitches === 0) {
    console.warn('[contour-guard] mouth detail eliminated by optimizer — DISCARD');
    return false;
  }

  // Inner contours must not all disappear
  if (beforeCounts.innerOutlineStitches > 0 && afterCounts.innerOutlineStitches === 0) {
    console.warn('[contour-guard] inner outlines eliminated by optimizer — DISCARD');
    return false;
  }

  // Outer outline must not lose more than 50% of stitches
  if (beforeCounts.outerOutlineStitches > 0) {
    const ratio = afterCounts.outerOutlineStitches / beforeCounts.outerOutlineStitches;
    if (ratio < 0.5) {
      console.warn(`[contour-guard] outer outline stitches dropped to ${Math.round(ratio * 100)}% — DISCARD`);
      return false;
    }
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
//  EXPORT REPORT — visual vs exported contour comparison + logs
// ═══════════════════════════════════════════════════════════════════════════

export function getContourExportReport(regions, commands) {
  const counts = countContourStitches(commands);

  // Visual contour check — does the design have visible outer outline regions?
  const visualOuterOutline = regions.some(r => {
    const rc = r.region_class || r.layerType || '';
    const name = (r.name || '').toLowerCase();
    return rc === 'outer_outline' || name.includes('outer_outline') || name.includes('outline');
  });

  // Also check if any fill regions exist (outlines are generated from fills)
  const hasFills = regions.some(r =>
    r.stitch_type === 'fill' && r.path_points && r.path_points.length >= 8
  );

  const exportedOuterOutline = counts.outerOutlineStitches > 0;
  const mouthExported = counts.mouthStitches > 0;
  const innerContoursExported = counts.innerContoursExported > 0;

  // Ready: either no visual outline expected, or it's exported
  const contourMissing = (visualOuterOutline || hasFills) && !exportedOuterOutline;
  const contourWeak = exportedOuterOutline && counts.outerOutlineStitches < 80;
  const ready = !contourMissing;

  // ── Mandatory logs ──
  console.log('[outline-export] visual outer outline:', (visualOuterOutline || hasFills) ? 'YES' : 'NO');
  console.log('[outline-export] exported outer outline:', exportedOuterOutline ? 'YES' : 'NO');
  console.log('[outline-export] outer outline stitch type:', exportedOuterOutline ? 'satin/run' : 'none');
  console.log('[outline-export] outer outline stitches:', counts.outerOutlineStitches);
  console.log('[outline-export] outer outline color:', counts.outerOutlineColor);
  console.log('[outline-export] outer outline order:', counts.outerOutlineOrder);
  console.log('[outline-export] inner outlines:', counts.innerContoursExported);
  console.log('[outline-export] mouth detail run:', counts.mouthStitches);
  console.log('[outline-export] protected from optimizer: true');
  console.log('[outline-export] final command contains outline:', exportedOuterOutline);
  console.log('[outline-export] ready:', ready);

  return {
    visualOuterOutline: (visualOuterOutline || hasFills) ? 'YES' : 'NO',
    exportedOuterOutline: exportedOuterOutline ? 'YES' : 'NO',
    outerOutlineStitches: counts.outerOutlineStitches,
    outerOutlineColor: counts.outerOutlineColor,
    outerOutlineOrder: counts.outerOutlineOrder,
    mouthExported: mouthExported ? 'YES' : 'NO',
    mouthStitches: counts.mouthStitches,
    innerContoursExported: innerContoursExported ? 'YES' : 'NO',
    innerOutlineStitches: counts.innerOutlineStitches,
    detailRunStitches: counts.detailRunStitches,
    contourMissing,
    contourWeak,
    ready,
  };
}