function rect(id, color, x1, y1, x2, y2, regionClass, extra = {}) {
  return { id, color, region_class: regionClass, path_points: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]], source: { fixture: 'synthetic_phase_3', ...extra } };
}

export function createSemanticRolesFixture() {
  return [
    rect('body', '#43a85f', 0.1, 0.08, 0.9, 0.92, 'body'),
    rect('face', '#f4eadc', 0.28, 0.25, 0.72, 0.68, 'face'),
    rect('eye', '#ffffff', 0.37, 0.3, 0.47, 0.43, 'eye'),
    rect('mouth', '#111111', 0.42, 0.55, 0.58, 0.59, 'mouth'),
    rect('highlight', '#ffffff', 0.4, 0.32, 0.43, 0.35, 'highlight'),
    rect('negative-space', '#ffffff', 0.76, 0.3, 0.82, 0.42, 'unknown', { negativeSpace: true }),
  ];
}

export function createGenericMascotSemanticFixture() {
  return [
    ...createSemanticRolesFixture(),
    rect('left-foot', '#d94a35', 0.08, 0.82, 0.34, 0.98, 'foot'),
    rect('right-foot', '#d94a35', 0.66, 0.82, 0.92, 0.98, 'foot'),
    rect('cheek', '#ee7180', 0.64, 0.48, 0.72, 0.56, 'cheek'),
  ];
}
