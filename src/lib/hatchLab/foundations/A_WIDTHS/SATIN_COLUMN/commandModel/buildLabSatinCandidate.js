/**
 * buildLabSatinCandidate.js — read-only adapter from a P1.F0 measurement to the
 * candidate envelope the P1.F1 compiler expects.
 *
 * It only RE-EXPOSES fields that the measurement already computed (it never
 * recomputes geometry and never mutates the measurement), plus the traceability
 * identity taken from the persisted fixture.
 */

import { canonicalStringify, fnv1a32 } from './canonicalizeLabSatinCommands.js';

/**
 * @param {object} measured — result of measureSatinCandidate
 * @param {object} identity — { baselineId, rawCaptureSha256, caseId, regionId, sourceIndex, polygonHash }
 */
export function buildLabSatinCandidate(measured, identity = {}) {
  const zigzag = measured?.zigzag || {};
  const rails = measured?.rails || {};
  const pointsMm = Array.isArray(zigzag.pointsMm) ? zigzag.pointsMm.map((p) => [p[0], p[1]]) : [];
  const stationWidthsMm = Array.isArray(rails.stations)
    ? rails.stations.map((s) => (Number.isFinite(s.widthMm) ? s.widthMm : null))
    : [];

  const candidate = {
    // identity / provenance
    baselineId: identity.baselineId ?? null,
    rawCaptureSha256: identity.rawCaptureSha256 ?? null,
    caseId: identity.caseId ?? measured?.caseId ?? null,
    regionId: identity.regionId ?? measured?.regionId ?? null,
    sourceIndex: identity.sourceIndex ?? null,
    polygonHash: identity.polygonHash ?? null,
    foundationVersion: measured?.foundationVersion ?? null,
    // isolation flags
    candidateOnly: measured?.candidateOnly === true,
    integrated: measured?.integrated === true,
    coordinateSpace: 'mm',
    // verdicts (copied verbatim)
    geometryType: zigzag.geometryType ?? null,
    geometryEligibility: measured?.geometryEligibility ?? null,
    overallEligibility: measured?.overallEligibility ?? null,
    holeMetadataStatus: measured?.holeMetadataStatus ?? null,
    candidateGeometryComplete: measured?.candidateGeometryComplete === true,
    allStationsPaired: measured?.allStationsPaired === true,
    failedStations: measured?.failedStations ?? null,
    containmentStatus: measured?.containment?.containmentStatus ?? null,
    outsideSampleCount: measured?.containment?.outsideSampleCount ?? null,
    splitRequired: zigzag?.metrics?.splitRequired === true,
    // geometry
    pointsMm,
    stationCount: Array.isArray(rails.stations) ? rails.stations.length : null,
    stationWidthsMm,
    spacingMm: measured?.options?.spacingMm ?? null,
    maximumStitchLengthMm: measured?.options?.maxStitchLengthMm ?? null,
  };

  candidate.sourceCandidateHash = `fnv1a32:${fnv1a32(canonicalStringify({
    caseId: candidate.caseId,
    regionId: candidate.regionId,
    polygonHash: candidate.polygonHash,
    pointsMm: candidate.pointsMm,
    stationWidthsMm: candidate.stationWidthsMm,
    spacingMm: candidate.spacingMm,
  }))}`;

  return candidate;
}