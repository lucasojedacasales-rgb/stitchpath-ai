import { describe, expect, it } from 'vitest';
import { createEmbroideryObjectProposalV2, createRegionV2, validateEmbroideryObjectProposalPlan, validateEmbroideryObjectProposalV2 } from '../index.js';

const geometry = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
const normalized = [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.1, y: 0.1 }, { x: 0, y: 0.1 }];
function proposal(regionId = 'r1', role = 'base_fill', dependencies = []) {
  return createEmbroideryObjectProposalV2({ regionId, semanticRole: 'primary_shape', proposedEmbroideryRole: role, proposedStitchType: role === 'manual_review' ? 'manual' : 'tatami', geometryMm: geometry, dependencyIds: dependencies, planningConfidence: 0.9, evidence: [{ code: 'TEST', message: 'test' }] });
}
function plan(proposals) { return { proposals, summary: { decisionCoveragePercent: 100 }, metadata: { inputMutationsDetected: false } }; }

describe('Phase 4 object planning validation', () => {
  it('accepts a valid proposal', () => expect(validateEmbroideryObjectProposalV2(proposal()).valid).toBe(true));
  it.each(['threadId', 'machineColor', 'stitches', 'stitchCoordinates', 'commands', 'canonicalCommands'])('rejects forbidden production field %s', field => {
    expect(validateEmbroideryObjectProposalV2({ ...proposal(), [field]: [] }).errors.some(item => item.code === 'FORBIDDEN_PRODUCTION_FIELD')).toBe(true);
  });
  it('rejects non-deterministic proposal ID', () => expect(validateEmbroideryObjectProposalV2({ ...proposal(), id: 'random' }).errors.some(item => item.code === 'NON_DETERMINISTIC_PROPOSAL_ID')).toBe(true));
  it('rejects excluded proposal with active stitch type', () => expect(validateEmbroideryObjectProposalV2({ ...proposal(), proposedEmbroideryRole: 'excluded', id: 'proposal:r1:excluded', excluded: true }).valid).toBe(false));
  it('rejects active proposal with stitch type none', () => expect(validateEmbroideryObjectProposalV2({ ...proposal(), proposedStitchType: 'none' }).valid).toBe(false));
  it('detects duplicate proposal IDs and region decisions', () => {
    const regions = [createRegionV2({ id: 'r1', geometry: normalized })];
    const result = validateEmbroideryObjectProposalPlan(plan([proposal(), proposal()]), regions);
    expect(result.errors.some(item => item.code === 'DUPLICATE_PROPOSAL_ID')).toBe(true);
    expect(result.errors.some(item => item.code === 'MULTIPLE_REGION_DECISIONS')).toBe(true);
  });
  it('detects accepted region without decision', () => {
    const regions = [createRegionV2({ id: 'r1', geometry: normalized })];
    expect(validateEmbroideryObjectProposalPlan(plan([]), regions).errors.some(item => item.code === 'ACCEPTED_REGION_WITHOUT_DECISION')).toBe(true);
  });
  it('detects unknown dependencies', () => {
    const regions = [createRegionV2({ id: 'r1', geometry: normalized })];
    expect(validateEmbroideryObjectProposalPlan(plan([proposal('r1', 'base_fill', ['missing'])]), regions).errors.some(item => item.code === 'UNKNOWN_PROPOSAL_DEPENDENCY')).toBe(true);
  });
  it('detects self dependencies', () => {
    const regions = [createRegionV2({ id: 'r1', geometry: normalized })];
    expect(validateEmbroideryObjectProposalPlan(plan([proposal('r1', 'base_fill', ['proposal:r1:base_fill'])]), regions).errors.some(item => item.code === 'SELF_PROPOSAL_DEPENDENCY')).toBe(true);
  });
  it('detects dependency cycles', () => {
    const regions = [createRegionV2({ id: 'r1', geometry: normalized }), createRegionV2({ id: 'r2', geometry: normalized })];
    const result = validateEmbroideryObjectProposalPlan(plan([proposal('r1', 'base_fill', ['proposal:r2:base_fill']), proposal('r2', 'base_fill', ['proposal:r1:base_fill'])]), regions);
    expect(result.errors.some(item => item.code === 'PROPOSAL_DEPENDENCY_CYCLE')).toBe(true);
  });
  it('detects recorded input mutation', () => {
    const regions = [createRegionV2({ id: 'r1', geometry: normalized })];
    expect(validateEmbroideryObjectProposalPlan({ ...plan([proposal()]), metadata: { inputMutationsDetected: true } }, regions).errors.some(item => item.code === 'PLANNING_INPUT_MUTATION')).toBe(true);
  });
});
