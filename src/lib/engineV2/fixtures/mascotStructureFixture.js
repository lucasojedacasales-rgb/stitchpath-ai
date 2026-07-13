function rect(id, color, x1, y1, x2, y2, regionClass = 'unknown') {
  return { id, color, region_class: regionClass, path_points: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]], source: 'generic_mascot_fixture' };
}

export function createMascotStructureFixture() {
  return [
    rect('body', '#36a852', 0.15, 0.08, 0.85, 0.88, 'body'),
    rect('face-belly', '#f7f5ed', 0.3, 0.3, 0.7, 0.72, 'face_belly'),
    rect('left-eye', '#ffffff', 0.35, 0.2, 0.45, 0.35, 'eye'),
    rect('right-eye', '#ffffff', 0.55, 0.2, 0.65, 0.35, 'eye'),
    rect('left-pupil', '#111111', 0.38, 0.24, 0.42, 0.31, 'dark_detail'),
    rect('right-pupil', '#111111', 0.58, 0.24, 0.62, 0.31, 'dark_detail'),
    rect('cheek', '#f06472', 0.66, 0.42, 0.74, 0.5, 'detail'),
    rect('left-foot', '#e24b35', 0.12, 0.82, 0.36, 0.96, 'foot'),
    rect('right-foot', '#e24b35', 0.64, 0.82, 0.88, 0.96, 'foot'),
    rect('dark-outline-left', '#111111', 0.1, 0.08, 0.13, 0.88, 'dark_outline'),
    rect('dark-outline-right', '#111111', 0.87, 0.08, 0.9, 0.88, 'dark_outline'),
  ];
}
