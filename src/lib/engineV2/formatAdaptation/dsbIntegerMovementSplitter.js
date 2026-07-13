const issue = (code, message) => ({ code, message });
const nearestIntegerRatio = (numerator, denominator) => Math.sign(numerator) * Math.floor(Math.abs(numerator) / denominator + 0.5);

export function splitDSBIntegerMovement({ dxUnits, dyUnits, maximumDeltaUnits = 127, commandType }) {
  const errors = [];
  if (!Number.isInteger(dxUnits)) errors.push(issue('DSB_SPLIT_INTEGER_REQUIRED', 'dxUnits must be an integer.'));
  if (!Number.isInteger(dyUnits)) errors.push(issue('DSB_SPLIT_INTEGER_REQUIRED', 'dyUnits must be an integer.'));
  if (!Number.isInteger(maximumDeltaUnits) || maximumDeltaUnits <= 0) errors.push(issue('DSB_SPLIT_MAXIMUM_INVALID', 'maximumDeltaUnits must be a positive integer.'));
  if (!['stitch', 'jump'].includes(commandType)) errors.push(issue('DSB_SPLIT_COMMAND_TYPE_INVALID', 'commandType must be stitch or jump.'));
  if (errors.length) return { valid: false, segments: [], errors };
  if (dxUnits === 0 && dyUnits === 0) return Object.freeze({ valid: true, segments: Object.freeze([]), errors: Object.freeze([]), dxUnits, dyUnits, commandType, splitApplied: false });
  const count = Math.max(1, Math.ceil(Math.abs(dxUnits) / maximumDeltaUnits), Math.ceil(Math.abs(dyUnits) / maximumDeltaUnits));
  const segments = []; let accumulatedX = 0; let accumulatedY = 0;
  for (let index = 1; index <= count; index += 1) {
    const targetX = index === count ? dxUnits : nearestIntegerRatio(dxUnits * index, count);
    const targetY = index === count ? dyUnits : nearestIntegerRatio(dyUnits * index, count);
    const segmentDx = targetX - accumulatedX; const segmentDy = targetY - accumulatedY;
    if (segmentDx === 0 && segmentDy === 0) return { valid: false, segments: [], errors: [issue('DSB_ZERO_LENGTH_SPLIT_SEGMENT', 'A nonzero movement produced a zero-length segment.')] };
    if (Math.abs(segmentDx) > maximumDeltaUnits || Math.abs(segmentDy) > maximumDeltaUnits) return { valid: false, segments: [], errors: [issue('DSB_SPLIT_COMPONENT_OUT_OF_RANGE', 'A split component exceeds the DSB limit.')] };
    segments.push(Object.freeze({ dxUnits: segmentDx, dyUnits: segmentDy, accumulatedXUnits: targetX, accumulatedYUnits: targetY, splitIndex: index - 1, splitCount: count, commandType }));
    accumulatedX = targetX; accumulatedY = targetY;
  }
  return Object.freeze({ valid: true, segments: Object.freeze(segments), errors: Object.freeze([]), dxUnits, dyUnits, commandType, splitApplied: count > 1 });
}
