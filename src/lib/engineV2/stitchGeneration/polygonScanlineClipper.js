import { distanceBetweenPoints, finitePhysicalPoint } from './stitchGeometry.js';

function normalizeDirection(direction) {
  const length = Math.hypot(direction?.x ?? 0, direction?.y ?? 0);
  return length > 0 ? { x: direction.x / length, y: direction.y / length } : null;
}

function local(point, origin, direction) {
  const dx = point.x - origin.x; const dy = point.y - origin.y;
  return { u: dx * direction.x + dy * direction.y, v: -dx * direction.y + dy * direction.x };
}

function world(u, origin, direction) { return { x: origin.x + u * direction.x, y: origin.y + u * direction.y }; }

function polygonIntervals(polygon, origin, direction, tolerance) {
  const localPoints = polygon.map(point => local(point, origin, direction)); const intersections = [];
  localPoints.forEach((a, index) => {
    const b = localPoints[(index + 1) % localPoints.length];
    if ((a.v <= tolerance && b.v > tolerance) || (b.v <= tolerance && a.v > tolerance)) {
      const ratio = -a.v / (b.v - a.v); intersections.push(a.u + (b.u - a.u) * ratio);
    }
  });
  intersections.sort((a, b) => a - b);
  const unique = intersections.filter((value, index) => !index || Math.abs(value - intersections[index - 1]) > tolerance);
  const intervals = [];
  for (let index = 0; index + 1 < unique.length; index += 2) if (unique[index + 1] - unique[index] > tolerance) intervals.push({ startU: unique[index], endU: unique[index + 1] });
  return intervals;
}

function subtractHole(segments, hole, holeIndex, tolerance) {
  const result = [];
  segments.forEach(segment => {
    if (hole.endU <= segment.startU + tolerance || hole.startU >= segment.endU - tolerance) { result.push(segment); return; }
    if (hole.startU > segment.startU + tolerance) result.push({ ...segment, endU: hole.startU, endBoundaryType: 'hole', endHoleIndex: holeIndex });
    if (hole.endU < segment.endU - tolerance) result.push({ ...segment, startU: hole.endU, startBoundaryType: 'hole', startHoleIndex: holeIndex });
  });
  return result;
}

export function clipScanlineToRegion({ outerPolygon = [], holes = [], lineOrigin, lineDirection, tolerance = 1e-6 }) {
  const errors = []; const direction = normalizeDirection(lineDirection);
  if (!direction || !finitePhysicalPoint(lineOrigin) || outerPolygon.length < 3 || outerPolygon.some(point => !finitePhysicalPoint(point)) || holes.some(hole => hole.length < 3 || hole.some(point => !finitePhysicalPoint(point)))) return { valid: false, intervals: [], errors: [{ code: 'INVALID_SCANLINE_CLIP_GEOMETRY' }], warnings: [] };
  let segments = polygonIntervals(outerPolygon, lineOrigin, direction, tolerance).map(interval => ({ ...interval, startBoundaryType: 'outer', endBoundaryType: 'outer', startHoleIndex: null, endHoleIndex: null }));
  holes.forEach((hole, holeIndex) => polygonIntervals(hole, lineOrigin, direction, tolerance).forEach(interval => { segments = subtractHole(segments, interval, holeIndex, tolerance); }));
  const intervals = segments.filter(segment => segment.endU - segment.startU > tolerance).sort((a, b) => a.startU - b.startU).map(segment => {
    const start = world(segment.startU, lineOrigin, direction); const end = world(segment.endU, lineOrigin, direction);
    return Object.freeze({ start, end, startBoundaryType: segment.startBoundaryType, endBoundaryType: segment.endBoundaryType, startHoleIndex: segment.startHoleIndex, endHoleIndex: segment.endHoleIndex, lengthMm: distanceBetweenPoints(start, end) });
  });
  return { valid: errors.length === 0, intervals, errors, warnings: [] };
}

export function generateParallelScanlineOrigins({ bounds, angleDegrees, spacingMm, maximumScanlines }) {
  const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }; const radians = angleDegrees * Math.PI / 180;
  const direction = { x: Math.cos(radians), y: Math.sin(radians) }; const normal = { x: -direction.y, y: direction.x };
  const corners = [{ x: bounds.minX, y: bounds.minY }, { x: bounds.maxX, y: bounds.minY }, { x: bounds.maxX, y: bounds.maxY }, { x: bounds.minX, y: bounds.maxY }];
  const offsets = corners.map(point => (point.x - center.x) * normal.x + (point.y - center.y) * normal.y); const minimum = Math.min(...offsets); const maximum = Math.max(...offsets);
  const first = Math.ceil(minimum / spacingMm) * spacingMm; const count = Math.max(0, Math.floor((maximum - first) / spacingMm) + 1);
  if (count > maximumScanlines) return { valid: false, origins: [], direction, errors: [{ code: 'PHYSICAL_GENERATION_LIMIT_EXCEEDED', limit: maximumScanlines, requested: count }] };
  return { valid: true, origins: Array.from({ length: count }, (_, index) => ({ x: center.x + normal.x * (first + index * spacingMm), y: center.y + normal.y * (first + index * spacingMm) })), direction, errors: [] };
}
