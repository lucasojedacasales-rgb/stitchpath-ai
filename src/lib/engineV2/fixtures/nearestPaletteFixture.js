import { createExactArtworkThreadFixture } from './exactArtworkThreadFixture.js';
import { createThreadCatalogFixture } from './threadCatalogFixture.js';

export function createNearestPaletteFixture(color = '#13AA35', maximumAcceptedDeltaE = 6) {
  const fixture = createExactArtworkThreadFixture(color);
  return { ...fixture, config: { policy: 'catalog_nearest', catalog: createThreadCatalogFixture(), maximumAcceptedDeltaE } };
}
