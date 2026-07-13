export function createInvalidRegionsFixture() {
  return {
    duplicateIds: [
      { id: 'duplicate', path_points: [[0, 0], [0.2, 0], [0.2, 0.2]] },
      { id: 'duplicate', path_points: [[0.5, 0.5], [0.7, 0.5], [0.7, 0.7]] },
    ],
    missingId: [{ path_points: [[0, 0], [0.2, 0], [0.2, 0.2]] }],
    nan: [{ id: 'nan', path_points: [[0, 0], [Number.NaN, 0], [0, 0.2]] }],
    infinity: [{ id: 'infinity', path_points: [[0, 0], [Number.POSITIVE_INFINITY, 0], [0, 0.2]] }],
    outOfRange: [{ id: 'outside', path_points: [[0, 0], [1.2, 0], [0, 0.2]] }],
    selfIntersecting: [{ id: 'bow-tie', path_points: [[0.1, 0.1], [0.9, 0.9], [0.1, 0.9], [0.9, 0.1]] }],
    duplicateClosingPoint: [{ id: 'closed', path_points: [[0.1, 0.1], [0.8, 0.1], [0.8, 0.8], [0.1, 0.1]] }],
    consecutiveDuplicatePoints: [{ id: 'consecutive', path_points: [[0.1, 0.1], [0.8, 0.1], [0.8, 0.1], [0.8, 0.8], [0.1, 0.8]] }],
    pixel: [{ id: 'pixel', path_points: [[10, 10], [90, 10], [90, 90], [10, 90]] }],
    millimeter: [{ id: 'millimeter', path_points: [[5, 5], [45, 5], [45, 95], [5, 95]] }],
    contourFallback: [{ id: 'contour-fallback', contour_points: [[0.1, 0.1], [0.8, 0.1], [0.8, 0.8]] }],
    hidden: [{ id: 'hidden', visible: false, path_points: [[0.1, 0.1], [0.8, 0.1], [0.8, 0.8]] }],
  };
}
