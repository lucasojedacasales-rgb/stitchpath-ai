const issue = (code, message) => ({ code, message });
const nearestIntegerRatio = (numerator, denominator) => Math.sign(numerator) * Math.floor(Math.abs(numerator) / denominator + 0.5);

export function splitDSTIntegerMovement({ startXUnits, startYUnits, targetXUnits, targetYUnits, maximumDeltaUnits = 121 }) {
  const values = { startXUnits, startYUnits, targetXUnits, targetYUnits }; const errors = [];
  Object.entries(values).forEach(([key, value]) => { if (!Number.isInteger(value)) errors.push(issue('DST_SPLIT_INTEGER_REQUIRED', `${key} must be an integer.`)); });
  if (!Number.isInteger(maximumDeltaUnits) || maximumDeltaUnits <= 0) errors.push(issue('DST_SPLIT_MAXIMUM_INVALID', 'maximumDeltaUnits must be a positive integer.'));
  if (errors.length) return { valid: false, segments: [], errors };
  const totalDxUnits = targetXUnits - startXUnits; const totalDyUnits = targetYUnits - startYUnits;
  if (totalDxUnits === 0 && totalDyUnits === 0) return { valid: true, segments: [], errors: [], totalDxUnits, totalDyUnits, splitApplied: false };
  const count = Math.max(1, Math.ceil(Math.abs(totalDxUnits) / maximumDeltaUnits), Math.ceil(Math.abs(totalDyUnits) / maximumDeltaUnits));
  const segments = []; let previousX = startXUnits; let previousY = startYUnits;
  for (let index = 1; index <= count; index += 1) {
    const xUnits = index === count ? targetXUnits : startXUnits + nearestIntegerRatio(totalDxUnits * index, count);
    const yUnits = index === count ? targetYUnits : startYUnits + nearestIntegerRatio(totalDyUnits * index, count);
    const dxUnits = xUnits - previousX; const dyUnits = yUnits - previousY;
    if (dxUnits === 0 && dyUnits === 0) return { valid: false, segments: [], errors: [issue('DST_ZERO_LENGTH_SPLIT_SEGMENT', 'A nonzero movement produced a zero-length split segment.')] };
    if (Math.abs(dxUnits) > maximumDeltaUnits || Math.abs(dyUnits) > maximumDeltaUnits) return { valid: false, segments: [], errors: [issue('DST_SPLIT_COMPONENT_OUT_OF_RANGE', 'A split component exceeds the DST limit.')] };
    segments.push(Object.freeze({ xUnits, yUnits, dxUnits, dyUnits, splitIndex: index - 1, splitCount: count })); previousX = xUnits; previousY = yUnits;
  }
  return Object.freeze({ valid: true, segments: Object.freeze(segments), errors: Object.freeze([]), totalDxUnits, totalDyUnits, splitApplied: count > 1 });
}

