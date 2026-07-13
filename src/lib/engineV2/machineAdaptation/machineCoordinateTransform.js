const normalizedDegrees = value => ((value % 360) + 360) % 360;

export function calculateCanonicalDesignBounds(commands = []) {
  const points = commands.filter(command => ['stitch', 'jump'].includes(command.type) && Number.isFinite(command.x) && Number.isFinite(command.y));
  if (!points.length) return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
  const xs = points.map(point => point.x); const ys = points.map(point => point.y);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
}

function originFor(designBounds, transform) {
  if (transform.originMode === 'design_center_to_machine_origin') return { x: designBounds.centerX, y: designBounds.centerY };
  if (transform.originMode === 'custom') return transform.customOriginMm;
  return { x: 0, y: 0 };
}

export function transformDesignPointToMachineMillimeters({ point, designBounds, profile, config }) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) throw new TypeError('Point coordinates must be finite.');
  const transform = config?.transform ?? profile.defaultTransform; const origin = originFor(designBounds, transform);
  const scaledX = (point.x - origin.x) * transform.scale; const scaledY = (point.y - origin.y) * transform.scale;
  const radians = normalizedDegrees(transform.rotationDegrees) * Math.PI / 180;
  const rotatedX = scaledX * Math.cos(radians) - scaledY * Math.sin(radians); const rotatedY = scaledX * Math.sin(radians) + scaledY * Math.cos(radians);
  return { x: (transform.invertX ? -rotatedX : rotatedX) + transform.translateXmm, y: (transform.invertY ? -rotatedY : rotatedY) + transform.translateYmm };
}

export function inverseTransformMachineMillimetersToDesignPoint({ point, designBounds, profile, config }) {
  const transform = config?.transform ?? profile.defaultTransform; const origin = originFor(designBounds, transform);
  const invertedX = (point.x - transform.translateXmm) * (transform.invertX ? -1 : 1); const invertedY = (point.y - transform.translateYmm) * (transform.invertY ? -1 : 1);
  const radians = -normalizedDegrees(transform.rotationDegrees) * Math.PI / 180;
  const rotatedX = invertedX * Math.cos(radians) - invertedY * Math.sin(radians); const rotatedY = invertedX * Math.sin(radians) + invertedY * Math.cos(radians);
  return { x: rotatedX / transform.scale + origin.x, y: rotatedY / transform.scale + origin.y };
}
