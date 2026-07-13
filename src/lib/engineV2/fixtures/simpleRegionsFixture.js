function square(id, minX, minY, maxX, maxY, color) {
  return { id, color, path_points: [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]], source: 'synthetic_phase_2_fixture' };
}

export function createSimpleRegionsFixture() {
  return [square('left', 0.05, 0.1, 0.35, 0.4, '#ff0000'), square('right', 0.65, 0.6, 0.95, 0.9, '#0000ff')];
}

export function createTouchingRegionsFixture() {
  return [square('touch-left', 0.1, 0.1, 0.5, 0.5, '#ff0000'), square('touch-right', 0.5, 0.1, 0.9, 0.5, '#0000ff')];
}
