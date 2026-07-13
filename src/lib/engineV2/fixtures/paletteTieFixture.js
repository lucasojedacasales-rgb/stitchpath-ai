import { createExactArtworkThreadFixture } from './exactArtworkThreadFixture.js';

export function createPaletteTieFixture() {
  const fixture = createExactArtworkThreadFixture('#808080');
  return {
    ...fixture,
    config: {
      policy: 'catalog_nearest', maximumAcceptedDeltaE: 100,
      catalog: [
        { id: 'a-tie', name: 'Tie A', hex: '#707070', metadata: {} },
        { id: 'z-tie', name: 'Tie Z', hex: '#707070', metadata: {} },
      ],
    },
  };
}
