import { describe, expect, it } from 'vitest';
import { analyzeEmbroideryObjectGeometry, planPullCompensation, resolveMaterialProfileV2, resolveTechnicalPlanningConfig } from '../index.js';
import { createRunningTechnicalFixture } from '../fixtures/runningTechnicalFixture.js';
import { createSatinTechnicalFixture } from '../fixtures/satinTechnicalFixture.js';
import { createTatamiTechnicalFixture } from '../fixtures/tatamiTechnicalFixture.js';

const plan = (object, material = 'generic_medium_woven', rawConfig = {}) => planPullCompensation({ object, geometryMetrics: analyzeEmbroideryObjectGeometry(object), materialProfile: resolveMaterialProfileV2(material), config: resolveTechnicalPlanningConfig(rawConfig) });

describe('Phase 7 pull compensation planner', () => {
  it('plans axis-aware tatami compensation', () => expect(plan(createTatamiTechnicalFixture().valid)).toMatchObject({ enabled: true, strategy: 'axis_aware', amountMm: 0.15 }));
  it('plans satin compensation', () => expect(plan(createSatinTechnicalFixture().valid).amountMm).toBe(0.2));
  it('plans no running compensation', () => expect(plan(createRunningTechnicalFixture().open)).toMatchObject({ enabled: false, strategy: 'none', amountMm: 0 }));
  it('supports uniform strategy', () => expect(plan(createTatamiTechnicalFixture().valid, 'generic_medium_woven', { pullCompensation: { axisAware: false } }).strategy).toBe('uniform'));
  it('scales compensation for knit', () => expect(plan(createTatamiTechnicalFixture().valid, 'knit_stretch').amountMm).toBeCloseTo(0.2025, 8));
  it('scales compensation for lightweight woven', () => expect(plan(createTatamiTechnicalFixture().valid, 'lightweight_woven').amountMm).toBeCloseTo(0.12, 8));
  it('enforces maximum compensation', () => { const result = plan(createSatinTechnicalFixture().valid, 'high_loft', { pullCompensation: { satinMm: 1, maximumMm: 0.3 } }); expect(result.amountMm).toBe(0.3); expect(result.warnings[0].code).toBe('PULL_COMPENSATION_CLAMPED'); });
  it('does not offset geometry', () => { const object = createTatamiTechnicalFixture().valid; const before = structuredClone(object); plan(object); expect(object).toEqual(before); });
  it('contains no compensated polygon', () => expect(JSON.stringify(plan(createTatamiTechnicalFixture().valid))).not.toMatch(/polygon|geometry/));
  it('uses no machine-specific adjustment', () => expect(JSON.stringify(plan(createTatamiTechnicalFixture().valid))).not.toMatch(/machine|ce01/i));
});
