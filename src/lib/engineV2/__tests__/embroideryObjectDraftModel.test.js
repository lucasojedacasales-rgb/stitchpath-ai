import { describe, expect, it } from 'vitest';
import { buildDraftPlanningParameters, createEmbroideryObjectDraftV2, draftIdFor, validateEmbroideryObjectDraftV2, validateEmbroideryObjectV2 } from '../index.js';
import { createSyntheticProposal } from '../fixtures/proposalReviewFixture.js';

const proposal = createSyntheticProposal('draft-model', 'base_fill', 'tatami');
const decision = { id: `review:${proposal.id}`, action: 'accept', approvedEmbroideryRole: 'base_fill', approvedStitchType: 'tatami', confidence: 0.9 };
function input() { return { proposalId: proposal.id, regionId: proposal.regionId, role: 'base_fill', stitchType: 'tatami', geometryMm: proposal.geometryMm, holesMm: proposal.holesMm, visualColor: proposal.visualColor, layer: proposal.layer, dependencyIds: [], planningConfidence: 0.9, materializationConfidence: 0.9, parameters: buildDraftPlanningParameters(proposal, decision), evidence: [{ code: 'TEST' }], reviewDecisionId: decision.id }; }

describe('Phase 5 unthreaded draft model', () => {
  it('creates a valid draft', () => expect(validateEmbroideryObjectDraftV2(createEmbroideryObjectDraftV2(input())).valid).toBe(true));
  it('uses deterministic draft ID', () => expect(createEmbroideryObjectDraftV2(input()).id).toBe(draftIdFor(proposal.id)));
  it('deeply freezes geometry and parameters', () => { const draft = createEmbroideryObjectDraftV2(input()); expect(Object.isFrozen(draft.geometryMm)).toBe(true); expect(Object.isFrozen(draft.parameters.deferred)).toBe(true); });
  it('contains no threadId property', () => expect(createEmbroideryObjectDraftV2(input())).not.toHaveProperty('threadId'));
  it('contains no machineColor property', () => expect(createEmbroideryObjectDraftV2(input())).not.toHaveProperty('machineColor'));
  it('keeps thread assignment pending', () => expect(createEmbroideryObjectDraftV2(input()).threadAssignmentStatus).toBe('pending'));
  it.each(['geometryMm', 'holesMm', 'visualColor', 'layer'])('preserves %s exactly', field => expect(createEmbroideryObjectDraftV2(input())[field]).toEqual(proposal[field]));
  it('preserves planning metadata', () => expect(createEmbroideryObjectDraftV2(input()).parameters.planning.sourcePlanningConfidence).toBe(proposal.planningConfidence));
  it.each([
    ['requiresTatamiGenerator', true], ['requiresSatinGenerator', false], ['requiresRunningGenerator', false], ['requiresManualGenerator', false],
  ])('sets generator requirement %s', (field, expected) => expect(createEmbroideryObjectDraftV2(input()).parameters.generatorRequirements[field]).toBe(expected));
  it.each(['threadAssignment', 'stitchGeneration', 'underlayPlanning', 'fillAngleSelection', 'densitySelection', 'pullCompensation', 'entryExitPlanning', 'globalSequencing', 'machineAdaptation'])('defers %s', field => expect(createEmbroideryObjectDraftV2(input()).parameters.deferred[field]).toBe(true));
  it('keeps entry candidates empty', () => expect(createEmbroideryObjectDraftV2(input()).entryCandidates).toEqual([]));
  it('keeps exit candidates empty', () => expect(createEmbroideryObjectDraftV2(input()).exitCandidates).toEqual([]));
  it.each(['density', 'angle', 'stitchLength', 'compensation', 'underlayType'])('does not include production parameter %s', field => expect(JSON.stringify(createEmbroideryObjectDraftV2(input()).parameters)).not.toContain(`"${field}"`));
  it('does not create a final object without a real thread ID', () => {
    const finalCandidate = { id: 'object-1', regionId: 'draft-model', role: 'base_fill', stitchType: 'tatami', geometry: proposal.geometryMm, dependencyIds: [], entryCandidates: [], exitCandidates: [] };
    expect(validateEmbroideryObjectV2(finalCandidate).errors.some(item => item.code === 'MISSING_THREAD_REFERENCE')).toBe(true);
  });
});
