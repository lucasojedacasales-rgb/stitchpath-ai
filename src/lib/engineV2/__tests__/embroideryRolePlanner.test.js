import { describe, expect, it } from 'vitest';
import {
  createEmbroideryObjectProposalV2, createSemanticRegionAssessmentV2, ingestV1RegionsToRegionGraphV2,
  planEmbroideryRoleForRegion, resolveObjectPlanningConfig,
} from '../index.js';

function raw(id, regionClass, color, x1, y1, x2, y2, extra = {}) {
  return { id, color, region_class: regionClass, path_points: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]], ...extra };
}

function plan(source, role, config = {}, confidence = 0.92) {
  const ingestion = ingestV1RegionsToRegionGraphV2([source], { coordinateSpace: 'normalized' });
  const region = ingestion.regions[0];
  const semanticAssessment = createSemanticRegionAssessmentV2({ regionId: region.id, semanticRole: role, confidence, evidence: [{ code: 'TEST', message: 'Synthetic test assessment.' }] });
  return planEmbroideryRoleForRegion({ region, graph: ingestion.graph, semanticAssessment, config: resolveObjectPlanningConfig(config) });
}

describe('Phase 4 embroidery role planning', () => {
  it('creates immutable proposals with deterministic IDs', () => {
    const input = { regionId: 'r1', proposedEmbroideryRole: 'base_fill', proposedStitchType: 'tatami', geometryMm: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], evidence: [{ code: 'T', message: 'test' }] };
    const proposal = createEmbroideryObjectProposalV2(input);
    expect(proposal.id).toBe('proposal:r1:base_fill');
    expect(Object.isFrozen(proposal)).toBe(true);
    expect(proposal).not.toHaveProperty('threadId');
    expect(proposal).not.toHaveProperty('machineColor');
  });
  it('plans primary shape as base tatami fill', () => expect(plan(raw('body', 'body', '#55aa66', 0.1, 0.1, 0.9, 0.9), 'primary_shape')).toMatchObject({ proposedEmbroideryRole: 'base_fill', proposedStitchType: 'tatami' }));
  it('plans secondary shape as foreground tatami fill', () => expect(plan(raw('face', 'face', '#eeeeee', 0.2, 0.2, 0.8, 0.8), 'secondary_shape')).toMatchObject({ proposedEmbroideryRole: 'foreground_fill', proposedStitchType: 'tatami' }));
  it('plans very thin internal feature as running', () => expect(plan(raw('eye', 'eye', '#111111', 0.1, 0.1, 0.11, 0.4), 'internal_feature').proposedStitchType).toBe('running'));
  it('plans narrow elongated internal feature as satin', () => expect(plan(raw('detail', 'detail', '#111111', 0.2, 0.1, 0.24, 0.5), 'internal_feature').proposedStitchType).toBe('satin'));
  it('plans large closed internal feature as tatami', () => expect(plan(raw('detail', 'detail', '#111111', 0.2, 0.2, 0.4, 0.4), 'internal_feature').proposedStitchType).toBe('tatami'));
  it('sends ambiguous internal feature to manual review', () => expect(plan(raw('detail', 'detail', '#111111', 0.2, 0.2, 0.225, 0.225), 'internal_feature').proposedEmbroideryRole).toBe('manual_review'));
  it('plans thin dark mark as running', () => expect(plan(raw('line', 'line', '#111111', 0.1, 0.1, 0.11, 0.4), 'dark_mark').proposedStitchType).toBe('running'));
  it('plans stable narrow dark mark as satin', () => expect(plan(raw('line', 'line', '#111111', 0.2, 0.1, 0.24, 0.5), 'dark_mark').proposedStitchType).toBe('satin'));
  it('plans meaningful closed dark area as tatami', () => expect(plan(raw('dark', 'dark_detail', '#111111', 0.2, 0.2, 0.4, 0.4), 'dark_mark').proposedStitchType).toBe('tatami'));
  it('does not make dark color alone an outline', () => expect(plan(raw('dark', 'unknown', '#000000', 0.1, 0.1, 0.9, 0.9), 'dark_mark').proposedEmbroideryRole).toBe('dark_detail'));
  it('excludes negative space explicitly', () => expect(plan(raw('hole', 'hole', '#fff', 0.2, 0.2, 0.4, 0.4), 'negative_space')).toMatchObject({ excluded: true, exclusionReason: 'explicit_negative_space' }));
  it('excludes background by default', () => expect(plan(raw('bg', 'background', '#fff', 0, 0, 1, 1), 'background')).toMatchObject({ excluded: true, exclusionReason: 'background_excluded_by_policy' }));
  it('includes background only when configured', () => expect(plan(raw('bg', 'background', '#fff', 0, 0, 1, 1), 'background', { includeBackground: true }).proposedEmbroideryRole).toBe('base_fill'));
  it('sends unknown role to manual review', () => expect(plan(raw('x', 'unknown', '#888', 0.2, 0.2, 0.4, 0.4), 'unknown').needsReview).toBe(true));
});
