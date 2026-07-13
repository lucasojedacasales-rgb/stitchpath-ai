export function createReferenceCaptureInvalidRealFixture(overrides = {}) {
  return {
    sourceKind: 'real', sourceName: overrides.sourceName ?? 'claimed-reference', sourceFingerprint: overrides.sourceFingerprint ?? null,
    evidenceType: overrides.evidenceType ?? 'binary_reference', evidenceReference: overrides.evidenceReference ?? null,
    verified: overrides.verified === true, notes: overrides.notes ?? 'Intentionally incomplete real-reference claim.',
  };
}
