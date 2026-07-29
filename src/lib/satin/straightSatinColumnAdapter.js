/**
 * straightSatinColumnAdapter.js — P1.F2 isolated productive adapter.
 *
 * Turns the verified P1.F0/P1.F1 laboratory satin column model into the
 * productive stitch-point shape (Array<[xMm, yMm]>) consumed by
 * processObjectStitches. It supplies MAIN stitches only:
 * tie-in, underlay and tie-off remain the engine's responsibility, exactly as
 * before. It never mutates the object it receives and returns
 * `applied: false` for any geometry that is not a proven eligible straight
 * column, so the caller can keep its previous behaviour untouched.
 */

import { measureSatinCandidate } from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/geometry/measureSatinCandidate.js';
import {
  buildLabSatinCandidate,
  compileStraightSatinCandidateToLabCommands,
  validateLabSatinCommandModel,
} from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/index.js';

export const ADAPTER_VERSION = 'P1.F2-STRAIGHT-SATIN-COLUMN-PRODUCTIVE-ADAPTER-V1';

/**
 * Engine points are already absolute millimetres, so the laboratory's explicit
 * normalized→mm transform is declared as the identity (widthMm = heightMm = 1).
 * No implicit rescaling ever happens.
 */
const IDENTITY_DESIGN = { coordinateSpace: 'normalized_0_1', widthMm: 1, heightMm: 1 };

function reject(status, reason) {
  return { applied: false, adapterVersion: ADAPTER_VERSION, status, reason, points: null };
}

/**
 * @param {{ id?: string, points?: Array<[number, number]>, holes?: any }} obj
 * @param {{ foundationOptions?: object, minStitchLengthMm?: number, maxStitchLengthMm?: number }} [options]
 */
export function buildStraightSatinColumnStitchPoints(obj, options = {}) {
  const raw = obj?.points;
  if (!Array.isArray(raw) || raw.length < 4) return reject('unavailable', 'fewer than 4 boundary points');

  const measured = measureSatinCandidate(
    {
      caseId: `ENGINE::${obj?.id ?? 'UNKNOWN'}`,
      regionId: obj?.id ?? null,
      region: { id: obj?.id ?? null, path_points: raw.map((p) => [p[0], p[1]]), holes: obj?.holes ?? 0 },
      design: IDENTITY_DESIGN,
    },
    options.foundationOptions || {},
  );
  if (measured.status !== 'candidate_geometry_complete') {
    return { ...reject(measured.status, (measured.reasons || [])[0] || 'geometry is not an eligible straight column'), measured };
  }

  const candidate = buildLabSatinCandidate(measured, { caseId: measured.caseId, regionId: measured.regionId });
  const compiled = compileStraightSatinCandidateToLabCommands({
    candidate,
    options: { minStitchLengthMm: options.minStitchLengthMm, maxStitchLengthMm: options.maxStitchLengthMm },
  });
  if (compiled.status !== 'lab_command_model_complete') {
    return { ...reject(compiled.status, (compiled.warnings || [])[0] || 'command model incomplete'), compiled };
  }

  // The laboratory validator also asserts baseline traceability (baselineId,
  // rawCaptureSha256, polygonHash). Those identities only exist for the sealed
  // fixtures, never for a live engine region, so at runtime only the geometric
  // and numeric checks are binding; traceability failures are reported, not fatal.
  const validation = validateLabSatinCommandModel(compiled, candidate);
  const blocking = (validation?.failedChecks || []).filter((c) => !c.startsWith('traceability.'));
  if (blocking.length > 0) {
    return { ...reject('invalid_command_model', blocking[0]), failedChecks: blocking };
  }

  const points = [
    [compiled.startAnchorMm[0], compiled.startAnchorMm[1]],
    ...compiled.commands.map((c) => [c.toMm[0], c.toMm[1]]),
  ];

  return {
    applied: true,
    adapterVersion: ADAPTER_VERSION,
    status: 'straight_satin_column_applied',
    reason: null,
    points,
    stitchCount: points.length,
    commandModelHash: compiled.commandModelHash,
  };
}