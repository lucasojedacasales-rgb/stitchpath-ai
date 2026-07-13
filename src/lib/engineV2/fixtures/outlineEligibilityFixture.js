function rect(id, regionClass, color, x1, y1, x2, y2, darkStrokeSupport = {}) {
  return { id, color, region_class: regionClass, path_points: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]], darkStrokeSupport, source: { fixture: 'synthetic_phase_4_cases' } };
}

export function createOutlineEligibilityFixture() {
  return [
    rect('body', 'body', '#55aa66', 0.2, 0.2, 0.8, 0.8),
    rect('dark-no-intent', 'unknown', '#050505', 0.1, 0.1, 0.9, 0.9, { available: true, ratio: 0.9, source: 'synthetic_detector' }),
    rect('outline-no-support', 'outline', '#050505', 0.12, 0.12, 0.88, 0.88),
    rect('supported-border', 'border', '#050505', 0.08, 0.08, 0.92, 0.92, { available: true, ratio: 0.86, source: 'synthetic_detector' }),
    rect('eye-outline-conflict', 'eye outline', '#050505', 0.35, 0.35, 0.45, 0.45, { available: true, ratio: 0.9, source: 'synthetic_detector' }),
  ];
}

export function createDisconnectedOutlineFixture() {
  return [
    rect('outline-left', 'outline', '#050505', 0.05, 0.1, 0.1, 0.9, { available: true, ratio: 0.9, source: 'synthetic_detector' }),
    rect('outline-right', 'outline', '#050505', 0.9, 0.1, 0.95, 0.9, { available: true, ratio: 0.9, source: 'synthetic_detector' }),
  ];
}
