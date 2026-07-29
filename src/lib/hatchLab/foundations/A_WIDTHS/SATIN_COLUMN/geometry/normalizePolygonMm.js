/**
 * normalizePolygonMm.js — explicit normalized_0_1 → millimetre conversion.
 *
 * The coordinate space is taken from the fixture's explicit declaration,
 * never deduced from the numeric range of the points.
 * xMm = xNormalized × widthMm ; yMm = yNormalized × heightMm.
 * Original points are preserved untouched and at full precision.
 */

export function normalizePolygonMm(pathPoints, design) {
  const notes = [];
  if (!design || design.coordinateSpace !== 'normalized_0_1') {
    return { ok: false, reasons: ['coordinateSpace must be explicitly declared as normalized_0_1'] };
  }
  const { widthMm, heightMm } = design;
  if (!(Number.isFinite(widthMm) && widthMm > 0 && Number.isFinite(heightMm) && heightMm > 0)) {
    return { ok: false, reasons: ['design widthMm/heightMm must be finite positive numbers'] };
  }
  if (!Array.isArray(pathPoints) || pathPoints.length === 0) {
    return { ok: false, reasons: ['path_points is empty or not an array'] };
  }
  for (const p of pathPoints) {
    if (!Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
      return { ok: false, reasons: ['every point must be an array of two finite numbers'] };
    }
  }

  // Copy without mutating the input; drop exact consecutive duplicates and an
  // exact closing duplicate. Both removals are recorded, never silent.
  const original = pathPoints.map((p) => [p[0], p[1]]);
  const cleaned = [];
  let removedConsecutiveDuplicates = 0;
  for (const p of original) {
    const last = cleaned[cleaned.length - 1];
    if (last && last[0] === p[0] && last[1] === p[1]) { removedConsecutiveDuplicates += 1; continue; }
    cleaned.push(p);
  }
  let removedClosingDuplicate = false;
  if (cleaned.length >= 2) {
    const f = cleaned[0];
    const l = cleaned[cleaned.length - 1];
    if (f[0] === l[0] && f[1] === l[1]) { cleaned.pop(); removedClosingDuplicate = true; }
  }
  if (removedConsecutiveDuplicates > 0) notes.push(`removed ${removedConsecutiveDuplicates} exact consecutive duplicate point(s)`);
  if (removedClosingDuplicate) notes.push('removed exact closing duplicate point');

  const pointsMm = cleaned.map(([x, y]) => [x * widthMm, y * heightMm]);

  return {
    ok: true,
    originalPoints: original,
    pointsMm,
    transformation: {
      coordinateSpace: 'normalized_0_1',
      formula: 'xMm = xNormalized * widthMm ; yMm = yNormalized * heightMm',
      widthMm,
      heightMm,
      removedConsecutiveDuplicates,
      removedClosingDuplicate,
    },
    notes,
  };
}