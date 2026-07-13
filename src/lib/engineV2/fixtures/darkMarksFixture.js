export function createDarkMarksFixture() {
  return [
    { id: 'body', color: '#55aa66', region_class: 'body', path_points: [[0.1, 0.1], [0.8, 0.1], [0.8, 0.8], [0.1, 0.8]] },
    { id: 'dark-mouth', color: '#111111', region_class: 'mouth', path_points: [[0.3, 0.5], [0.6, 0.5], [0.6, 0.54], [0.3, 0.54]] },
    { id: 'dark-external', color: '#050505', path_points: [[0.84, 0.82], [0.94, 0.82], [0.94, 0.92], [0.84, 0.92]] },
  ];
}
