export function createOverlappingRegionsFixture() {
  return [
    { id: 'overlap-a', color: '#ff0000', path_points: [[0.1, 0.1], [0.65, 0.1], [0.65, 0.65], [0.1, 0.65]] },
    { id: 'overlap-b', color: '#0000ff', path_points: [[0.4, 0.4], [0.9, 0.4], [0.9, 0.9], [0.4, 0.9]] },
  ];
}

export function createEqualGeometryFixture() {
  return [
    { id: 'equal-a', color: '#ff0000', path_points: [[0.1, 0.1], [0.7, 0.1], [0.7, 0.7], [0.1, 0.7]] },
    { id: 'equal-b', color: '#ff0010', path_points: [[0.7, 0.1], [0.7, 0.7], [0.1, 0.7], [0.1, 0.1]] },
  ];
}
