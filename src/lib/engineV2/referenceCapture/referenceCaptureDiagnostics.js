export function createReferenceCaptureDiagnostic({ gateResult, manifest }) {
  return Object.freeze({
    captureAllowed: gateResult?.captureAllowed === true,
    sourceKind: gateResult?.sourceKind ?? null,
    reasonCode: gateResult?.reasonCode ?? null,
    manifestCreated: manifest != null,
    manifestValid: manifest?.valid === true,
    syntheticReferenceCaptured: gateResult?.syntheticReferenceCaptured === true,
    realReferenceFixtureAvailable: false,
    realReferenceFixtureCaptured: false,
    physicalMachineAcceptanceVerified: false,
    readyForApplicationIntegration: false,
    readyForProductionRelease: false,
    blockingReasons: Object.freeze([...(gateResult?.blockingReasons || [])]),
    warnings: Object.freeze([...(gateResult?.warnings || [])]),
  });
}
