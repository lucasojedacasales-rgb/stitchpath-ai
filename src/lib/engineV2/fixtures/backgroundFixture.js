export function createBackgroundFixture() {
  return [
    { id: 'background', color: '#f5f5f5', region_class: 'background', path_points: [[0, 0], [1, 0], [1, 1], [0, 1]], source: 'synthetic_phase_3_fixture' },
    { id: 'foreground', color: '#55aa66', region_class: 'body', path_points: [[0.2, 0.15], [0.8, 0.15], [0.8, 0.85], [0.2, 0.85]], source: 'synthetic_phase_3_fixture' },
  ];
}

export function createLargeBodyWithoutBackgroundFixture() {
  return [{ id: 'large-body', color: '#55aa66', region_class: 'body', path_points: [[0.08, 0.06], [0.92, 0.06], [0.92, 0.94], [0.08, 0.94]], source: 'synthetic_phase_3_fixture' }];
}
