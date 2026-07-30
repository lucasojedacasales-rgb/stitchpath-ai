/**
 * satinCoverage.js — StitchPath AI
 * ─────────────────────────────────────────────────────────────────────────────
 * Coverage control for satin columns.
 *
 * A satin column is built by walking a centerline and throwing the needle to
 * alternating sides at ±halfWidth. If the centerline is walked at a CONSTANT
 * pitch, the pitch measured on the OUTER edge of a curve grows by the factor
 * (1 + halfWidth · curvature). On tight turns and at the junctions between
 * column segments that factor easily reaches 2–4×, which is exactly where the
 * fabric shows through: the stitches fan out and leave empty wedges.
 *
 * This module resamples the centerline with a curvature-adaptive pitch so the
 * pitch on the outer edge never exceeds the configured density, and it closes
 * the loop with a real overlap instead of a single coincident point.
 *
 * Pure geometry: no mutation of the input array.
 */

// Dense pre-sampling pitch used only to estimate local curvature (mm).
const PROBE_STEP_MM = 0.12;
// Never sample the centerline finer than this (mm) — avoids needle pile-up.
const MIN_STEP_MM = 0.12;

function uniformWalk(points, stepMm) {
  const out = [[points[0][0], points[0][1]]];
  let carry = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const segLen = Math.hypot(bx - ax, by - ay);
    if (segLen < 1e-9) continue;
    const dx = (bx - ax) / segLen;
    const dy = (by - ay) / segLen;
    let d = stepMm - carry;
    while (d <= segLen + 1e-9) {
      out.push([ax + dx * d, ay + dy * d]);
      d += stepMm;
    }
    carry = segLen - (d - stepMm);
  }
  return out;
}

/**
 * Discrete curvature (1/mm) at each dense sample, from the circumscribed circle
 * of the neighbours one lookahead window away.
 */
function localCurvature(dense, closed, windowPts) {
  const n = dense.length;
  const k = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const iPrev = closed ? (i - windowPts + n) % n : Math.max(0, i - windowPts);
    const iNext = closed ? (i + windowPts) % n : Math.min(n - 1, i + windowPts);
    const a = dense[iPrev], b = dense[i], c = dense[iNext];
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
    if (ab < 1e-9 || bc < 1e-9 || ca < 1e-9) continue;
    const cross = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    k[i] = (2 * cross) / (ab * bc * ca); // 1 / circumradius
  }
  return k;
}

/**
 * Resample a centerline so that the satin pitch measured on the OUTER edge of
 * every curve stays at or below densityMm.
 *
 * @param {Array<[number,number]>} points centerline in mm
 * @param {number} densityMm target pitch on the outer edge
 * @param {number} halfWidthMm half of the satin column width (incl. compensation)
 * @param {boolean} closed
 * @returns {Array<[number,number]>} resampled centerline
 */
export function resampleForSatinCoverage(points, densityMm, halfWidthMm, closed) {
  if (!points || points.length < 2) return [];
  const src = closed ? [...points, points[0]] : [...points];
  const density = Math.max(MIN_STEP_MM, Number(densityMm) || 0.4);
  const halfW = Math.max(0, Number(halfWidthMm) || 0);

  const dense = uniformWalk(src, Math.min(PROBE_STEP_MM, density / 2));
  if (dense.length < 4) return src.map(p => [p[0], p[1]]);

  const windowPts = Math.max(2, Math.round(0.6 / Math.min(PROBE_STEP_MM, density / 2)));
  const curvature = localCurvature(dense, closed, windowPts);

  const out = [[dense[0][0], dense[0][1]]];
  let travelled = 0;
  let target = stepAt(0);

  function stepAt(i) {
    // Outer-edge pitch = step · (1 + halfW·k)  ⇒  step = density / (1 + halfW·k)
    const fan = 1 + halfW * curvature[i];
    return Math.max(MIN_STEP_MM, density / fan);
  }

  for (let i = 1; i < dense.length; i++) {
    travelled += Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]);
    if (travelled >= target - 1e-9) {
      out.push([dense[i][0], dense[i][1]]);
      travelled = 0;
      target = stepAt(i);
    }
  }

  const last = dense[dense.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > MIN_STEP_MM) {
    out.push([last[0], last[1]]);
  }
  return out;
}

/**
 * Build the alternating zigzag of a satin column, adding CORNER FANS.
 *
 * On a sharp corner no centerline pitch can close the gap: the outer edge has to
 * travel an arc of |turn|·halfWidth while the inner edge barely moves. When that
 * arc is wider than the density the column opens a wedge. Here the corner keeps
 * its inner penetration and the outer penetration is repeated along the arc
 * (rotating the normal), which is how a mitred/fanned satin corner is sewn.
 *
 * @param {Array<[number,number]>} walked resampled centerline (mm)
 * @param {number} halfWidthMm half column width incl. compensation
 * @param {number} densityMm target pitch between penetrations on one edge
 * @param {boolean} closed
 * @returns {Array<[number,number]>} zigzag penetrations
 */
export function buildSatinZigzagWithCorners(walked, halfWidthMm, densityMm, closed) {
  const n = walked.length;
  if (n < 4) return [];
  const halfW = Math.max(0.05, Number(halfWidthMm) || 0.5);
  const density = Math.max(MIN_STEP_MM, Number(densityMm) || 0.4);
  const stitches = [];
  let side = 1;

  const push = (p, angle) => {
    stitches.push([p[0] + Math.cos(angle) * halfW * side, p[1] + Math.sin(angle) * halfW * side]);
    side = -side;
  };

  for (let i = 0; i < n; i++) {
    const p = walked[i];
    const prev = walked[(i - 1 + n) % n];
    const next = walked[(i + 1) % n];
    if (!closed && (i === 0 || i === n - 1)) {
      const ref = i === 0 ? next : prev;
      const ang = Math.atan2(ref[1] - p[1], ref[0] - p[0]) + Math.PI / 2;
      push(p, ang);
      continue;
    }

    const angIn = Math.atan2(p[1] - prev[1], p[0] - prev[0]) + Math.PI / 2;
    let turn = Math.atan2(next[1] - p[1], next[0] - p[0]) -
               Math.atan2(p[1] - prev[1], p[0] - prev[0]);
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn < -Math.PI) turn += 2 * Math.PI;

    // Arc the OUTER edge must cover across this corner.
    const outerArc = Math.abs(turn) * halfW;
    const fanCount = Math.min(24, Math.max(1, Math.ceil(outerArc / density)));
    for (let f = 0; f < fanCount; f++) {
      push(p, angIn + (turn * f) / fanCount);
    }
  }

  return stitches;
}

/**
 * Close a satin loop with a real overlap so the start/end junction is covered
 * instead of butt-joined (a single coincident point leaves a visible notch).
 *
 * @param {Array<[number,number]>} stitches generated zigzag
 * @param {number} overlapStitches how many leading stitches to repeat
 */
export function overlapSatinClosure(stitches, overlapStitches = 4) {
  if (!stitches || stitches.length < 4) return stitches || [];
  const n = Math.min(Math.max(2, overlapStitches), stitches.length - 1);
  const tail = [];
  for (let i = 0; i < n; i++) tail.push([stitches[i][0], stitches[i][1]]);
  return [...stitches, ...tail];
}