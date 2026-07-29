/**
 * compileStraightSatinCandidateToLabCommands.js — pure compiler:
 * paired boundary zigzag points → local lab stitch commands.
 *
 * Pure, deterministic, side-effect free, never mutates the candidate, safe on
 * empty/partial data. It never repairs geometry: a failing precondition returns
 * a diagnostic envelope with no usable commands.
 */

import {
  COMMAND_MODEL_VERSION, COMPILER_VERSION, COORDINATE_SPACE,
  LENGTH_LIMITS,
} from './commandModelSchema.js';
import { measureLabSatinCommands, buildLabSatinSafety } from './measureLabSatinCommands.js';
import { computeCommandModelHash } from './canonicalizeLabSatinCommands.js';

const isFinitePoint = (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/** Ordered precondition checks. The first failing group decides the status. */
function checkPreconditions(candidate) {
  const fail = (status, reason) => ({ status, reason });
  const problems = [];
  if (!candidate || typeof candidate !== 'object') return [fail('unavailable', 'candidate is missing')];

  if (candidate.candidateOnly !== true) problems.push(fail('unavailable', 'candidateOnly must be true'));
  if (candidate.integrated !== false) problems.push(fail('unavailable', 'integrated must be false'));
  if (candidate.coordinateSpace !== 'mm') problems.push(fail('unavailable', `coordinateSpace must be mm, got ${candidate.coordinateSpace}`));
  if (candidate.geometryType !== 'paired_boundary_zigzag') problems.push(fail('invalid_geometry', `geometryType must be paired_boundary_zigzag, got ${candidate.geometryType}`));

  if (candidate.holeMetadataStatus !== 'clear') problems.push(fail('metadata_conflict', `holeMetadataStatus must be clear, got ${candidate.holeMetadataStatus}`));
  if (candidate.overallEligibility !== 'eligible') {
    problems.push(fail(candidate.overallEligibility === 'metadata_conflict' ? 'metadata_conflict' : 'ineligible',
      `overallEligibility must be eligible, got ${candidate.overallEligibility}`));
  }
  if (candidate.geometryEligibility !== 'eligible') problems.push(fail('ineligible', `geometryEligibility must be eligible, got ${candidate.geometryEligibility}`));
  if (candidate.candidateGeometryComplete !== true) problems.push(fail('ineligible', 'candidateGeometryComplete must be true'));
  if (candidate.allStationsPaired !== true) problems.push(fail('ineligible', 'allStationsPaired must be true'));
  if (candidate.failedStations !== 0) problems.push(fail('ineligible', `failedStations must be 0, got ${candidate.failedStations}`));
  if (candidate.containmentStatus !== 'contained') problems.push(fail('ineligible', `containmentStatus must be contained, got ${candidate.containmentStatus}`));
  if (candidate.outsideSampleCount !== 0) problems.push(fail('ineligible', `outsideSampleCount must be 0, got ${candidate.outsideSampleCount}`));
  if (candidate.splitRequired === true) problems.push(fail('unsupported_requires_split', 'candidate already reports splitRequired'));

  const pts = candidate.pointsMm;
  if (!Array.isArray(pts) || pts.length < 2) problems.push(fail('invalid_geometry', 'pointsMm must contain at least two points'));
  else {
    const badIndex = pts.findIndex((p) => !isFinitePoint(p));
    if (badIndex >= 0) problems.push(fail('invalid_geometry', `pointsMm[${badIndex}] is not a finite 2D point`));
    if (pts.length % 2 !== 0) problems.push(fail('invalid_geometry', `pointsMm length ${pts.length} is odd: rails are not fully paired`));
    for (let i = 0; i + 1 < pts.length; i++) {
      if (isFinitePoint(pts[i]) && isFinitePoint(pts[i + 1]) && pts[i][0] === pts[i + 1][0] && pts[i][1] === pts[i + 1][1]) {
        problems.push(fail('invalid_geometry', `pointsMm[${i}] and pointsMm[${i + 1}] are consecutive duplicates (zero-length stitch)`));
        break;
      }
    }
  }
  return problems;
}

function buildCommand(index, from, to, limits) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const lengthMm = Math.hypot(dx, dy);
  const finite = Number.isFinite(lengthMm);
  const stationIndexOf = (pointIndex) => Math.floor(pointIndex / 2);
  const railOf = (pointIndex) => (pointIndex % 2 === 0 ? 'left' : 'right');
  const fromPointIndex = index;
  const toPointIndex = index + 1;
  return {
    commandIndex: index,
    op: 'stitch',
    fromMm: [from[0], from[1]],
    toMm: [to[0], to[1]],
    deltaMm: [dx, dy],
    lengthMm,
    // Even segments join the two rails of one station; odd segments advance to
    // the next station's left rail.
    segmentKind: index % 2 === 0 ? 'cross_column' : 'advance_diagonal',
    sourcePointIndex: toPointIndex,
    fromStationIndex: stationIndexOf(fromPointIndex),
    toStationIndex: stationIndexOf(toPointIndex),
    fromRail: railOf(fromPointIndex),
    toRail: railOf(toPointIndex),
    // diagnostics (never used to mutate the path)
    finite,
    zeroLength: finite && lengthMm === 0,
    belowMinimum: finite && lengthMm < limits.minStitchLengthMm,
    aboveMaximum: finite && lengthMm > limits.maxStitchLengthMm,
  };
}

/**
 * @param {{ candidate?: any, holeReconciliation?: any, options?: any }} [args]
 */
export function compileStraightSatinCandidateToLabCommands(args = {}) {
  const { candidate, holeReconciliation, options } = args;
  const limits = {
    ...LENGTH_LIMITS,
    ...(Number.isFinite(options?.minStitchLengthMm) ? { minStitchLengthMm: options.minStitchLengthMm } : {}),
    ...(Number.isFinite(options?.maxStitchLengthMm) ? { maxStitchLengthMm: options.maxStitchLengthMm } : {}),
  };

  const base = {
    modelVersion: COMMAND_MODEL_VERSION,
    modelId: `${COMMAND_MODEL_VERSION}::${candidate?.caseId ?? 'UNKNOWN'}`,
    compilerVersion: COMPILER_VERSION,
    caseId: candidate?.caseId ?? null,
    regionId: candidate?.regionId ?? null,
    baselineId: candidate?.baselineId ?? null,
    rawCaptureSha256: candidate?.rawCaptureSha256 ?? null,
    sourceIndex: candidate?.sourceIndex ?? null,
    polygonHash: candidate?.polygonHash ?? null,
    sourceCandidateHash: candidate?.sourceCandidateHash ?? null,
    holeReconciliationStatus: holeReconciliation?.holeMetadataStatus ?? candidate?.holeMetadataStatus ?? null,
    holeSemanticStatus: holeReconciliation?.holeSemanticStatus ?? null,
    sourceGeometryPointCount: Array.isArray(candidate?.pointsMm) ? candidate.pointsMm.length : 0,
    sourceStationCount: candidate?.stationCount ?? null,
    sourceSpacingMm: candidate?.spacingMm ?? null,
    sourceMaximumStitchLengthMm: candidate?.maximumStitchLengthMm ?? null,
    containmentStatus: candidate?.containmentStatus ?? null,
    coordinateSpace: COORDINATE_SPACE,
    candidateOnly: true,
    integrated: false,
    machineReady: false,
    exportReady: false,
  };

  const problems = checkPreconditions(candidate);
  if (problems.length > 0) {
    const order = ['unavailable', 'metadata_conflict', 'unsupported_requires_split', 'invalid_geometry', 'ineligible'];
    const status = order.find((s) => problems.some((p) => p.status === s)) || 'unavailable';
    return {
      ...base,
      status,
      startAnchorMm: null,
      commands: [],
      endAnchorMm: null,
      metrics: measureLabSatinCommands([], limits),
      safety: { ...buildLabSatinSafety(measureLabSatinCommands([], limits), []), modelComplete: false },
      diagnostics: problems,
      warnings: problems.map((p) => `${p.status}: ${p.reason}`),
      commandModelHash: null,
    };
  }

  const pts = candidate.pointsMm;
  const commands = [];
  for (let i = 0; i + 1 < pts.length; i++) commands.push(buildCommand(i, pts[i], pts[i + 1], limits));

  const metrics = measureLabSatinCommands(commands, limits);
  const safety = buildLabSatinSafety(metrics, commands);
  const warnings = [];
  if (safety.shortStitchHandlingRequired) warnings.push(`${metrics.belowMinimumCommandCount} command(s) below ${limits.minStitchLengthMm} mm: a future short-stitch policy is required (none applied)`);
  if (safety.splitRequired) warnings.push(`${metrics.aboveMaximumCommandCount} command(s) above ${limits.maxStitchLengthMm} mm: a future split policy is required (none applied)`);

  const model = {
    ...base,
    status: safety.modelComplete ? 'lab_command_model_complete' : 'lab_command_model_incomplete',
    startAnchorMm: [pts[0][0], pts[0][1]],
    commands,
    endAnchorMm: [pts[pts.length - 1][0], pts[pts.length - 1][1]],
    startAnchorPolicy: 'startAnchorMm is the first geometry point and is NOT converted into a jump, a stitch from [0,0], a trim or a tie-in; the model is local to the object and knows nothing about the previous region',
    metrics,
    safety,
    diagnostics: [],
    warnings,
  };
  return { ...model, commandModelHash: computeCommandModelHash(model) };
}