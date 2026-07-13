function rect(id, x1, y1, x2, y2, color = '#44aa66') {
  return { id, color, path_points: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]], source: 'synthetic_phase_3_fixture' };
}

export function createHoleAwareRelationsFixture() {
  const ring = {
    ...rect('ring', 0.1, 0.1, 0.9, 0.9),
    holes: [[[0.35, 0.35], [0.35, 0.65], [0.65, 0.65], [0.65, 0.35]]],
  };
  return {
    ring,
    solidChild: rect('solid-child', 0.15, 0.15, 0.28, 0.28, '#ffffff'),
    insideHole: rect('inside-hole', 0.42, 0.42, 0.58, 0.58, '#ffffff'),
    touchingHole: rect('touching-hole', 0.35, 0.42, 0.48, 0.58, '#ffffff'),
    crossingHole: rect('crossing-hole', 0.28, 0.42, 0.45, 0.58, '#ffffff'),
  };
}

export function createEqualHoleGeometryFixture() {
  const first = {
    ...createHoleAwareRelationsFixture().ring,
    holes: [
      [[0.35, 0.35], [0.35, 0.65], [0.65, 0.65], [0.65, 0.35]],
      [[0.16, 0.16], [0.16, 0.26], [0.26, 0.26], [0.26, 0.16]],
    ],
  };
  const second = { ...structuredClone(first), id: 'ring-copy', holes: [...first.holes].reverse().map(hole => [...hole].reverse()) };
  return [first, second];
}

export function createDifferentHoleGeometryFixture() {
  const first = createHoleAwareRelationsFixture().ring;
  const second = { ...structuredClone(first), id: 'ring-different', holes: [[[0.4, 0.4], [0.4, 0.6], [0.6, 0.6], [0.6, 0.4]]] };
  return [first, second];
}
