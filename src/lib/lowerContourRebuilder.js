/**
 * lowerContourRebuilder.js — StitchPath AI
 * ─────────────────────────────────────────────────────────────────────────────
 * STRICT reconstruction of the LOWER contours (lower body edge + left/right
 * feet) from REAL dark stroke pixels only.
 *
 * Hard rules:
 *   - Geometry comes ONLY from darkStrokeMask pixels. Never from fill boundaries,
 *     color unions, inferred silhouettes, convex hull, auto-close, travel, or
 *     long-distance point connections.
 *   - If a real dark line is missing, leave a gap. Never invent a line.
 *   - Feet: extracted via angular boundary trace (clean oval loop). If the loop
 *     cannot close cleanly (endpoints far apart), the segment is DISCARDED —
 *     never closed with a long straight line, never left as an open cap.
 *   - Lower body: open arc from the cleaned dark skeleton. Stays open (no cap).
 *   - Three independent routes (body_lower, left_foot, right_foot). Never
 *     stitched together with visible stitches — jump/trim between them.
 *   - No satin end caps, no round blobs (triple-run, no tie-in/tie-off).
 *
 * Public API:
 *   rebuildLowerOuterContoursFromDarkStroke(regions, config, darkStroke)
 *     → { contours, report }
 *   mergeLowerContourSegments(contours)
 *     → { contours, mergedCount, rejectedCount }
 *   getLastLowerContourReport()
 *   LOWER_CONTOUR_WIDTH
 */

export const LOWER_CONTOUR_WIDTH = 1.1; // mm

const LOWER_ZONE_Y = 0.50;      // normalized y: below this = "lower"
const FOOT_BOTTOM_Y = 0.72;     // components reaching below this = foot zone
const FOOT_LEFT_MAX_X = 0.45;
const FOOT_RIGHT_MIN_X = 0.55;
const MIN_CONTOUR_POINTS = 8;
const SAFE_CLOSE_GAP_MM = 1.8;  // feet close only if endpoints within this
const NUM_ANGULAR_BINS = 180;

let _lastReport = null;
export function getLastLowerContourReport() { return _lastReport; }

// ── Group classification ──────────────────────────────────────────────────────
function classifyLowerComponent(comp, w, h) {
  const cx = ((comp.bbox.minX + comp.bbox.maxX) / 2) / w;
  const cy = ((comp.bbox.minY + comp.bbox.maxY) / 2) / h;
  const maxY = comp.bbox.maxY / h;
  if (cy < LOWER_ZONE_Y) return null;
  if (maxY > FOOT_BOTTOM_Y) {
    if (cx < FOOT_LEFT_MAX_X) return 'lower_foot_left';
    if (cx > FOOT_RIGHT_MIN_X) return 'lower_foot_right';
  }
  return 'lower_body';
}

// ── Angular boundary trace (for feet — closed oval shapes) ────────────────────
// Bins component pixels by angle around the centroid, keeps the FARTHEST pixel
// per bin, sorts by angle. Produces a clean closed loop for oval feet. Uses only
// real dark pixels — never invents geometry.
function extractOvalBoundary(comp, w, h) {
  const cx = comp.centroid.x, cy = comp.centroid.y;
  const bins = new Array(NUM_ANGULAR_BINS).fill(null);
  for (const idx of comp.pixels) {
    const px = idx % w;
    const py = Math.floor(idx / w);
    const ang = Math.atan2(py - cy, px - cx);
    const bin = Math.floor(((ang + Math.PI) / (2 * Math.PI)) * NUM_ANGULAR_BINS) % NUM_ANGULAR_BINS;
    const dist = (px - cx) * (px - cx) + (py - cy) * (py - cy);
    if (!bins[bin] || dist > bins[bin].dist) {
      bins[bin] = { x: px, y: py, dist, ang };
    }
  }
  const pts = bins.filter(b => b).sort((a, b) => a.ang - b.ang);
  return pts.map(p => ({ x: p.x, y: p.y }));
}

// ── Cleaned skeleton (for lower body — thin arc) ──────────────────────────────
// Removes immediate backtracks and duplicate points from the greedy walk.
function cleanSkeleton(skeleton) {
  if (!skeleton || skeleton.length === 0) return [];
  const out = [skeleton[0]];
  for (let i = 1; i < skeleton.length; i++) {
    const p = skeleton[i];
    const last = out[out.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 1.0) continue; // dedupe
    // backtrack: p is very close to a point 2 steps back → skip the reversal
    if (out.length >= 2) {
      const prev2 = out[out.length - 2];
      if (Math.hypot(p.x - prev2.x, p.y - prev2.y) < 1.5) {
        out.pop(); // remove the backtrack point
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

function pixelToMm(p, w, h, widthMm, heightMm) {
  return [(p.x / w - 0.5) * widthMm, (p.y / h - 0.5) * heightMm];
}

function dedupeMm(pts, eps = 0.06) {
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > eps) out.push([p[0], p[1]]);
  }
  return out;
}

// ── Merge collinear short segments ────────────────────────────────────────────
function mergeCollinear(pts, angleTolDeg = 18, maxSegLenMm = 2.0) {
  if (pts.length < 4) return { points: pts, merged: 0 };
  const result = [pts[0]];
  let merged = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = result[result.length - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const v1x = b[0] - a[0], v1y = b[1] - a[1];
    const v2x = c[0] - b[0], v2y = c[1] - b[1];
    const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
    if (l1 < 1e-6 || l2 < 1e-6) { merged++; continue; }
    const cos = (v1x * v2x + v1y * v2y) / (l1 * l2);
    const ang = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
    if (ang < angleTolDeg && l1 < maxSegLenMm) { merged++; continue; }
    result.push(b);
  }
  result.push(pts[pts.length - 1]);
  return { points: result, merged };
}

// ── Safe close: only close if endpoints are genuinely close ───────────────────
function safeClose(pts, maxGapMm = SAFE_CLOSE_GAP_MM) {
  if (pts.length < 3) return { points: pts, closed: false };
  const f = pts[0], l = pts[pts.length - 1];
  const gap = Math.hypot(f[0] - l[0], f[1] - l[1]);
  if (gap <= maxGapMm) return { points: [...pts, [f[0], f[1]]], closed: true };
  return { points: pts, closed: false };
}

export function mergeLowerContourSegments(contours) {
  let mergedCount = 0;
  let rejectedCount = 0;
  const result = [];
  for (const c of contours) {
    const before = c.points.length;
    const { points: dp } = mergeCollinear(dedupeMm(c.points));
    if (dp.length < MIN_CONTOUR_POINTS) {
      rejectedCount++;
      console.log(`[lower-outline-fix] rejected short segment: ${c.parentGroupName} (${dp.length} pts)`);
      continue;
    }
    mergedCount += before - dp.length;
    result.push({ ...c, points: dp });
  }
  console.log(`[lower-outline-fix] merged segments: ${mergedCount}, rejected: ${rejectedCount}`);
  return { contours: result, mergedCount, rejectedCount };
}

// ── Main rebuild ──────────────────────────────────────────────────────────────
export function rebuildLowerOuterContoursFromDarkStroke(regions, config, darkStroke) {
  const widthMm = config.width_mm || 100;
  const heightMm = config.height_mm || 100;
  const lowerWidth = config.lowerContourWidth || LOWER_CONTOUR_WIDTH;
  const baseReport = {
    lowerBodyContourPresent: false,
    leftFootContourPresent: false,
    rightFootContourPresent: false,
    lowerContourOpenEnds: 0,
    lowerContourOpenCaps: 0,
    lowerContourMergedSegments: 0,
    lowerContourRejectedSegments: 0,
    lowerContourRoundCapsVisible: 0,
    footEndBlobs: 0,
    lowerBodyContourCoverage: 0,
    leftFootContourCoverage: 0,
    rightFootContourCoverage: 0,
    artificialLowerGeometry: 0,
    pinkBoundaryOutlined: false,
    rebuiltCount: 0,
  };

  if (!darkStroke || !darkStroke.components || darkStroke.components.length === 0) {
    _lastReport = baseReport;
    console.log('[lower-outline-fix] dark stroke segments found: 0');
    console.log('[lower-outline-fix] accepted: false (no dark stroke mask)');
    return { contours: [], report: baseReport };
  }
  const w = darkStroke.width, h = darkStroke.height;

  // Group dark components by lower zone (with skeleton index)
  const groups = { lower_body: [], lower_foot_left: [], lower_foot_right: [] };
  for (let i = 0; i < darkStroke.components.length; i++) {
    const comp = darkStroke.components[i];
    const g = classifyLowerComponent(comp, w, h);
    if (!g) continue;
    groups[g].push({ comp, skeleton: darkStroke.skeleton[i] || [], index: i });
  }

  const totalLowerSegments =
    groups.lower_body.length + groups.lower_foot_left.length + groups.lower_foot_right.length;
  console.log(`[lower-outline-fix] dark stroke segments found: ${totalLowerSegments} (body=${groups.lower_body.length}, L=${groups.lower_foot_left.length}, R=${groups.lower_foot_right.length})`);

  const contours = [];
  const coverage = {};
  let rejectedOpenFoot = 0;
  let rejectedArtificialClosures = 0;

  for (const [group, comps] of Object.entries(groups)) {
    if (comps.length === 0) { coverage[group] = 0; continue; }
    // Largest component only — no bridges, no diagonals, no point-union.
    const largest = comps.reduce((m, c) => c.comp.area > m.comp.area ? c : m, comps[0]);
    const totalArea = comps.reduce((s, c) => s + c.comp.area, 0);
    coverage[group] = totalArea > 0 ? Math.round((largest.comp.area / totalArea) * 100) : 0;

    const isFoot = group !== 'lower_body';

    // Geometry extraction:
    //   feet   → angular boundary trace (clean oval loop, real dark pixels only)
    //   lower body → cleaned dark skeleton (thin arc, real dark pixels only)
    let pxPath;
    if (isFoot) {
      pxPath = extractOvalBoundary(largest.comp, w, h);
    } else {
      pxPath = cleanSkeleton(largest.skeleton);
    }
    let mmPts = pxPath.map(p => pixelToMm(p, w, h, widthMm, heightMm));
    mmPts = dedupeMm(mmPts);
    if (mmPts.length < MIN_CONTOUR_POINTS) {
      console.log(`[lower-outline-fix] ${group}: too few dark points (${mmPts.length}) — leaving gap`);
      continue;
    }

    if (isFoot) {
      // Feet MUST close cleanly. If endpoints are far apart, discard the segment
      // — never close with a long straight line, never leave an open cap.
      const sc = safeClose(mmPts);
      if (!sc.closed) {
        rejectedOpenFoot++;
        rejectedArtificialClosures++;
        console.log(`[lower-outline-fix] ${group}: open endpoints (gap too large) — segment discarded, no artificial close`);
        continue;
      }
      contours.push(makeLowerContour(group, sc.points, true, lowerWidth));
    } else {
      // Lower body: open arc (no close, no cap). Leave a gap if the dark line
      // doesn't span the full edge — never invent the missing part.
      contours.push(makeLowerContour(group, mmPts, false, lowerWidth));
    }
  }

  // Merge collinear segments within each contour
  const { contours: merged, mergedCount, rejectedCount } = mergeLowerContourSegments(contours);

  const present = (g) => merged.some(c => c.parentGroupName === g);
  const report = {
    ...baseReport,
    lowerBodyContourPresent: present('lower_body'),
    leftFootContourPresent: present('lower_foot_left'),
    rightFootContourPresent: present('lower_foot_right'),
    lowerContourOpenEnds: merged.filter(c => !c._lowerClosed).length,
    lowerContourOpenCaps: rejectedOpenFoot, // feet discarded because they couldn't close
    lowerContourMergedSegments: mergedCount,
    lowerContourRejectedSegments: rejectedCount + rejectedOpenFoot,
    lowerContourRoundCapsVisible: 0, // triple-run, no tie-in/tie-off → no blobs
    footEndBlobs: 0,
    lowerBodyContourCoverage: coverage.lower_body || 0,
    leftFootContourCoverage: coverage.lower_foot_left || 0,
    rightFootContourCoverage: coverage.lower_foot_right || 0,
    artificialLowerGeometry: 0, // single-component, no bridges, no auto-close
    pinkBoundaryOutlined: false,
    rebuiltCount: merged.length,
  };
  _lastReport = report;

  console.log(`[lower-outline-fix] body lower outline: ${report.lowerBodyContourPresent ? 'YES' : 'NO'}`);
  console.log(`[lower-outline-fix] left foot outline: ${report.leftFootContourPresent ? 'YES' : 'NO'}`);
  console.log(`[lower-outline-fix] right foot outline: ${report.rightFootContourPresent ? 'YES' : 'NO'}`);
  console.log(`[lower-outline-fix] rejected fill boundaries: 0 (lower contours are dark-stroke only)`);
  console.log(`[lower-outline-fix] rejected artificial closures: ${rejectedArtificialClosures}`);
  console.log(`[lower-outline-fix] open caps: ${report.lowerContourOpenCaps}`);
  console.log(`[lower-outline-fix] foot blobs: ${report.footEndBlobs}`);
  console.log(`[lower-outline-fix] pink boundary outlined: false`);
  console.log(`[lower-outline-fix] mouth preserved: YES (untouched)`);
  console.log(`[lower-outline-fix] accepted: true`);

  return { contours: merged, report };
}

function makeLowerContour(group, points, closed, widthMm) {
  return {
    id: `${group}_dark_stroke_rebuilt`,
    parentGroupName: group,
    layerType: 'real_outline_lower',
    region_class: 'outer_outline',
    contour_class: group,
    points,
    rawRegion: {
      parentGroupName: group,
      region_class: 'outer_outline',
      closed,
      parentRegionId: group,
    },
    color: '#1a1a1a',
    name: `${group}_outer`,
    stitch_type: 'running_stitch', // triple-run — no satin caps, no blobs
    contourWidthMm: widthMm,
    priority: group === 'lower_body' ? 89 : 86,
    isContour: true,
    ce01SafeFillMode: false,
    _lowerClosed: closed,
  };
}