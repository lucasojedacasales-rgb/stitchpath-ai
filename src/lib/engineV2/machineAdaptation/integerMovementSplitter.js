import { roundHalfAwayFromZero } from './machineCoordinateQuantizer.js';

export function splitIntegerMovement({ dxUnits, dyUnits, maximumDeltaUnits, commandType }) {
  const errors = [];
  if (!['stitch', 'jump'].includes(commandType)) errors.push({ code: 'INVALID_SPLIT_COMMAND_TYPE', message: 'Only stitch and jump movements can split.' });
  if (!Number.isInteger(dxUnits) || !Number.isInteger(dyUnits)) errors.push({ code: 'NON_INTEGER_SPLIT_DELTA', message: 'Movement deltas must be integers.' });
  if (maximumDeltaUnits != null && (!Number.isInteger(maximumDeltaUnits) || maximumDeltaUnits <= 0)) errors.push({ code: 'INVALID_SPLIT_MAXIMUM', message: 'Movement maximum must be a positive integer or null.' });
  if (errors.length) return { valid: false, segments: [], errors };
  if (dxUnits === 0 && dyUnits === 0) return { valid: false, segments: [], errors: [{ code: 'ZERO_DISTANCE_MOVEMENT', message: 'A non-zero movement is required.' }] };
  const count = maximumDeltaUnits == null ? 1 : Math.max(1, Math.ceil(Math.abs(dxUnits) / maximumDeltaUnits), Math.ceil(Math.abs(dyUnits) / maximumDeltaUnits));
  const segments = []; let previousX = 0; let previousY = 0;
  for (let index = 1; index <= count; index += 1) {
    const targetX = index === count ? dxUnits : roundHalfAwayFromZero(dxUnits * index / count);
    const targetY = index === count ? dyUnits : roundHalfAwayFromZero(dyUnits * index / count);
    const dx = targetX - previousX; const dy = targetY - previousY;
    if (dx === 0 && dy === 0) return { valid: false, segments: [], errors: [{ code: 'ZERO_DISTANCE_SPLIT_SEGMENT', message: 'Movement cannot split without a zero segment.' }] };
    if (maximumDeltaUnits != null && (Math.abs(dx) > maximumDeltaUnits || Math.abs(dy) > maximumDeltaUnits)) return { valid: false, segments: [], errors: [{ code: 'SPLIT_COMPONENT_EXCEEDS_MAXIMUM', message: 'Split component exceeds declared maximum.' }] };
    segments.push({ dxUnits: dx, dyUnits: dy, commandType, splitIndex: index - 1, splitCount: count }); previousX = targetX; previousY = targetY;
  }
  return { valid: true, segments, errors: [] };
}
