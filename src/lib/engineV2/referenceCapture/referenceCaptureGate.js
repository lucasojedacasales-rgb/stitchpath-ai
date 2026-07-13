import { createReferenceCaptureGateResultV2, createReferenceSourceProvenanceV2, createPhysicalMachineTestV2 } from './referenceCaptureModel.js';
import { resolveReferenceCaptureConfig, validateReferenceCaptureConfig } from './referenceCaptureConfig.js';
import { validatePhysicalMachineTestV2, validateReferenceCaptureGateResult, validateReferenceSourceProvenanceV2 } from './referenceCaptureValidation.js';

const reason = (code, message) => ({ code, message });

export function evaluateReferenceCaptureGate({ pipelineResult, provenance, physicalMachineTest, config: rawConfig = {} }) {
  const config = resolveReferenceCaptureConfig(rawConfig); const configValidation = validateReferenceCaptureConfig(rawConfig);
  const source = createReferenceSourceProvenanceV2(provenance); const sourceValidation = validateReferenceSourceProvenanceV2(source);
  const physical = createPhysicalMachineTestV2(physicalMachineTest); const physicalValidation = validatePhysicalMachineTestV2(physical);
  const blockingReasons = [...configValidation.errors, ...sourceValidation.errors, ...physicalValidation.errors]; const warnings = [];
  if (pipelineResult?.pipelineCompleted !== true || pipelineResult?.valid !== true) blockingReasons.push(reason('PIPELINE_NOT_CAPTURE_READY', 'A valid completed pipeline is required for reference capture.'));
  if (source.sourceKind === 'synthetic' && !config.allowSyntheticCapture) blockingReasons.push(reason('SYNTHETIC_REFERENCE_CAPTURE_DISABLED', 'Synthetic reference capture is disabled.'));
  if (source.sourceKind === 'real') {
    if (!sourceValidation.valid) {
      if (!blockingReasons.some(item => item.code === 'REAL_REFERENCE_PROVENANCE_INCOMPLETE')) blockingReasons.push(reason('REAL_REFERENCE_PROVENANCE_INCOMPLETE', 'Real provenance is incomplete.'));
    } else blockingReasons.push(reason('REAL_REFERENCE_FIXTURE_NOT_AVAILABLE', 'No genuine tracked real-reference fixture is available in Phase 13A.'));
  }
  if (physical.status !== 'not_tested') blockingReasons.push(reason('PHYSICAL_MACHINE_ACCEPTANCE_NOT_AVAILABLE', 'Phase 13A cannot capture or verify physical-machine acceptance.'));
  const captureAllowed = blockingReasons.length === 0 && source.sourceKind === 'synthetic';
  const draft = createReferenceCaptureGateResultV2({ captureAllowed, sourceKind: source.sourceKind, reasonCode: blockingReasons[0]?.code ?? null, syntheticReferenceCaptured: captureAllowed, blockingReasons, warnings });
  const validation = validateReferenceCaptureGateResult(draft);
  return validation.valid ? draft : createReferenceCaptureGateResultV2({ ...draft, captureAllowed: false, syntheticReferenceCaptured: false, reasonCode: validation.errors[0]?.code, blockingReasons: [...blockingReasons, ...validation.errors] });
}
