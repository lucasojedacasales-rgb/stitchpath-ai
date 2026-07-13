import { createRegionV2 } from '../model.js';
import { createEmbroideryObjectDraftV2 } from '../materialization/embroideryObjectDraftModel.js';

const geometryMm = Object.freeze([{ x: 10, y: 10 }, { x: 40, y: 10 }, { x: 40, y: 40 }, { x: 10, y: 40 }]);
const geometry = Object.freeze([{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.1 }, { x: 0.4, y: 0.4 }, { x: 0.1, y: 0.4 }]);

export function createSyntheticThreadDraft(id, visualColor = '#12AB34', options = {}) {
  const proposalId = options.proposalId || `proposal:${id}`;
  return createEmbroideryObjectDraftV2({
    id: options.id || `draft:${proposalId}`,
    proposalId,
    regionId: options.regionId || id,
    role: options.role || 'base_fill',
    stitchType: options.stitchType || 'tatami',
    geometryMm: options.geometryMm || geometryMm,
    holesMm: options.holesMm || [],
    visualColor,
    layer: options.layer ?? 0,
    dependencyIds: options.dependencyIds || [],
    planningConfidence: options.planningConfidence ?? 0.96,
    materializationConfidence: options.materializationConfidence ?? 0.94,
    status: 'materialized_draft',
    threadAssignmentStatus: 'pending',
    entryCandidates: [],
    exitCandidates: [],
    parameters: {
      planning: { synthetic: true },
      generatorRequirements: { requiresTatamiGenerator: (options.stitchType || 'tatami') === 'tatami' },
      deferred: {
        threadAssignment: true, stitchGeneration: true, underlayPlanning: true, fillAngleSelection: true,
        densitySelection: true, pullCompensation: true, entryExitPlanning: true, globalSequencing: true, machineAdaptation: true,
      },
    },
    evidence: [{ code: 'SYNTHETIC_PHASE_6_FIXTURE' }],
    reviewDecisionId: `review-decision:${proposalId}`,
    source: { fixture: 'synthetic_phase_6' },
  });
}

export function createSyntheticThreadRegions(drafts) {
  return drafts.map((draft, index) => createRegionV2({ id: draft.regionId, geometry: geometry.map(point => ({ x: point.x + index * 0.05, y: point.y })), visualColor: draft.visualColor, source: { fixture: 'synthetic_phase_6' } }));
}

export function createSyntheticDraftMaterialization(drafts) {
  return { version: '2-object-draft-materialization', drafts, byDraftId: Object.fromEntries(drafts.map(item => [item.id, item])), valid: true, errors: [], warnings: [], summary: { materializedDraftCount: drafts.length }, metadata: { inputMutationsDetected: false } };
}

export function createExactArtworkThreadFixture(color = '#12AB34') {
  const drafts = [createSyntheticThreadDraft('exact-artwork', color)];
  return { drafts, regions: createSyntheticThreadRegions(drafts), objectDraftMaterialization: createSyntheticDraftMaterialization(drafts), config: { policy: 'artwork_exact' } };
}
