import { createSyntheticDraftMaterialization, createSyntheticThreadDraft, createSyntheticThreadRegions } from './exactArtworkThreadFixture.js';

export function createBlockedThreadDependencyFixture() {
  const leaf = createSyntheticThreadDraft('blocked-leaf', 'invalid-color');
  const middle = createSyntheticThreadDraft('blocked-middle', '#22AA44', { dependencyIds: [leaf.id], layer: 1, role: 'foreground_fill' });
  const root = createSyntheticThreadDraft('blocked-root', '#111111', { dependencyIds: [middle.id], layer: 2, role: 'internal_detail', stitchType: 'satin' });
  const drafts = [root, leaf, middle];
  return { drafts, regions: createSyntheticThreadRegions(drafts), objectDraftMaterialization: createSyntheticDraftMaterialization(drafts), config: { policy: 'artwork_exact', blockOnUnassignedDependency: true } };
}
