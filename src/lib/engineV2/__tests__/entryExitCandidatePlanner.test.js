import { describe, expect, it } from 'vitest';
import { analyzeEmbroideryObjectGeometry, planEntryExitCandidates, resolveTechnicalPlanningConfig } from '../index.js';
import { createEntryExitCandidateFixture } from '../fixtures/entryExitCandidateFixture.js';
import { createOutlineTechnicalFixture } from '../fixtures/outlineTechnicalFixture.js';
import { createRunningTechnicalFixture } from '../fixtures/runningTechnicalFixture.js';
import { createTatamiTechnicalFixture } from '../fixtures/tatamiTechnicalFixture.js';

const plan = (object, rawConfig = {}, metrics = analyzeEmbroideryObjectGeometry(object)) => planEntryExitCandidates({ object, geometryMetrics: metrics, relatedObjects: [], config: resolveTechnicalPlanningConfig(rawConfig) });

describe('Phase 7 entry and exit candidates', () => {
  it('creates deterministic candidate IDs', () => { const result = plan(createTatamiTechnicalFixture().valid); expect(result.entryCandidates[0].id).toMatch(/^candidate:object:tatami-valid:entry:/); });
  it('produces boundary candidates on source geometry', () => expect(plan(createTatamiTechnicalFixture().valid).entryCandidates.some(item => item.sourceType === 'boundary_vertex' && item.valid)).toBe(true));
  it('produces a valid interior tatami candidate', () => expect(plan(createTatamiTechnicalFixture().valid).entryCandidates.some(item => item.sourceType === 'interior_point' && item.valid)).toBe(true));
  it('rejects an interior candidate inside an explicit hole', () => { const fixture = createEntryExitCandidateFixture(); const metrics = { ...analyzeEmbroideryObjectGeometry(fixture.object), validInteriorPoint: fixture.holePoint }; const result = plan(fixture.object, {}, metrics); expect(result.entryCandidates.find(item => item.sourceType === 'interior_point').valid).toBe(false); });
  it('removes near-duplicate cardinal and vertex candidates', () => { const result = plan(createTatamiTechnicalFixture().valid); const points = result.entryCandidates.map(item => `${item.point.x}:${item.point.y}`); expect(new Set(points).size).toBe(points.length); });
  it('respects maximum candidate count', () => expect(plan(createTatamiTechnicalFixture().valid, { entryExit: { maximumCandidatesPerObject: 2 } }).entryCandidates).toHaveLength(2));
  it('is deterministic across calls', () => { const object = createTatamiTechnicalFixture().valid; expect(plan(object)).toEqual(plan(object)); });
  it('is independent of closed polygon orientation', () => { const object = createTatamiTechnicalFixture().valid; const reversed = { ...object, geometry: [...object.geometry].reverse() }; expect(plan(reversed).entryCandidates.map(item => item.point)).toEqual(plan(object).entryCandidates.map(item => item.point)); });
  it('uses endpoints for genuine open running paths', () => expect(plan(createRunningTechnicalFixture().open).entryCandidates).toHaveLength(2));
  it('creates outline start candidates for closed outlines', () => expect(plan(createRunningTechnicalFixture().closedOutline).entryCandidates.every(item => item.sourceType === 'outline_start_candidate' || item.sourceType === 'cardinal_boundary')).toBe(true));
  it('keeps disconnected outlines in separate candidate sets', () => { const fixture = createOutlineTechnicalFixture(); expect(plan(fixture.first).entryCandidates.every(item => item.objectId === fixture.first.id)).toBe(true); expect(plan(fixture.second).entryCandidates.every(item => item.objectId === fixture.second.id)).toBe(true); });
  it('creates both entry and exit dispositions', () => { const result = plan(createTatamiTechnicalFixture().valid); expect(result.entryCandidates.every(item => item.kind === 'entry')).toBe(true); expect(result.exitCandidates.every(item => item.kind === 'exit')).toBe(true); });
  it('does not select a final pair', () => expect(plan(createTatamiTechnicalFixture().valid).finalPairSelected).toBe(false));
  it.each(['route', 'jumps', 'stitches'])('does not generate %s', field => expect(JSON.stringify(plan(createTatamiTechnicalFixture().valid))).not.toContain(`"${field}"`));
});
