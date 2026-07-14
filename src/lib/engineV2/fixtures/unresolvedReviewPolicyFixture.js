import { createRegionV2 } from '../model.js';
import { materializeEmbroideryObjectDrafts } from '../materialization/objectDraftMaterializer.js';
import { runEngineV2RegionToBinary } from '../orchestration/regionToBinaryOrchestrator.js';
import { evaluateDraftMaterializationReadiness } from '../orchestration/reviewReadinessGate.js';
import { createSyntheticProposal, createSyntheticProposalPlan, createSyntheticRegionsForProposals } from './proposalReviewFixture.js';

export function createUnresolvedReviewPolicyFixture() {
  const proposals = ['one', 'two', 'three'].map(id => createSyntheticProposal(`unresolved-${id}`, 'manual_review', 'manual', { needsReview: true, confidence: 0.4, semanticRole: 'unknown' }));
  const proposalPlan = createSyntheticProposalPlan(proposals);
  const regions = createSyntheticRegionsForProposals(proposals);
  const draftMaterialization = materializeEmbroideryObjectDrafts({ regions, proposalPlan });
  return { proposals, proposalPlan, regions, draftMaterialization, readiness: evaluateDraftMaterializationReadiness({ proposalPlan, draftMaterialization }) };
}

export function createUnresolvedReviewEndToEndFixture() {
  const regions = ['one', 'two', 'three'].map((id, index) => createRegionV2({
    id: `unresolved-e2e-${id}`,
    geometry: [{ x: 0.05 + index * 0.3, y: 0.1 }, { x: 0.25 + index * 0.3, y: 0.1 }, { x: 0.25 + index * 0.3, y: 0.3 }, { x: 0.05 + index * 0.3, y: 0.3 }],
    visualColor: '#55AA66',
    semanticRole: 'unknown',
    confidence: 0,
    source: { fixture: 'synthetic_phase_13a1' },
  }));
  const request = { regions, designSizeMm: { width: 30, height: 35 }, format: 'DST', metadata: { fixture: 'unresolved-review-policy' }, provenance: { sourceKind: 'synthetic', sourceName: 'unresolved-review-policy', evidenceType: 'synthetic_fixture', evidenceReference: 'unresolvedReviewPolicyFixture', verified: true }, stageConfig: { binaryExport: { formatConfig: { label: 'REVIEW' } } } };
  return { request, result: runEngineV2RegionToBinary(request) };
}
