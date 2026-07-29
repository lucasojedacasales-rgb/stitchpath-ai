/**
 * extractStraightColumnFixture.js — identity of the five authorized regions
 * and integrity helpers for the fixture built from the verified external
 * capture of BASE-ENGINE-A-WIDTHS-V1. The engine is never re-run.
 */

export const BASELINE_ID = 'BASE-ENGINE-A-WIDTHS-V1';
export const RAW_CAPTURE_SHA256 = '7BB259D7AAE1FE2102AAA4372D76912E3580B81765A6A2B314045B2692E55649';

export const AUTHORIZED_REGIONS = [
  { caseId: 'HATCH-A-WIDTHS-A1', regionId: 'r_zbgef31', sourceIndex: 22 },
  { caseId: 'HATCH-A-WIDTHS-A5', regionId: 'r_sv7z5qe', sourceIndex: 9 },
  { caseId: 'HATCH-A-WIDTHS-A6', regionId: 'r_ecj9hl4', sourceIndex: 8 },
  { caseId: 'HATCH-A-WIDTHS-A7', regionId: 'r_c92bxh3', sourceIndex: 7 },
  { caseId: 'HATCH-A-WIDTHS-A8', regionId: 'r_zr65703', sourceIndex: 6 },
];

export const DESIGN_SPACE = { coordinateSpace: 'normalized_0_1', widthMm: 100, heightMm: 80 };

/**
 * Deterministic synchronous polygon hash (FNV-1a 32-bit over the canonical
 * JSON of the full-precision points). Works in both node and browser test
 * environments without async crypto.
 */
export function hashPolygon(points) {
  const text = JSON.stringify(points);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 'fnv1a32:' + h.toString(16).padStart(8, '0');
}

/**
 * Verifies a fixture object: provenance binding, authorized identity list,
 * per-polygon hash reproduction and coordinate-space declaration.
 */
export function verifyStraightColumnFixture(fixture) {
  const reasons = [];
  if (!fixture || fixture.baselineId !== BASELINE_ID) reasons.push('fixture baselineId does not match the sealed baseline');
  if (fixture?.rawCaptureSha256 !== RAW_CAPTURE_SHA256) reasons.push('fixture rawCaptureSha256 does not match the verified capture hash');
  if (fixture?.design?.coordinateSpace !== 'normalized_0_1') reasons.push('fixture must declare coordinateSpace normalized_0_1');
  if (fixture?.design?.widthMm !== 100 || fixture?.design?.heightMm !== 80) reasons.push('fixture design must declare 100×80 mm');
  const regions = Array.isArray(fixture?.regions) ? fixture.regions : [];
  if (regions.length !== AUTHORIZED_REGIONS.length) reasons.push(`fixture must contain exactly ${AUTHORIZED_REGIONS.length} regions`);
  for (const auth of AUTHORIZED_REGIONS) {
    const entry = regions.find((r) => r.caseId === auth.caseId);
    if (!entry) { reasons.push(`missing region for ${auth.caseId}`); continue; }
    if (entry.regionId !== auth.regionId) reasons.push(`${auth.caseId}: regionId mismatch`);
    if (entry.sourceIndex !== auth.sourceIndex) reasons.push(`${auth.caseId}: sourceIndex mismatch`);
    if (entry.region?.id !== auth.regionId) reasons.push(`${auth.caseId}: embedded region id mismatch`);
    const pts = entry.region?.path_points;
    if (!Array.isArray(pts) || pts.length < 3) { reasons.push(`${auth.caseId}: path_points missing`); continue; }
    if (hashPolygon(pts) !== entry.polygonHash) reasons.push(`${auth.caseId}: polygonHash does not reproduce`);
  }
  return { valid: reasons.length === 0, reasons };
}