export function createExplicitHoleFixture() {
  return [{
    id: 'ring',
    color: '#222222',
    path_points: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]],
    holes: [[[0.35, 0.35], [0.35, 0.65], [0.65, 0.65], [0.65, 0.35]]],
    source: { negativeSpaceExplicit: true },
  }];
}
