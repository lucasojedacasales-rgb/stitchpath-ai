export function createPlanningAmbiguityFixture() {
  return [
    { id: 'unknown-low-confidence', color: '#888888', region_class: 'unclassified', path_points: [[0.1, 0.1], [0.25, 0.1], [0.25, 0.25], [0.1, 0.25]], source: { fixture: 'synthetic_phase_4_ambiguity' } },
    { id: 'dark-external', color: '#050505', region_class: 'unknown', path_points: [[0.7, 0.7], [0.9, 0.7], [0.9, 0.9], [0.7, 0.9]], source: { fixture: 'synthetic_phase_4_ambiguity' } },
  ];
}

export function createExplicitHolePlanningFixture() {
  return [{
    id: 'body-with-hole', color: '#55aa66', region_class: 'body',
    path_points: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]],
    holes: [[[0.4, 0.4], [0.4, 0.6], [0.6, 0.6], [0.6, 0.4]]],
    source: { fixture: 'synthetic_phase_4_explicit_hole' },
  }];
}
