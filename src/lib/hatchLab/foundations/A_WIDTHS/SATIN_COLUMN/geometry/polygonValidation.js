/**
 * polygonValidation.js — structural validation of a candidate polygon in mm.
 * Incompatible shapes are reported with concrete reasons, never repaired.
 * P1.F0.1: robust simplicity analysis + explicit hole-declaration policy.
 */

import { analyzePolygonSimplicity, hasSelfIntersection as simplicityHasSelfIntersection } from './polygonSimplicity.js';
import { describeHoleDeclaration } from './holeDeclaration.js';

export { simplicityHasSelfIntersection as hasSelfIntersection };

export function shoelaceSignedArea(pts) {
  let a = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return a / 2;
}

export function perimeterMm(pts) {
  let p = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    p += Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]);
  }
  return p;
}

/**
 * Validates a polygon (mm) plus the identity/role metadata of its region.
 * region: { id, holes, holeCount, region_class, type } — read-only identity checks.
 */
export function validatePolygonMm(pointsMm, region = {}, options = {}) {
  const minPoints = Number.isFinite(options.minPoints) ? options.minPoints : 4;
  const reasons = [];

  if (!Array.isArray(pointsMm) || pointsMm.length === 0) {
    return { valid: false, reasons: ['polygon is empty'], areaMm2: 0, perimeterMm: 0, simplicity: null, holes: describeHoleDeclaration(region) };
  }
  for (const p of pointsMm) {
    if (!Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
      return { valid: false, reasons: ['polygon contains a non-finite point'], areaMm2: 0, perimeterMm: 0, simplicity: null, holes: describeHoleDeclaration(region) };
    }
  }
  if (pointsMm.length < minPoints) reasons.push(`polygon has ${pointsMm.length} points, minimum is ${minPoints}`);

  // Consecutive duplicates must have been removed upstream (recorded, not silent).
  for (let i = 0; i < pointsMm.length; i++) {
    const j = (i + 1) % pointsMm.length;
    if (pointsMm[i][0] === pointsMm[j][0] && pointsMm[i][1] === pointsMm[j][1]) {
      reasons.push('polygon contains consecutive duplicate points');
      break;
    }
  }

  const signedArea = shoelaceSignedArea(pointsMm);
  const areaMm2 = Math.abs(signedArea);
  if (!(areaMm2 > 0)) reasons.push('polygon area is not positive');

  const simplicity = analyzePolygonSimplicity(pointsMm, options);
  if (!simplicity.simple) {
    const kinds = [...new Set(simplicity.defects.map((d) => d.kind))].join(', ');
    reasons.push(`polygon is not simple (${kinds})`);
  }

  // Identity / role constraints (straight-column foundation scope).
  if (!region || typeof region.id !== 'string' || region.id.length === 0) reasons.push('region identity (id) is missing');

  // P1.F0.2: the declaration is reported but is NOT a geometric defect. Hole
  // semantics are reconciled separately (holeSemantics/) and only real interior
  // ring geometry can remove a polygon from the straight-column scope.
  const holes = describeHoleDeclaration(region);

  const roleText = `${region.region_class || ''} ${region.type || ''}`.toLowerCase();
  if (/contour|outline/.test(roleText)) reasons.push('region role is contour/outline, incompatible with a filled straight column');
  if (/discard|detail_aux|auxiliary/.test(roleText)) reasons.push('region role is discarded or auxiliary detail');

  return {
    valid: reasons.length === 0,
    reasons,
    areaMm2,
    signedArea,
    perimeterMm: perimeterMm(pointsMm),
    simplicity,
    polygonSimple: simplicity.simple,
    holes,
    holeStatus: holes.holeStatus,
    holeSourceField: holes.holeSourceField,
    declaredHoleCount: holes.declaredHoleCount,
  };
}