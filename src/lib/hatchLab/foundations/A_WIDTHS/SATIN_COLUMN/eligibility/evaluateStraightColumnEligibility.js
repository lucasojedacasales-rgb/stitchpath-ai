/**
 * evaluateStraightColumnEligibility.js — criterion-based eligibility of a
 * measured candidate. Every threshold comes from foundationSchema (or the
 * caller's options) and is echoed in the result. No threshold is derived from
 * the five Hatch reference values.
 *
 * eligibility values:
 *  - eligible:   every criterion satisfied
 *  - partial:    geometry produced but at least one policy/threshold criterion not met
 *  - ineligible: structural criterion violated (polygon / interior rings / axis / pairing / containment)
 *  - unavailable: not computable (handled upstream)
 *
 * P1.F0.1 strictness: with requireAllStationsPaired the pairing criterion is
 * structural and demands failedStations === 0 and stationSuccessRatio === 1.
 */

export function evaluateStraightColumnEligibility({ validation, axis, rails, zigzag, straightness, containment, topology }, options) {
  const checks = [];
  const add = (name, kind, satisfied, detail, threshold) => {
    checks.push({ name, kind, satisfied: !!satisfied, detail, threshold: threshold ?? null });
  };

  // Structural criteria → ineligible when violated.
  add('polygonValid', 'structural', validation.valid, validation.valid ? 'simple, hole-free, positive-area polygon' : validation.reasons.join('; '));
  add('polygonSimple', 'structural', validation.polygonSimple !== false,
    validation.simplicity ? `${validation.simplicity.defects.length} simplicity defect(s)` : 'not analyzed');
  // P1.F0.2: geometryEligibility depends only on represented geometry. A scalar
  // metadata declaration never appears here; only real interior rings do.
  add('noInteriorRingGeometry', 'structural', !(topology && topology.holeGeometryAvailable),
    topology
      ? `${topology.interiorRingCount} interior ring(s) represented in the geometry`
      : 'topology not audited');
  add('axisStable', 'structural', axis.ok && axis.axisConfidence >= options.minAxisConfidence,
    `axisConfidence ${axis.axisConfidence?.toFixed(4)}`, options.minAxisConfidence);

  const pairingRequired = options.requireAllStationsPaired !== false;
  const everyStationExactlyTwo = rails.stations.every((st) => st.intersectionCount === 2);
  add('twoIntersectionsEverywhereUsed', 'structural',
    pairingRequired
      ? (rails.stationCount > 0 && rails.failedStations === 0 && rails.stationSuccessRatio === 1 && everyStationExactlyTwo)
      : rails.successfulStations > 0,
    `${rails.successfulStations}/${rails.stationCount} stations with exactly two intersections`
      + `; failedStations ${rails.failedStations}; failedStationIndices [${rails.failedStationIndices.join(', ')}]`
      + `; stationGapCount ${rails.stationGapCount}; maximumStationGapMm ${rails.maximumStationGapMm}`,
    pairingRequired ? 'failedStations === 0 && stationSuccessRatio === 1' : 'successfulStations > 0');

  add('zigzagNonEmpty', 'structural', zigzag.pointsMm.length >= 4, `${zigzag.pointsMm.length} zigzag points`);
  add('zigzagContained', 'structural', containment && containment.containmentStatus === 'contained',
    containment
      ? `${containment.containmentStatus}: ${containment.outsideSampleCount}/${containment.samplesChecked} samples outside over ${containment.segmentsChecked} segments`
      : 'containment not computed',
    'outsideSampleCount === 0');

  // Threshold / policy criteria → partial when violated.
  add('aspectRatio', 'threshold', axis.aspectRatio >= options.minAspectRatio,
    `aspectRatio ${Number.isFinite(axis.aspectRatio) ? axis.aspectRatio.toFixed(3) : 'inf'}`, options.minAspectRatio);
  add('minimumWidth', 'threshold', rails.meanWidthMm != null && rails.meanWidthMm >= options.minWidthMm,
    `meanWidthMm ${rails.meanWidthMm != null ? rails.meanWidthMm.toFixed(4) : 'n/a'}`, options.minWidthMm);
  add('widthVariation', 'threshold', rails.widthVariationRatio != null && rails.widthVariationRatio <= options.maxWidthVariationRatio,
    `widthVariationRatio ${rails.widthVariationRatio != null ? rails.widthVariationRatio.toFixed(4) : 'n/a'}`, options.maxWidthVariationRatio);
  add('centerlineStraight', 'threshold', straightness && straightness.withinStraightnessPolicy,
    straightness
      ? (straightness.reasons.length ? straightness.reasons.join('; ')
        : `devMax ${straightness.centerlineMaximumDeviationMm?.toFixed(6)} mm, ratio ${straightness.centerlineDeviationRatio?.toFixed(6)}, axisDelta ${straightness.principalAxisVsCenterlineAngleDeltaDeg?.toFixed(6)}°`)
      : 'straightness not computed',
    `${options.maximumCenterlineDeviationMm} mm / ${options.maximumCenterlineDeviationRatio} / ${options.maximumCenterlineAngleDeltaDeg}°`);

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