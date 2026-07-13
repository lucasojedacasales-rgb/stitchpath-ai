import { describe, expect, it } from 'vitest';
import { analyzeEmbroideryObjectGeometry, evaluateGeneratorReadiness, evaluateStitchTypeCompatibility, planFillAngle, planEntryExitCandidates, planStitchParameters, resolveMaterialProfileV2, resolveTechnicalPlanningConfig } from '../index.js';
import { createRunningTechnicalFixture } from '../fixtures/runningTechnicalFixture.js';
import { createSatinTechnicalFixture } from '../fixtures/satinTechnicalFixture.js';
import { createTatamiTechnicalFixture } from '../fixtures/tatamiTechnicalFixture.js';

const config = resolveTechnicalPlanningConfig(); const materialProfile = resolveMaterialProfileV2('generic_medium_woven');
function planning(object) { const geometryMetrics = analyzeEmbroideryObjectGeometry(object); const compatibility = evaluateStitchTypeCompatibility({ object, geometryMetrics, config }); const stitchParameters = planStitchParameters({ object, geometryMetrics, materialProfile, compatibility, config }); const fillAnglePlan = planFillAngle({ object, geometryMetrics, parentSpecification: null, config }); const candidates = planEntryExitCandidates({ object, geometryMetrics, relatedObjects: [], config }); const readiness = evaluateGeneratorReadiness({ object, geometryMetrics, compatibility, stitchParameters, fillAnglePlan, entryCandidates: candidates.entryCandidates, exitCandidates: candidates.exitCandidates }); return { geometryMetrics, compatibility, stitchParameters, fillAnglePlan, candidates, readiness }; }

describe('Phase 7 stitch parameters and compatibility', () => {
  it('accepts valid tatami geometry', () => expect(planning(createTatamiTechnicalFixture().valid).compatibility.compatible).toBe(true));
  it('blocks tiny tatami geometry', () => expect(planning(createTatamiTechnicalFixture().tiny).compatibility.blockingReasons.some(item => item.code === 'TATAMI_AREA_BELOW_MINIMUM')).toBe(true));
  it('blocks degenerate tatami geometry', () => expect(planning(createTatamiTechnicalFixture().degenerate).compatibility.compatible).toBe(false));
  it('preserves tatami holes in parameters', () => expect(planning(createTatamiTechnicalFixture().withHole).stitchParameters.preserveHoles).toBe(true));
  it('creates bounded tatami parameters', () => expect(planning(createTatamiTechnicalFixture().valid).stitchParameters).toMatchObject({ spacingMm: 0.45, minimumStitchLengthMm: 1, maximumStitchLengthMm: 4.5, reversibleRows: true }));
  it('accepts valid satin width', () => expect(planning(createSatinTechnicalFixture().valid).compatibility.compatible).toBe(true));
  it('rejects narrow satin', () => expect(planning(createSatinTechnicalFixture().narrow).compatibility.blockingReasons.some(item => item.code === 'SATIN_WIDTH_BELOW_MINIMUM')).toBe(true));
  it('rejects wide satin', () => expect(planning(createSatinTechnicalFixture().wide).compatibility.blockingReasons.some(item => item.code === 'SATIN_WIDTH_ABOVE_MAXIMUM')).toBe(true));
  it('rejects excessive satin width variation', () => expect(planning(createSatinTechnicalFixture().variable).compatibility.blockingReasons.some(item => item.code === 'SATIN_WIDTH_VARIATION_EXCESSIVE')).toBe(true));
  it('records satin suitability without rails', () => { const parameters = planning(createSatinTechnicalFixture().valid).stitchParameters; expect(parameters.suitable).toBe(true); expect(JSON.stringify(parameters)).not.toMatch(/rails|rungs|points/); });
  it('accepts genuine open running paths', () => expect(planning(createRunningTechnicalFixture().open).compatibility.compatible).toBe(true));
  it('accepts closed running outlines', () => expect(planning(createRunningTechnicalFixture().closedOutline).compatibility.compatible).toBe(true));
  it('requires manual handling for broad running polygons', () => expect(planning(createRunningTechnicalFixture().broadPolygon).compatibility.blockingReasons[0]).toMatchObject({ code: 'RUNNING_PATH_INTENT_REQUIRED', disposition: 'manual_required' }));
  it('keeps manual objects manual', () => expect(planning(createRunningTechnicalFixture().manual).compatibility.blockingReasons[0].disposition).toBe('manual_required'));
  it('does not mutate stitch type on failure', () => { const object = createSatinTechnicalFixture().wide; planning(object); expect(object.stitchType).toBe('satin'); });
  it('creates running length parameters', () => expect(planning(createRunningTechnicalFixture().open).stitchParameters).toMatchObject({ targetStitchLengthMm: 2.2, minimumStitchLengthMm: 0.7, maximumStitchLengthMm: 3.2, passes: 1 }));
  it('marks tatami generator ready', () => expect(planning(createTatamiTechnicalFixture().valid).readiness).toMatchObject({ generator: 'tatami', ready: true }));
  it('marks satin generator ready', () => expect(planning(createSatinTechnicalFixture().valid).readiness).toMatchObject({ generator: 'satin', ready: true }));
  it('marks running generator ready', () => expect(planning(createRunningTechnicalFixture().open).readiness).toMatchObject({ generator: 'running', ready: true }));
  it('never marks manual generator ready', () => expect(planning(createRunningTechnicalFixture().manual).readiness).toMatchObject({ generator: 'manual', ready: false }));
  it('readiness does not generate stitches', () => expect(JSON.stringify(planning(createTatamiTechnicalFixture().valid).readiness)).not.toContain('stitchCoordinates'));
});
