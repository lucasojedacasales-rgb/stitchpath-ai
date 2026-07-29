/**
 * principalAxis.js — principal axis of a polygon from its area moments
 * (covariance of the filled region), NOT from region.angle / fill_angle /
 * plan.optimalAngle. Area integrals make the result invariant to the start
 * point, array rotation, winding direction and point reversal.
 */

export function computePrincipalAxis(pointsMm) {
  const n = pointsMm.length;
  if (n < 3) return { ok: false, reasons: ['need at least 3 points for an axis'] };

  // Signed area + area-weighted first/second moments (standard polygon integrals).
  let A = 0, cx = 0, cy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const [xi, yi] = pointsMm[i];
    const [xj, yj] = pointsMm[(i + 1) % n];
    const cr = xi * yj - xj * yi;
    A += cr;
    cx += (xi + xj) * cr;
    cy += (yi + yj) * cr;
    sxx += (xi * xi + xi * xj + xj * xj) * cr;
    syy += (yi * yi + yi * yj + yj * yj) * cr;
    sxy += (xi * yj + 2 * xi * yi + 2 * xj * yj + xj * yi) * cr;
  }
  A /= 2;
  if (Math.abs(A) < 1e-12) return { ok: false, reasons: ['degenerate polygon: zero area'] };
  cx /= 6 * A;
  cy /= 6 * A;
  sxx /= 12 * A;
  syy /= 12 * A;
  sxy /= 24 * A;

  // Central covariance of the filled region. Dividing every moment by the
  // SIGNED area cancels the winding direction.
  const covXX = sxx - cx * cx;
  const covYY = syy - cy * cy;
  const covXY = sxy - cx * cy;

  // Eigen decomposition of the symmetric 2x2 covariance matrix.
  const trace = covXX + covYY;
  const diff = covXX - covYY;
  const disc = Math.sqrt(diff * diff / 4 + covXY * covXY);
  const lambdaMax = trace / 2 + disc;
  const lambdaMin = trace / 2 - disc;

  // Major eigenvector.
  let ax, ay;
  if (Math.abs(covXY) > 1e-15) {
    ax = lambdaMax - covYY;
    ay = covXY;
  } else if (covXX >= covYY) {
    ax = 1; ay = 0;
  } else {
    ax = 0; ay = 1;
  }
  const len = Math.hypot(ax, ay);
  ax /= len; ay /= len;
  // Canonical direction: first non-zero component positive → orientation invariant.
  if (ax < 0 || (ax === 0 && ay < 0)) { ax = -ax; ay = -ay; }
  const major = [ax, ay];
  const minor = [-ay, ax]; // +90° rotation, deterministic left/right convention

  // Extents by projecting the vertices onto the axes.
  let sMin = Infinity, sMax = -Infinity, tMin = Infinity, tMax = -Infinity;
  for (const [x, y] of pointsMm) {
    const dx = x - cx, dy = y - cy;
    const s = dx * major[0] + dy * major[1];
    const t = dx * minor[0] + dy * minor[1];
    if (s < sMin) sMin = s;
    if (s > sMax) sMax = s;
    if (t < tMin) tMin = t;
    if (t > tMax) tMax = t;
  }

  let axisAngleDeg = Math.atan2(major[1], major[0]) * 180 / Math.PI;
  if (axisAngleDeg < 0) axisAngleDeg += 180;
  if (axisAngleDeg >= 180) axisAngleDeg -= 180;
  // Fold the floating-point 179.999…° case onto 0° so equivalent horizontal
  // axes always report the same canonical angle.
  if (180 - axisAngleDeg < 1e-9) axisAngleDeg = 0;

  const majorLengthMm = sMax - sMin;
  const minorWidthMm = tMax - tMin;

  return {
    ok: true,
    centroidMm: [cx, cy],
    majorAxis: major,
    minorAxis: minor,
    majorLengthMm,
    minorWidthMm,
    projection: { sMin, sMax, tMin, tMax },
    axisAngleDeg,
    axisConfidence: lambdaMax > 0 ? 1 - lambdaMin / lambdaMax : 0,
    aspectRatio: minorWidthMm > 0 ? majorLengthMm / minorWidthMm : Infinity,
    eigenvalues: { lambdaMax, lambdaMin },
    convention: 'majorAxis canonicalised to first non-zero component positive; minorAxis = majorAxis rotated +90°; angle in degrees within [0,180)',
  };
}