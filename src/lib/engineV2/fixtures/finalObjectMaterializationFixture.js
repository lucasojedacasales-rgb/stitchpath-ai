import { materializeEmbroideryObjectDrafts } from '../materialization/objectDraftMaterializer.js';
import { createProposalReviewFixture } from './proposalReviewFixture.js';

export function createFinalObjectMaterializationFixture() {
  const source = createProposalReviewFixture();
  const objectDraftMaterialization = materializeEmbroideryObjectDrafts({ regions: source.regions, proposalPlan: source.proposalPlan });
  return { regions: source.regions, objectDraftMaterialization, drafts: objectDraftMaterialization.drafts, config: { policy: 'artwork_exact' } };
}
