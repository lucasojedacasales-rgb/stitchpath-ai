import { createEndToEndDSTFixture } from './endToEndDSTFixture.js';

export function createReferenceCaptureSyntheticFixture() {
  const fixture = createEndToEndDSTFixture();
  return { ...fixture, provenance: fixture.request.provenance, manifest: fixture.result.referenceCaptureManifest, gateResult: fixture.result.metadata.referenceCaptureGate };
}
