/**
 * auditRegionTopology.js — P1.F0.2 independent topology audit.
 *
 * Computes the topology the region actually REPRESENTS. The scalar hole metadata
 * is never an input: only fields that carry real ring geometry (arrays of >= 3
 * finite points, or objects exposing such arrays) can create an interior ring.
 * A number can never create a ring, and no ring is ever reconstructed from a count.
 */

import { shoelaceSignedArea, perimeterMm } from '../geometry/polygonValidation.js';
import { analyzePolygonSimplicity } from '../geometry/polygonSimplicity.js';

const GEOMETRY_CANDIDATE_FIELDS = ['holes', 'holeRings', 'holeGeometry', 'interiorRings', 'innerContours', 'childContours'];
const SCALAR_FIELDS = ['holes', 'holeCount', 'hole_count', 'explicitHoleCount'];

const isPoint = (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const isRing = (v) => Array.isArray(v) && v.length >= 3 && v.every(isPoint);

/** Extracts real rings from one field value. Numbers/booleans yield nothing. */
function extractRings(value) {
  if (isRing(value)) return [value];
  if (Array.isArray(value)) {
    const rings = [];
    for (const item of value) {
      if (isRing(item)) rings.push(item);
      else if (item && typeof item === 'object' && !Array.isArray(item)) {
        for (const key of ['points', 'path_points', 'ring', 'contour', 'pointsMm']) {
          if (isRing(item[key])) { rings.push(item[key]); break; }
        }
      }
    }
    return rings;
  }
  if (value && typeof value === 'object') {
    const rings = [];
    for (const key of ['points', 'path_points', 'ring', 'contour', 'pointsMm', 'rings']) {
      if (isRing(value[key])) rings.push(value[key]);
      else if (Array.isArray(value[key])) rings.push(...extractRings(value[key]));
    }
    return rings;
  }
  return [];
}

const toMm = (ring, design) => ring.map((p) => [p[0] * design.widthMm, p[1] * design.heightMm]);

/** Removes consecutive duplicates and the explicit closing duplicate (recorded, not silent). */
function dedupeRing(ring, notes, label) {
  const out = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (last && last[0] === p[0] && last[1] === p[1]) continue;
    out.push(p);
  }
  while (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
  if (out.length !== ring.length) notes.push(`${label}: removed ${ring.length - out.length} duplicate/closing point(s) before topology analysis`);
  return out;
}

/**
 * region: read-only. design: { coordinateSpace: 'normalized_0_1', widthMm, heightMm }.
 * Returns the audit; never mutates the inputs.
 */
export function auditRegionTopology(region = {}, design = {}, options = {}) {
  const warnings = [];
  const base = {
    exteriorRingCount: 0,
    interiorRingCount: 0,
    pathRingCount: 0,
    topologyHoleCount: 0,
    simplePolygon: null,
    selfIntersectionCount: null,
    nestedRingCount: 0,
    ringWinding: null,
    signedAreaMm2: null,
    absoluteAreaMm2: null,
    perimeterMm: null,
    boundaryComponentCount: 0,
    holeGeometryAvailable: false,
    holeGeometryFields: [],
    scalarHoleFieldsIgnored: [],
    topologyMethod: 'declared_ring_enumeration + shoelace + simplicity_analysis (scalar metadata excluded from the computation)',
    readsScalarHoleMetadata: false,
    topologyWarnings: warnings,
  };

  // Scalar metadata is recorded for traceability only — never used as an input.
  for (const field of SCALAR_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(region, field)) continue;
    const v = region[field];
    if (typeof v === 'number' || typeof v === 'boolean') {
      base.scalarHoleFieldsIgnored.push({ field, value: v, valueType: typeof v, usedAsTopologyInput: false });
    }
  }

  if (design.coordinateSpace !== 'normalized_0_1' || !(design.widthMm > 0) || !(design.heightMm > 0)) {
    warnings.push('design coordinate space or size unusable — topology unavailable');
    return { ...base, topologyStatus: 'unavailable' };
  }
  if (!Array.isArray(region.path_points) || region.path_points.length < 3 || !region.path_points.every(isPoint)) {
    warnings.push('path_points missing or not a usable ring — topology unavailable');
    return { ...base, topologyStatus: 'unavailable' };
  }

  const exterior = toMm(dedupeRing(region.path_points, warnings, 'exterior ring'), design);
  const signed = shoelaceSignedArea(exterior);
  const simplicity = analyzePolygonSimplicity(exterior, options);

  const interior = [];
  for (const field of GEOMETRY_CANDIDATE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(region, field)) continue;
    const rings = extractRings(region[field]);
    if (rings.length) {
      base.holeGeometryFields.push({ field, ringCount: rings.length });
      for (const r of rings) interior.push(toMm(dedupeRing(r, warnings, `interior ring from "${field}"`), design));
    }
  }
  if (base.scalarHoleFieldsIgnored.some((s) => s.value) && interior.length === 0) {
    warnings.push('scalar hole metadata is non-zero but no interior ring geometry exists in the region — a count cannot be turned into geometry');
  }

  return {
    ...base,
    topologyStatus: 'measured',
    exteriorRingCount: 1,
    interiorRingCount: interior.length,
    pathRingCount: 1 + interior.length,
    topologyHoleCount: interior.length,
    simplePolygon: simplicity.simple,
    selfIntersectionCount: simplicity.defects.filter((d) => d.kind === 'properCrossing').length,
    nestedRingCount: interior.length,
    ringWinding: signed > 0 ? 'counter_clockwise_positive_area' : 'clockwise_negative_area',
    signedAreaMm2: signed,
    absoluteAreaMm2: Math.abs(signed),
    perimeterMm: perimeterMm(exterior),
    boundaryComponentCount: 1 + interior.length,
    holeGeometryAvailable: interior.length > 0,
    interiorRingsMm: interior,
  };
}