/**
 * syntheticFixtures.js — laboratory-invented shapes, always synthetic: true.
 * Never real baseline data, never used to state anything about A1–A8.
 * Design space is isotropic (100 × 100 mm) so mm distances are undistorted.
 */

export const SYNTH_DESIGN = { coordinateSpace: 'normalized_0_1', widthMm: 100, heightMm: 100 };

const wrap = (caseId, points, extra = {}) => ({
  synthetic: true,
  caseId,
  regionId: extra.regionId || caseId.toLowerCase(),
  region: {
    id: extra.regionId || caseId.toLowerCase(),
    path_points: points,
    holes: extra.holes ?? null,
    region_class: extra.region_class ?? null,
    type: 'fill',
    stitch_type: 'fill',
  },
  design: extra.design || SYNTH_DESIGN,
});

/** Positive control: perfectly straight, hole-free bar (30 × 4 mm). */
export const SYNTH_STRAIGHT_BAR = wrap('SYNTH-STRAIGHT-BAR', [
  [0.20, 0.40], [0.50, 0.40], [0.50, 0.44], [0.20, 0.44],
]);

/**
 * SYNTH-BENT-CONSTANT-WIDTH — circular arc band of approximately constant
 * physical width: sections pair almost everywhere, but the centerline is curved,
 * so the straightness policy must refuse to call it straight.
 */
function buildBentBand(innerR = 0.30, outerR = 0.34, from = -Math.PI / 3, to = Math.PI / 3, steps = 60) {
  const cx = 0.5, cy = 0.5;
  const outer = [];
  const inner = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    outer.push([cx + outerR * Math.cos(a), cy + outerR * Math.sin(a)]);
    inner.push([cx + innerR * Math.cos(a), cy + innerR * Math.sin(a)]);
  }
  return [...outer, ...inner.reverse()];
}

export const SYNTH_BENT_CONSTANT_WIDTH = wrap('SYNTH-BENT-CONSTANT-WIDTH', buildBentBand());

export const SYNTHETIC_FIXTURES = [SYNTH_STRAIGHT_BAR, SYNTH_BENT_CONSTANT_WIDTH];