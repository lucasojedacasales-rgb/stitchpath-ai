import { buildEngineV2DSBExport } from '../formatAdaptation/dsbExportPipeline.js';
import { createDSBColorSequenceFixture } from './dsbColorSequenceFixture.js';

export function createDSBHeaderFixture(config = {}) {
  const machineAdaptedStream = createDSBColorSequenceFixture(4);
  return buildEngineV2DSBExport({ machineAdaptedStream, config: { label: 'DSB_HEADER', ...config }, metadata: { fixture: 'dsb-header' } });
}
