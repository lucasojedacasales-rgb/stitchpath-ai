export function createAmbiguousSemanticFixture() {
  return [
    { id: 'conflicting', name: 'body background', color: '#888888', path_points: [[0.1, 0.1], [0.4, 0.1], [0.4, 0.4], [0.1, 0.4]], source: 'synthetic_phase_3_fixture' },
    { id: 'invalid-color', name: 'detail', color: 'not-a-color', path_points: [[0.5, 0.1], [0.7, 0.1], [0.7, 0.3], [0.5, 0.3]], source: 'synthetic_phase_3_fixture' },
    { id: 'unknown-low-confidence', color: '#888888', path_points: [[0.72, 0.65], [0.82, 0.65], [0.82, 0.75], [0.72, 0.75]], source: 'synthetic_phase_3_fixture' },
  ];
}

export function createNestedWithoutNegativeEvidenceFixture() {
  return [
    { id: 'container', color: '#55aa66', region_class: 'body', path_points: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]] },
    { id: 'nested-unknown', color: '#bbbbbb', path_points: [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6]] },
  ];
}
