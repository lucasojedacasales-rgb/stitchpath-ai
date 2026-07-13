function square(id, min, max, color) {
  return { id, color, path_points: [[min, min], [max, min], [max, max], [min, max]], source: 'synthetic_phase_2_fixture' };
}

export function createNestedRegionsFixture() {
  return [square('body', 0.05, 0.95, '#00aa44'), square('eye', 0.35, 0.55, '#ffffff')];
}

export function createThreeLevelNestingFixture() {
  return [square('outer', 0.05, 0.95, '#00aa44'), square('middle', 0.2, 0.8, '#ffffff'), square('inner', 0.4, 0.6, '#111111')];
}
