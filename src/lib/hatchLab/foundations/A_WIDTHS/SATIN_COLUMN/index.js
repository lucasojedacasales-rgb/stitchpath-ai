/**
 * index.js — public surface of the P1.F0.1 SATIN_COLUMN foundation.
 * Isolated laboratory prototype: zero imports from src/lib/pipeline,
 * the productive engine, referenceLearning or any UI module.
 */

export { FOUNDATION_VERSION, DEFAULT_OPTIONS, OPTION_KINDS, RESULT_STATUSES, ELIGIBILITY_VALUES, resolveOptions } from './foundationSchema.js';
export { normalizePolygonMm } from './geometry/normalizePolygonMm.js';
export { validatePolygonMm, hasSelfIntersection, shoelaceSignedArea, perimeterMm } from './geometry/polygonValidation.js';
export { analyzePolygonSimplicity, orientation, onSegment } from './geometry/polygonSimplicity.js';
export { describeHoleDeclaration } from './geometry/holeDeclaration.js';
export { computePrincipalAxis } from './geometry/principalAxis.js';
export { intersectSectionLine } from './geometry/boundaryIntersections.js';
export { buildColumnRails } from './geometry/buildColumnRails.js';
export { buildSatinZigzag } from './geometry/buildSatinZigzag.js';
export { measureCenterlineStraightness } from './geometry/measureCenterlineStraightness.js';
export { checkZigzagContainment } from './geometry/checkZigzagContainment.js';
export { isInsideOrOnPolygon, isStrictlyInside, distanceToPolygonBoundary } from './geometry/pointInPolygon.js';
export { measureSatinCandidate } from './geometry/measureSatinCandidate.js';
export { evaluateStraightColumnEligibility } from './eligibility/evaluateStraightColumnEligibility.js';
export { BASELINE_ID, RAW_CAPTURE_SHA256, AUTHORIZED_REGIONS, DESIGN_SPACE, hashPolygon, verifyStraightColumnFixture } from './extractStraightColumnFixture.js';
export { renderSatinCandidateSvg } from './renderSatinCandidateSvg.js';
export { SYNTHETIC_FIXTURES, SYNTH_STRAIGHT_BAR, SYNTH_BENT_CONSTANT_WIDTH, SYNTH_DESIGN } from './fixtures/syntheticFixtures.js';

export const ISOLATION_MANIFEST = {
  isolated: true,
  candidateOnly: true,
  integrated: false,
  productiveImports: [],
  enginesExecuted: [],
  mutatesRegions: false,
  producesMachineCommands: false,
};