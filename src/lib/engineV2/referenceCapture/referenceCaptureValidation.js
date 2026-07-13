import { PHYSICAL_MACHINE_TEST_STATUSES, REFERENCE_EVIDENCE_TYPES, REFERENCE_SOURCE_KINDS } from './referenceCaptureModel.js';

const issue = (code, path, message) => ({ code, path, message });
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;

export function validateReferenceSourceProvenanceV2(provenance) {
  const errors = [];
  if (!REFERENCE_SOURCE_KINDS.includes(provenance?.sourceKind)) errors.push(issue('REFERENCE_SOURCE_KIND_INVALID', 'sourceKind', 'Reference source kind must be synthetic or real.'));
  if (!REFERENCE_EVIDENCE_TYPES.includes(provenance?.evidenceType)) errors.push(issue('REFERENCE_EVIDENCE_TYPE_INVALID', 'evidenceType', 'Reference evidence type is invalid.'));
  if (provenance?.sourceKind === 'synthetic') {
    if (provenance.evidenceType !== 'synthetic_fixture') errors.push(issue('SYNTHETIC_REFERENCE_EVIDENCE_INVALID', 'evidenceType', 'Synthetic references require synthetic_fixture evidence.'));
    if (!nonEmpty(provenance.sourceName) || !nonEmpty(provenance.sourceFingerprint)) errors.push(issue('SYNTHETIC_REFERENCE_IDENTITY_INCOMPLETE', 'sourceName', 'Synthetic reference identity and fingerprint are required.'));
  }
  if (provenance?.sourceKind === 'real') {
    if (!nonEmpty(provenance.sourceName) || !nonEmpty(provenance.sourceFingerprint) || !nonEmpty(provenance.evidenceReference) || provenance.evidenceType === 'synthetic_fixture' || provenance.verified !== true) errors.push(issue('REAL_REFERENCE_PROVENANCE_INCOMPLETE', 'provenance', 'Real reference provenance requires verified non-synthetic evidence, identity, fingerprint, and evidence reference.'));
  }
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function validatePhysicalMachineTestV2(test) {
  const errors = [];
  if (!PHYSICAL_MACHINE_TEST_STATUSES.includes(test?.status)) errors.push(issue('PHYSICAL_MACHINE_TEST_STATUS_INVALID', 'status', 'Physical-machine test status is invalid.'));
  if (test?.recognized && !['recognized', 'sew_started', 'sew_completed'].includes(test.status)) errors.push(issue('PHYSICAL_RECOGNITION_STATUS_INCONSISTENT', 'recognized', 'Recognized requires a recognized or sewing status.'));
  if (test?.sewStarted && !['sew_started', 'sew_completed'].includes(test.status)) errors.push(issue('PHYSICAL_SEW_START_STATUS_INCONSISTENT', 'sewStarted', 'Sew started requires a sewing status.'));
  if (test?.sewCompleted && test.status !== 'sew_completed') errors.push(issue('PHYSICAL_SEW_COMPLETION_STATUS_INCONSISTENT', 'sewCompleted', 'Sew completed requires sew_completed status.'));
  if (test?.status !== 'not_tested' && (!nonEmpty(test.machineName) || !nonEmpty(test.evidenceReference))) errors.push(issue('PHYSICAL_MACHINE_EVIDENCE_INCOMPLETE', 'physicalMachineTest', 'A physical test requires machine name and evidence reference.'));
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function validateReferenceCaptureGateResult(gateResult) {
  const errors = [];
  if (gateResult?.realReferenceFixtureAvailable || gateResult?.realReferenceFixtureCaptured) errors.push(issue('REAL_REFERENCE_FIXTURE_CLAIM_FORBIDDEN', 'realReferenceFixtureAvailable', 'No real fixture is available or captured in Phase 13A.'));
  if (gateResult?.physicalMachineAcceptanceVerified) errors.push(issue('PHYSICAL_MACHINE_ACCEPTANCE_CLAIM_FORBIDDEN', 'physicalMachineAcceptanceVerified', 'Physical acceptance is not verified in Phase 13A.'));
  if (gateResult?.readyForApplicationIntegration) errors.push(issue('APPLICATION_READINESS_CLAIM_FORBIDDEN', 'readyForApplicationIntegration', 'Application integration is not ready.'));
  if (gateResult?.readyForProductionRelease) errors.push(issue('PRODUCTION_READINESS_CLAIM_FORBIDDEN', 'readyForProductionRelease', 'Production release is not ready.'));
  if (gateResult?.sourceKind === 'real' && gateResult.captureAllowed) errors.push(issue('REAL_REFERENCE_CAPTURE_FORBIDDEN_PHASE_13A', 'captureAllowed', 'Real capture is not available in Phase 13A.'));
  if (gateResult?.syntheticReferenceCaptured && (!gateResult.captureAllowed || gateResult.sourceKind !== 'synthetic')) errors.push(issue('SYNTHETIC_CAPTURE_STATUS_INCONSISTENT', 'syntheticReferenceCaptured', 'Synthetic capture requires an allowed synthetic source.'));
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function validateEngineV2ReferenceCaptureManifest(manifest) {
  const errors = [];
  const provenance = validateReferenceSourceProvenanceV2(manifest?.sourceProvenance); errors.push(...provenance.errors);
  const physical = validatePhysicalMachineTestV2(manifest?.physicalMachineTest); errors.push(...physical.errors);
  if (!/^2-reference-capture-manifest$/.test(manifest?.version || '')) errors.push(issue('REFERENCE_MANIFEST_VERSION_INVALID', 'version', 'Reference manifest version is invalid.'));
  if (!/^[0-9a-f]{8}$/.test(manifest?.requestFingerprint || '')) errors.push(issue('REFERENCE_REQUEST_FINGERPRINT_INVALID', 'requestFingerprint', 'Request fingerprint must be deterministic hexadecimal text.'));
  if (!manifest?.stageFingerprints || Object.keys(manifest.stageFingerprints).length !== 11) errors.push(issue('REFERENCE_STAGE_FINGERPRINT_COVERAGE_INCOMPLETE', 'stageFingerprints', 'All eleven stage fingerprints are required.'));
  if (manifest?.sourceProvenance?.sourceKind === 'synthetic' && manifest?.physicalMachineTest?.status !== 'not_tested') errors.push(issue('SYNTHETIC_PHYSICAL_TEST_CLAIM_FORBIDDEN', 'physicalMachineTest', 'Synthetic fixture cannot claim a physical-machine test.'));
  if (manifest?.metadata?.realReferenceFixtureAvailable || manifest?.metadata?.physicalMachineAcceptanceVerified) errors.push(issue('REFERENCE_MANIFEST_READINESS_CLAIM_FORBIDDEN', 'metadata', 'Real or physical acceptance cannot be claimed.'));
  return { valid: errors.length === 0, errors, warnings: [] };
}
