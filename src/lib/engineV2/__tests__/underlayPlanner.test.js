import { describe, expect, it } from 'vitest';
import { analyzeEmbroideryObjectGeometry, planObjectUnderlay, planStitchParameters, resolveTechnicalPlanningConfig, resolveMaterialProfileV2, evaluateStitchTypeCompatibility } from '../index.js';
import { createRunningTechnicalFixture } from '../fixtures/runningTechnicalFixture.js';
import { createSatinTechnicalFixture } from '../fixtures/satinTechnicalFixture.js';
import { createTatamiTechnicalFixture } from '../fixtures/tatamiTechnicalFixture.js';

const config = resolveTechnicalPlanningConfig();
function plan(object, materialId = 'generic_medium_woven') { const geometryMetrics = analyzeEmbroideryObjectGeometry(object); const materialProfile = resolveMaterialProfileV2(materialId); const compatibility = evaluateStitchTypeCompatibility({ object, geometryMetrics, config }); const stitchParameters = planStitchParameters({ object, geometryMetrics, materialProfile, compatibility, config }); return planObjectUnderlay({ object, geometryMetrics, materialProfile, stitchParameters, config }); }

describe('Phase 7 underlay planner', () => {
  it('plans edge-run and lattice for medium tatami', () => expect(plan(createTatamiTechnicalFixture().valid).sequence.map(item => item.type)).toEqual(['edge_run', 'tatami_lattice']));
  it('preserves hole intent in underlay source', () => expect(plan(createTatamiTechnicalFixture().withHole).source.preserveHoles).toBe(true));
  it('omits automatic underlay for tiny tatami', () => expect(plan(createTatamiTechnicalFixture().tiny).enabled).toBe(false));
  it('plans center-run for eligible satin', () => expect(plan(createSatinTechnicalFixture().valid).sequence.map(item => item.type)).toContain('center_run'));
  it('adds zigzag support for wider eligible satin', () => { const object = { ...createSatinTechnicalFixture().valid, geometry: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 5 }, { x: 0, y: 5 }] }; expect(plan(object).sequence.map(item => item.type)).toContain('zigzag'); });
  it('disables underlay for running stitch', () => expect(plan(createRunningTechnicalFixture().open)).toMatchObject({ applicable: false, enabled: false, sequence: [] }));
  it('leaves manual underlay unresolved', () => expect(plan(createRunningTechnicalFixture().manual)).toMatchObject({ applicable: true, enabled: false, confidence: 0 }));
  it('adds stronger planned support for high-loft tatami', () => expect(plan(createTatamiTechnicalFixture().valid, 'high_loft').sequence.filter(item => item.type === 'tatami_lattice')).toHaveLength(2));
  it('never generates underlay coordinates', () => expect(JSON.stringify(plan(createTatamiTechnicalFixture().valid))).not.toMatch(/coordinates|points/));
  it('does not create separate embroidery objects', () => expect(plan(createTatamiTechnicalFixture().valid).sequence.every(item => !Object.hasOwn(item, 'objectId'))).toBe(true));
});
