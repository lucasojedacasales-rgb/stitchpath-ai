export function roundHalfAwayFromZero(value) {
  if (!Number.isFinite(value)) throw new TypeError('Quantized value must be finite.');
  if (Object.is(value, -0) || value === 0) return 0;
  return Math.sign(value) * Math.floor(Math.abs(value) + 0.5);
}

export function quantizeMachineMillimetersToUnits(pointMm, coordinateResolutionMm) {
  if (!Number.isFinite(coordinateResolutionMm) || coordinateResolutionMm <= 0 || !Number.isFinite(pointMm?.x) || !Number.isFinite(pointMm?.y)) throw new TypeError('Point and resolution must be finite and resolution positive.');
  return { x: roundHalfAwayFromZero(pointMm.x / coordinateResolutionMm), y: roundHalfAwayFromZero(pointMm.y / coordinateResolutionMm) };
}

export function dequantizeMachineUnitsToMillimeters(pointUnits, coordinateResolutionMm) {
  if (!Number.isInteger(pointUnits?.x) || !Number.isInteger(pointUnits?.y) || !Number.isFinite(coordinateResolutionMm) || coordinateResolutionMm <= 0) throw new TypeError('Units must be integers and resolution positive.');
  return { x: pointUnits.x * coordinateResolutionMm, y: pointUnits.y * coordinateResolutionMm };
}

export function quantizationErrorMm(original, quantized) {
  return Math.hypot(original.x - quantized.x, original.y - quantized.y);
}
