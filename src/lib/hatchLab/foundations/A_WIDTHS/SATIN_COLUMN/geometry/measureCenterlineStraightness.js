/**
 * measureCenterlineStraightness.js — how straight is the station centerline?
 *
 * Documented method: a total-least-squares (orthogonal regression) line is
 * fitted through the centroid of the successful stations' centerPoints, and the
 * perpendicular deviation of every centerPoint from that line is measured.
 * The fitted direction is also compared against the polygon's principal axis.
 * Pure: mutates nothing.
 */

const angleBetweenDeg = (u, v) => {
  const dot = Math.abs(u[0] * v[0] + u[1] * v[1]);
  const mag = Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]);
  if (!(mag > 0)) return null;
  return (Math.acos(Math.min(1, dot / mag)) * 180) / Math.PI;
};

export function measureCenterlineStraightness(centerPoints, axis, options = {}) {
  const pts = (centerPoints || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  const base = {
    method: 'total_least_squares_through_centroid',
    centerlinePointCount: pts.length,
    centerlineMaximumDeviationMm: null,
    centerlineRmsDeviationMm: null,
    centerlineDeviationRatio: null,
    centerlineStartToEndAngleDeg: null,
    principalAxisVsCenterlineAngleDeltaDeg: null,
    centerlineLengthMm: null,
    fittedDirection: null,
    withinStraightnessPolicy: false,
    thresholds: {
      maximumCenterlineDeviationMm: options.maximumCenterlineDeviationMm ?? null,
      maximumCenterlineDeviationRatio: options.maximumCenterlineDeviationRatio ?? null,
      maximumCenterlineAngleDeltaDeg: options.maximumCenterlineAngleDeltaDeg ?? null,
    },
    reasons: [],
  };
  if (pts.length < 3) {
    base.reasons.push(`centerline needs at least 3 station centers, got ${pts.length}`);
    return base;
  }

  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) {
    const dx = p[0] - mx, dy = p[1] - my;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  // Principal direction of the covariance matrix = TLS fit direction.
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const dir = [Math.cos(theta), Math.sin(theta)];
  const nrm = [-dir[1], dir[0]];

  let maxDev = 0, sumSq = 0, tMin = Infinity, tMax = -Infinity;
  for (const p of pts) {
    const dx = p[0] - mx, dy = p[1] - my;
    const dev = Math.abs(dx * nrm[0] + dy * nrm[1]);
    if (dev > maxDev) maxDev = dev;
    sumSq += dev * dev;
    const t = dx * dir[0] + dy * dir[1];
    if (t < tMin) tMin = t;
    if (t > tMax) tMax = t;
  }
  const lengthMm = tMax - tMin;
  const first = pts[0], last = pts[n - 1];
  const chord = [last[0] - first[0], last[1] - first[1]];

  base.centerlineMaximumDeviationMm = maxDev;
  base.centerlineRmsDeviationMm = Math.sqrt(sumSq / n);
  base.centerlineDeviationRatio = lengthMm > 0 ? maxDev / lengthMm : null;
  base.centerlineLengthMm = lengthMm;
  base.centerlineStartToEndAngleDeg = (Math.atan2(chord[1], chord[0]) * 180) / Math.PI;
  base.fittedDirection = dir;
  base.principalAxisVsCenterlineAngleDeltaDeg = axis && Array.isArray(axis.majorAxis) ? angleBetweenDeg(dir, axis.majorAxis) : null;

  const limDev = options.maximumCenterlineDeviationMm;
  const limRatio = options.maximumCenterlineDeviationRatio;
  const limAngle = options.maximumCenterlineAngleDeltaDeg;
  if (Number.isFinite(limDev) && base.centerlineMaximumDeviationMm > limDev) {
    base.reasons.push(`centerlineMaximumDeviationMm ${base.centerlineMaximumDeviationMm.toFixed(4)} exceeds ${limDev}`);
  }
  if (Number.isFinite(limRatio) && base.centerlineDeviationRatio != null && base.centerlineDeviationRatio > limRatio) {
    base.reasons.push(`centerlineDeviationRatio ${base.centerlineDeviationRatio.toFixed(5)} exceeds ${limRatio}`);
  }
  if (Number.isFinite(limAngle) && base.principalAxisVsCenterlineAngleDeltaDeg != null && base.principalAxisVsCenterlineAngleDeltaDeg > limAngle) {
    base.reasons.push(`principalAxisVsCenterlineAngleDeltaDeg ${base.principalAxisVsCenterlineAngleDeltaDeg.toFixed(4)} exceeds ${limAngle}`);
  }
  base.withinStraightnessPolicy = base.reasons.length === 0;
  return base;
}