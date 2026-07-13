import { describe, expect, it } from 'vitest';
import { analyzeEmbroideryObjectGeometry, normalizeFillAngle, planFillAngle, resolveTechnicalPlanningConfig } from '../index.js';
import { createGenericMascotTechnicalFixture } from '../fixtures/genericMascotTechnicalFixture.js';
import { createRunningTechnicalFixture } from '../fixtures/runningTechnicalFixture.js';
import { createSatinTechnicalFixture } from '../fixtures/satinTechnicalFixture.js';
import { createTatamiTechnicalFixture } from '../fixtures/tatamiTechnicalFixture.js';

const config = resolveTechnicalPlanningConfig();
const plan = (object, parentSpecification = null) => planFillAngle({ object, geometryMetrics: analyzeEmbroideryObjectGeometry(object), parentSpecification, config });

describe('Phase 7 fill angle planner', () => {
  it.each([[-10, 170], [180, 0], [225, 45], [360, 0]])('normalizes %s to %s', (value, expected) => expect(normalizeFillAngle(value)).toBe(expected));
  it('plans tatami perpendicular to its principal axis', () => expect(plan(createTatamiTechnicalFixture().valid)).toMatchObject({ applicable: true, strategy: 'perpendicular_to_principal_axis', normalizedAngleDegrees: 90 }));
  it('plans satin along its principal axis', () => expect(plan(createSatinTechnicalFixture().valid)).toMatchObject({ applicable: true, strategy: 'principal_axis', normalizedAngleDegrees: 0 }));
  it('alternates a structurally dependent fill from its parent', () => { const parentSpecification = { fillAnglePlan: { applicable: true, normalizedAngleDegrees: 45 } }; expect(plan(createGenericMascotTechnicalFixture().objects[1], parentSpecification)).toMatchObject({ strategy: 'alternate_from_parent', normalizedAngleDegrees: 135, parentAngleDegrees: 45 }); });
  it('does not let sibling array order affect angles', () => { const object = createTatamiTechnicalFixture().valid; expect(plan(object)).toEqual(plan(object)); });
  it('marks running angle not applicable', () => expect(plan(createRunningTechnicalFixture().open).strategy).toBe('not_applicable'));
  it('marks running outlines not applicable', () => expect(plan(createRunningTechnicalFixture().closedOutline).applicable).toBe(false));
  it('accepts an explicit sourced override', () => { const object = { ...createTatamiTechnicalFixture().valid, parameters: { technicalPlanning: { fillAngleDegrees: 200, fillAngleSource: 'synthetic_test' } } }; expect(plan(object)).toMatchObject({ strategy: 'explicit_override', normalizedAngleDegrees: 20 }); });
  it('rejects an unsourced override for manual review', () => { const object = { ...createTatamiTechnicalFixture().valid, parameters: { technicalPlanning: { fillAngleDegrees: 30 } } }; expect(plan(object).strategy).toBe('manual_required'); });
  it('does not mutate object geometry', () => { const object = createTatamiTechnicalFixture().valid; const before = structuredClone(object); plan(object); expect(object).toEqual(before); });
});
