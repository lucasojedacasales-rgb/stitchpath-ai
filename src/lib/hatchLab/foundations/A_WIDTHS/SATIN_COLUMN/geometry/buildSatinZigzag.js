/**
 * buildSatinZigzag.js — transversal zigzag between the two opposing rails:
 * left[0] → right[0] → left[1] → right[1] → …
 * Candidate geometry only; never produces machine commands.
 */

export function buildSatinZigzag(rails, options) {
  const { spacingMm, maxStitchLengthMm } = options;
  const warnings = [];
  const pointsMm = [];
  const count = Math.min(rails.leftRail.length, rails.rightRail.length);

  for (let i = 0; i < count; i++) {
    pointsMm.push([rails.leftRail[i][0], rails.leftRail[i][1]]);
    pointsMm.push([rails.rightRail[i][0], rails.rightRail[i][1]]);
  }
  if (count === 0) warnings.push('no successful stations: zigzag is empty');
  if (rails.failedStations > 0) warnings.push(`${rails.failedStations} station(s) skipped (no valid intersection pair)`);

  // Stitch segments = consecutive point pairs. Even segments cross the column
  // (left→right at one station); odd segments advance diagonally (right→next left).
  const lengths = [];
  let crossingSegments = 0;
  for (let i = 0; i + 1 < pointsMm.length; i++) {
    const L = Math.hypot(pointsMm[i + 1][0] - pointsMm[i][0], pointsMm[i + 1][1] - pointsMm[i][1]);
    lengths.push(L);
    if (i % 2 === 0) crossingSegments += 1;
  }

  const stitchCount = lengths.length;
  const minimumStitchLengthMm = stitchCount ? Math.min(...lengths) : null;
  const maximumStitchLengthMm = stitchCount ? Math.max(...lengths) : null;
  const averageStitchLengthMm = stitchCount ? lengths.reduce((a, b) => a + b, 0) / stitchCount : null;
  const splitRequired = stitchCount > 0 && maximumStitchLengthMm > maxStitchLengthMm;
  if (splitRequired) warnings.push(`a stitch exceeds ${maxStitchLengthMm} mm; split would be required (not implemented here)`);

  return {
    candidateOnly: true,
    integrated: false,
    technique: 'satin_candidate',
    geometryType: 'paired_boundary_zigzag',
    spacingMm,
    pointsMm,
    rails: [rails.leftRail, rails.rightRail],
    metrics: {
      stitchCount,
      crossingSegments,
      minimumStitchLengthMm,
      averageStitchLengthMm,
      maximumStitchLengthMm,
      maxStitchLengthLimitMm: maxStitchLengthMm,
      splitRequired,
    },
    warnings,
  };
}