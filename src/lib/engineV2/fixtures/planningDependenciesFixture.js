const rect = (id, regionClass, color, x1, y1, x2, y2) => ({ id, color, region_class: regionClass, path_points: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]], source: { fixture: 'synthetic_phase_4_dependencies' } });

export function createPlanningDependenciesFixture() {
  return [
    rect('body', 'body', '#55aa66', 0.05, 0.05, 0.95, 0.95),
    rect('face', 'face', '#f5ead8', 0.2, 0.2, 0.8, 0.8),
    rect('eye', 'eye', '#111111', 0.4, 0.4, 0.5, 0.5),
    rect('highlight', 'highlight', '#ffffff', 0.43, 0.43, 0.45, 0.45),
  ];
}

export function createOverlappingSiblingPlanningFixture() {
  return [
    rect('body', 'body', '#55aa66', 0.05, 0.05, 0.95, 0.95),
    rect('sibling-a', 'face', '#eeeeee', 0.2, 0.2, 0.6, 0.6),
    rect('sibling-b', 'belly', '#eeeeee', 0.4, 0.4, 0.8, 0.8),
  ];
}

export function createDisconnectedSameColorPlanningFixture() {
  return [rect('left', 'body', '#55aa66', 0.05, 0.1, 0.35, 0.8), rect('right', 'body', '#55aa66', 0.65, 0.1, 0.95, 0.8)];
}
