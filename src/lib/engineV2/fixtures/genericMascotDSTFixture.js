import { createGenericMascotMachineFixture } from './genericMascotMachineFixture.js';
import { buildEngineV2DSTExport } from '../formatAdaptation/dstExportPipeline.js';

export function createGenericMascotDSTFixture(config = {}) {
  const source = createGenericMascotMachineFixture();
  return { ...source, dstExport: buildEngineV2DSTExport({ machineAdaptedStream: source.machineAdaptedStream, config: { label: 'GENERIC_MASCOT', ...config }, metadata: { fixture: 'generic-mascot-dst' } }) };
}

