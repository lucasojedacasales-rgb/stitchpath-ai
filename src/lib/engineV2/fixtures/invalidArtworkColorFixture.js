import { createExactArtworkThreadFixture } from './exactArtworkThreadFixture.js';

export function createInvalidArtworkColorFixture() {
  return createExactArtworkThreadFixture('not-a-color');
}
