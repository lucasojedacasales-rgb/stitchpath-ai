/**
 * evaluateStraightColumnEligibility.js — criterion-based eligibility of a
 * measured candidate. Every threshold comes from foundationSchema (or the
 * caller's options) and is echoed in the result. No threshold is derived from
 * the five Hatch reference values.
 *
 * eligibility values:
 *  - eligible:  every criterion satisfied
 *  - partial:   geometry produced but at least one threshold criterion not met
 *  - ineligible: structural criterion violated (polygon/axis incompatible)
 *  - unavailable: not computable (handled upstream)
 */

export function evaluateStraightColumnEligibility({ validation, axis, rails, zigzag }, options) {
  const checks = [];
  const add = (name, kind, satisfied, detail, threshold) => {
    checks.push({ name, kind, satisfied, detail, threshold: threshold ?? null });
  };

  // Structural criteria → ineligible when violated.
  add('polygonValid', 'structural', validation.valid, validation.valid ? 'simple, hole-free, positive-area polygon' : validation.reasons.join('; '));
  add('axisStable', 'structural', axis.ok && axis.axisConfidence >= options.minAxisConfidence,
    `axisConfidence ${axis.axisConfidence?.toFixed(4)}`, options.minAxisConfidence);
  add('twoIntersectionsEverywhereUsed', 'structural', rails.successfulStations > 0,
    `${rails.successfulStations}/${rails.stationCount} stations with exactly two intersections`);

  // Threshold criteria → partial when violated.
  add('aspectRatio', 'threshold', axis.aspectRatio >= options.minAspectRatio,
    `aspectRatio ${Number.isFinite(axis.aspectRatio) ? axis.aspectRatio.toFixed(3) : 'inf'}`, options.minAspectRatio);
  add('minimumWidth', 'threshold', rails.meanWidthMm != null && rails.meanWidthMm >= options.minWidthMm,
    `meanWidthMm ${rails.meanWidthMm != null ? rails.meanWidthMm.toFixed(4) : 'n/a'}`, options.minWidthMm);
  add('widthVariation', 'threshold', rails.widthVariationRatio != null && rails.widthVariationRatio <= options.maxWidthVariationRatio,
    `widthVariationRatio ${rails.widthVariationRatio != null ? rails.widthVariationRatio.toFixed(4) : 'n/a'}`, options.maxWidthVariationRatio);
  add('stationSuccessRatio', 'threshold', rails.stationSuccessRatio >= options.minStationSuccessRatio,
    `stationSuccessRatio ${rails.stationSuccessRatio.toFixed(4)}`, options.minStationSuccessRatio);
  add('zigzagNonEmpty', 'structural', zigzag.pointsMm.length >= 4, `${zigzag.pointsMm.length} zigzag points`);

  const structuralViolated = checks.some((c) => c.kind === 'structural' && !c.satisfied);
  const thresholdViolated = checks.some((c) => c.kind === 'threshold' && !c.satisfied);

  let eligibility;
  if (structuralViolated) eligibility = 'ineligible';
  else if (thresholdViolated) eligibility = 'partial';
  else eligibility = 'eligible';

  return {
    eligibility,
    reasons: checks.filter((c) => !c.satisfied).map((c) => `${c.name}: ${c.detail} (threshold ${c.threshold})`),
    checks,
  };
}