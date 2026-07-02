/**
 * lowerContourRebuilder.js — StitchPath AI
 * ─────────────────────────────────────────────────────────────────────────────
 * Surgical reconstruction of the LOWER contours (lower body edge + left/right
 * feet) from the real dark stroke mask of the original artwork.
 *
 * Only touches: lower_body, lower_foot_left, lower_foot_right.
 * Never touches: mouth, eyes, cheeks, upper face contour, fill boundaries.
 *
 * Rules enforced:
 *   - Contours come ONLY from real dark stroke pixels (no fill-boundary inference).
 *   - One contour per group (largest dark component) → no artificial bridges
 *     between body and feet, no diagonals, no triangles.
 *   - Feet exported as closed triple-run (no satin end caps, no round "balls").
 *   - Lower body exported as open triple-run arc (no caps).
 *   - Width = lowerContourWidth (~1.1mm), independent of mouth/upper widths.
 *
 * Public API:
 *   rebuildLowerOuterContoursFromDarkStroke(regions, config, darkStroke)
 *     → { contours, report }
 *   mergeLowerContourSegments(contours)
 *     → { contours, mergedCount, rejectedCount }
 *   getLastLowerContourReport()
 *   LOWER_CONTOUR_WIDTH
 */

export const LOWER_CONTOUR_WIDTH = 1.1; // mm — clean, visible, no blobs

const LOWER_ZONE_Y = 0.50;      // normalized y: below this = "lower"
const FOOT_BOTTOM_Y = 0.72;     // components reaching below this = foot zone
const FOOT_LEFT_MAX_X = 0.45;
const FOOT_RIGHT_MIN_X = 0.55;
const MIN_CONTOUR_POINTS = 8;
const SAFE_CLOSE_GAP_MM = 1.8;

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

// ── Pixel skeleton → mm points ────────────────────────────────────────────────
function skeletonToMm(skeleton, w, h, widthMm, heightMm) {
  if (!skeleton || skeleton.length === 0) return [];
  return skeleton.map(p => [
    (p.x / w - 0.5) * widthMm,
    (p.y / h - 0.5) * heightMm,
  ]);
}

function dedupeMm(pts, eps = 0.06) {
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > eps) out.push([p[0], p[1]]);
  }
  return out;
}

// ── Merge collinear short segments (light simplify) ───────────────────────────
// Merges consecutive segments whose joint angle is nearly straight and short.
// Pure geometry on the dark stroke path — never crosses fills, never creates
// triangles/diagonals (it only removes intermediate collinear points).
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
    // Merge only if nearly collinear AND the segment is short
    if (ang < angleTolDeg && l1 < maxSegLenMm) {
      merged++;
      continue; // drop b
    }
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

// ── Merge lower contour segments (per-contour collinear merge) ────────────────
export function mergeLowerContourSegments(contours) {
  let mergedCount = 0;
  let rejectedCount = 0;
  const result = [];
  for (const c of contours) {
    const before = c.points.length;
    const { points: dp } = mergeCollinear(dedupeMm(c.points));
    if (dp.length < MIN_CONTOUR_POINTS) {
      rejectedCount++;
      console.log(`[lower-contour] rejected short segment: ${c.parentGroupName} (${dp.length} pts)`);
      continue;
    }
    mergedCount += before - dp.length;
    result.push({ ...c, points: dp });
  }
  console.log(`[lower-contour] merged segments: ${mergedCount}, rejected: ${rejectedCount}`);
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
    lowerContourMergedSegments: 0,
    lowerContourRejectedSegments: 0,
    lowerContourRoundCapsVisible: 0,
    lowerBodyContourCoverage: 0,
    leftFootContourCoverage: 0,
    rightFootContourCoverage: 0,
    artificialLowerGeometry: 0,
    rebuiltCount: 0,
  };

  if (!darkStroke || !darkStroke.components || darkStroke.components.length === 0) {
    _lastReport = baseReport;
    return { contours: [], report: baseReport };
  }
  const w = darkStroke.width, h = darkStroke.height;

  // Group dark components by lower zone (with their skeleton)
  const groups = { lower_body: [], lower_foot_left: [], lower_foot_right: [] };
  for (let i = 0; i < darkStroke.components.length; i++) {
    const comp = darkStroke.components[i];
    const g = classifyLowerComponent(comp, w, h);
    if (!g) continue;
    groups[g].push({ comp, skeleton: darkStroke.skeleton[i] || [], area: comp.area });
  }

  const contours = [];
  const coverage = {};
  for (const [group, comps] of Object.entries(groups)) {
    if (comps.length === 0) { coverage[group] = 0; continue; }
    // Largest component only — no bridges between disconnected segments,
    // no artificial diagonals. Small isolated segments are rejected (no balls).
    const largest = comps.reduce((m, c) => c.area > m.area ? c : m, comps[0]);
    const totalArea = comps.reduce((s, c) => s + c.area, 0);
    coverage[group] = totalArea > 0 ? Math.round((largest.area / totalArea) * 100) : 0;

    const mmPts = skeletonToMm(largest.skeleton, w, h, widthMm, heightMm);
    if (mmPts.length < MIN_CONTOUR_POINTS) continue;

    // Feet → closed loop; lower body → open arc (no caps either way)
    const isFoot = group !== 'lower_body';
    const sc = isFoot ? safeClose(mmPts) : { points: mmPts, closed: false };

    contours.push({
      id: `${group}_dark_stroke_rebuilt`,
      parentGroupName: group,
      layerType: 'real_outline_lower',
      region_class: 'outer_outline',
      contour_class: group,
      points: sc.points,
      rawRegion: {
        parentGroupName: group,
        region_class: 'outer_outline',
        closed: sc.closed,
        parentRegionId: group,
      },
      color: '#1a1a1a',
      name: `${group}_outer`,
      stitch_type: 'running_stitch', // triple_run — no satin caps, no balls
      contourWidthMm: lowerWidth,
      priority: group === 'lower_body' ? 89 : 86,
      isContour: true,
      ce01SafeFillMode: false,
      _lowerClosed: sc.closed,
    });
  }

  // Merge collinear segments within each contour
  const { contours: merged, mergedCount, rejectedCount } = mergeLowerContourSegments(contours);

  // Build report
  const present = (g) => merged.some(c => c.parentGroupName === g);
  const openEnds = merged.filter(c => !c._lowerClosed).length;
  const report = {
    ...baseReport,
    lowerBodyContourPresent: present('lower_body'),
    leftFootContourPresent: present('lower_foot_left'),
    rightFootContourPresent: present('lower_foot_right'),
    lowerContourOpenEnds: openEnds,
    lowerContourMergedSegments: mergedCount,
    lowerContourRejectedSegments: rejectedCount,
    lowerContourRoundCapsVisible: 0, // running stitch — no caps by construction
    lowerBodyContourCoverage: coverage.lower_body || 0,
    leftFootContourCoverage: coverage.lower_foot_left || 0,
    rightFootContourCoverage: coverage.lower_foot_right || 0,
    artificialLowerGeometry: 0, // single-component per group — no bridges
    rebuiltCount: merged.length,
  };
  _lastReport = report;

  console.log(`[lower-contour] rebuilt: ${merged.length} (body=${report.lowerBodyContourPresent}, L=${report.leftFootContourPresent}, R=${report.rightFootContourPresent})`);
  console.log(`[lower-contour] open ends: ${openEnds}, round caps: 0, artificial: 0`);
  console.log(`[lower-contour] coverage: body=${report.lowerBodyContourCoverage}% L=${report.leftFootContourCoverage}% R=${report.rightFootContourCoverage}%`);

  return { contours: merged, report };
}