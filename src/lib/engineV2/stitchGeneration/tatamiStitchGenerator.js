import { clipScanlineToRegion, generateParallelScanlineOrigins } from './polygonScanlineClipper.js';
import { calculatePathBounds, distanceBetweenPoints, resampleOpenPolyline } from './stitchGeometry.js';

function insetInterval(interval, inset) {
  const length = interval.lengthMm; if (length <= inset * 2) return null;
  const ux = (interval.end.x - interval.start.x) / length; const uy = (interval.end.y - interval.start.y) / length;
  return { ...interval, start: { x: interval.start.x + ux * inset, y: interval.start.y + uy * inset }, end: { x: interval.end.x - ux * inset, y: interval.end.y - uy * inset }, lengthMm: length - inset * 2 };
}

function compensate(point, direction, amount, outwardSign) {
  return { x: point.x + direction.x * amount * outwardSign, y: point.y + direction.y * amount * outwardSign, sourceType: 'compensation_adjusted_endpoint' };
}

export function generateTatamiRows({ object, technicalSpecification, config, technique = 'tatami', spacingOverride = null, angleOverride = null, targetOverride = null, phase = 'top' }) {
  const parameters = technicalSpecification.stitchParameters; const angle = angleOverride ?? technicalSpecification.fillAnglePlan?.normalizedAngleDegrees; const spacing = spacingOverride ?? parameters.spacingMm;
  const bounds = calculatePathBounds(object.geometry); const scanlines = generateParallelScanlineOrigins({ bounds, angleDegrees: angle, spacingMm: spacing, maximumScanlines: config.maximumScanlinesPerObject });
  if (!scanlines.valid) return { valid: false, subpaths: [], errors: scanlines.errors, warnings: [], coverageMetrics: {}, pointLimitExceeded: true };
  const subpaths = []; const warnings = []; const errors = []; let generatedIntervalCount = 0; let discardedShortIntervalCount = 0; let rowsSplitByHoles = 0; let compensationAdjustedPointCount = 0; let intervalLengthTotal = 0;
  scanlines.origins.forEach((origin, rowIndex) => {
    const clipped = clipScanlineToRegion({ outerPolygon: object.geometry, holes: object.holes, lineOrigin: origin, lineDirection: scanlines.direction, tolerance: config.comparisonToleranceMm });
    if (!clipped.valid) { errors.push(...clipped.errors); return; }
    if (clipped.intervals.length > 1 && (object.holes || []).length) rowsSplitByHoles += 1;
    clipped.intervals.forEach(interval => {
      const inset = phase === 'top' ? parameters.edgeInsetMm ?? 0 : 0; const safe = insetInterval(interval, inset);
      if (!safe || safe.lengthMm < (parameters.minimumStitchLengthMm ?? 0)) { discardedShortIntervalCount += 1; return; }
      let start = safe.start; let end = safe.end;
      const compensation = phase === 'top' && technicalSpecification.pullCompensationPlan?.enabled ? Math.min(technicalSpecification.pullCompensationPlan.amountMm, technicalSpecification.pullCompensationPlan.maximumAllowedMm, config.maximumCompensationEnvelopeMm) : 0;
      if (compensation && config.allowCompensationOutsideOuterBoundary) {
        if (interval.startBoundaryType === 'outer') { start = compensate(start, scanlines.direction, compensation, -1); compensationAdjustedPointCount += 1; }
        if (interval.endBoundaryType === 'outer') { end = compensate(end, scanlines.direction, compensation, 1); compensationAdjustedPointCount += 1; }
      }
      const reverse = rowIndex % 2 === 1; const raw = reverse ? [end, start] : [start, end];
      const staggerScale = phase === 'top' && rowIndex % 2 ? 1 + (parameters.staggerRatio ?? 0) * 0.1 : 1;
      const sampled = resampleOpenPolyline(raw, { targetStitchLengthMm: (targetOverride ?? parameters.targetStitchLengthMm) * staggerScale, minimumStitchLengthMm: parameters.minimumStitchLengthMm ?? Math.min(0.5, targetOverride ?? 1), maximumStitchLengthMm: parameters.maximumStitchLengthMm ?? Math.max(4, targetOverride ?? 2), tolerance: config.comparisonToleranceMm });
      warnings.push(...sampled.warnings); errors.push(...sampled.errors);
      if (sampled.valid) { subpaths.push({ phase, technique, points: sampled.points.map((point, index) => ({ ...point, sourceType: index === 0 ? (raw[0].sourceType ?? point.sourceType ?? 'scanline_intersection') : index === sampled.points.length - 1 ? (raw[1].sourceType ?? point.sourceType ?? 'scanline_intersection') : (point.sourceType ?? 'scanline_intersection') })), closed: false, continuous: true, sourceTechnicalComponent: { rowIndex, angleDegrees: angle, spacingMm: spacing } }); generatedIntervalCount += 1; intervalLengthTotal += safe.lengthMm; }
    });
  });
  const pointCount = subpaths.reduce((sum, item) => sum + item.points.length, 0);
  if (pointCount > config.maximumPointsPerObject) return { valid: false, subpaths: [], errors: [{ code: 'PHYSICAL_GENERATION_LIMIT_EXCEEDED', requested: pointCount, limit: config.maximumPointsPerObject }], warnings, coverageMetrics: {}, pointLimitExceeded: true };
  const area = technicalSpecification.geometryMetrics?.effectiveAreaMm2 ?? 0;
  return { valid: errors.length === 0, subpaths, errors, warnings, coverageMetrics: { scanlineCount: scanlines.origins.length, generatedRowCount: new Set(subpaths.map(item => item.sourceTechnicalComponent.rowIndex)).size, generatedIntervalCount, discardedShortIntervalCount, rowsSplitByHoles, holeCrossingSegmentCount: 0, outsideSourcePointCount: 0, compensationAdjustedPointCount, approximateCoverageRatio: area > 0 ? Math.min(1, intervalLengthTotal * spacing / area) : 0, approximateCoverageRatioIsExact: false } };
}

export function generateTatamiPhysicalPath({ object, technicalSpecification, selectedEntryExit, config }) {
  void selectedEntryExit;
  if (!Number.isFinite(technicalSpecification?.fillAnglePlan?.normalizedAngleDegrees)) return { valid: false, subpaths: [], errors: [{ code: 'TATAMI_DIRECTION_MISSING' }], warnings: [], coverageMetrics: {} };
  return generateTatamiRows({ object, technicalSpecification, config });
}
