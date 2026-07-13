import {
  DEFAULT_GEOMETRY_TOLERANCES,
  _geometryInternals,
  polygonArea,
  polygonBounds,
  polygonContainsPolygon,
  polygonsOverlap,
  polygonsTouch,
} from '../ingestion/geometryCanonicalization.js';

export const REGION_RELATIONS = Object.freeze(['disjoint', 'touches', 'overlaps', 'contains', 'inside', 'equal_geometry']);

function boundsNear(a, b, tolerance) {
  if (!a || !b) return false;
  return Math.abs(a.minX - b.minX) <= tolerance
    && Math.abs(a.minY - b.minY) <= tolerance
    && Math.abs(a.maxX - b.maxX) <= tolerance
    && Math.abs(a.maxY - b.maxY) <= tolerance;
}

function sameCyclicPoints(a, b, tolerance) {
  if (a.length !== b.length) return false;
  for (let offset = 0; offset < b.length; offset += 1) {
    if (!_geometryInternals.pointsNear(a[0], b[offset], tolerance)) continue;
    let equal = true;
    for (let i = 0; i < a.length; i += 1) {
      if (!_geometryInternals.pointsNear(a[i], b[(offset + i) % b.length], tolerance)) {
        equal = false;
        break;
      }
    }
    if (equal) return true;
  }
  return false;
}

export function polygonsHaveEqualGeometry(a, b, tolerance = DEFAULT_GEOMETRY_TOLERANCES.pointToleranceNormalized) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  if (!boundsNear(polygonBounds(a), polygonBounds(b), tolerance)) return false;
  if (Math.abs(polygonArea(a) - polygonArea(b)) > tolerance) return false;
  return sameCyclicPoints(a, b, tolerance) || sameCyclicPoints(a, [...b].reverse(), tolerance);
}

export function analyzeRegionRelation(a, b, options = {}) {
  const pointTolerance = options.pointToleranceNormalized ?? DEFAULT_GEOMETRY_TOLERANCES.pointToleranceNormalized;
  const touchTolerance = options.boundaryTouchToleranceNormalized ?? DEFAULT_GEOMETRY_TOLERANCES.boundaryTouchToleranceNormalized;
  const geometryA = a?.geometry || a;
  const geometryB = b?.geometry || b;
  if (polygonsHaveEqualGeometry(geometryA, geometryB, pointTolerance)) return 'equal_geometry';
  const aContainsB = polygonContainsPolygon(geometryA, geometryB);
  const bContainsA = polygonContainsPolygon(geometryB, geometryA);
  if (aContainsB && !bContainsA) return 'contains';
  if (bContainsA && !aContainsB) return 'inside';
  if (polygonsOverlap(geometryA, geometryB)) return 'overlaps';
  if (polygonsTouch(geometryA, geometryB, touchTolerance)) return 'touches';
  return 'disjoint';
}

export function analyzeAllRegionRelations(regions, options = {}) {
  const sorted = [...(Array.isArray(regions) ? regions : [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const relations = [];
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      relations.push({ regionAId: sorted[i].id, regionBId: sorted[j].id, relation: analyzeRegionRelation(sorted[i], sorted[j], options) });
    }
  }
  return relations;
}
