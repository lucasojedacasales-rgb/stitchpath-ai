import { createSyntheticDraftMaterialization, createSyntheticThreadDraft, createSyntheticThreadRegions } from './exactArtworkThreadFixture.js';

export function createSharedThreadFixture(colors = ['#0F0', '#00FF00']) {
  const drafts = colors.map((color, index) => createSyntheticThreadDraft(`shared-${index + 1}`, color));
  return { drafts, regions: createSyntheticThreadRegions(drafts), objectDraftMaterialization: createSyntheticDraftMaterialization(drafts), config: { policy: 'artwork_exact' } };
}
