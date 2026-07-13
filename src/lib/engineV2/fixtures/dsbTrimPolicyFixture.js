import { createSyntheticDSBMachineStream } from './dsbBasicFormatFixture.js';

export const DSB_TRIM_NO_OUTPUT_ACKNOWLEDGEMENT = 'I acknowledge that DSB trim intents produce no binary records and physical trim support is not verified.';

export function createDSBTrimPolicyFixture(trimCount = 1) {
  const specs = [{ type: 'stitch', dxUnits: 5, dyUnits: 5 }];
  for (let index = 0; index < trimCount; index += 1) specs.push({ type: 'trim' });
  specs.push({ type: 'end' });
  return createSyntheticDSBMachineStream(specs, { fixtureId: `dsb-trim-${trimCount}` });
}

export function explicitDSBTrimNoOutputConfig(overrides = {}) {
  return { trimPolicy: 'explicit_no_output', trimNoOutputAcknowledgement: DSB_TRIM_NO_OUTPUT_ACKNOWLEDGEMENT, ...overrides };
}
