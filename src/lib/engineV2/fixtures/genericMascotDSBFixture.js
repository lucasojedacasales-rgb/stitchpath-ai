import { createGenericMascotMachineFixture } from './genericMascotMachineFixture.js';
import { buildEngineV2DSBExport } from '../formatAdaptation/dsbExportPipeline.js';

export function createGenericMascotDSBFixture(config = {}) {
  const source = createGenericMascotMachineFixture();
  return { ...source, dsbExport: buildEngineV2DSBExport({ machineAdaptedStream: source.machineAdaptedStream, config: { label: 'GENERIC_MASCOT', ...config }, metadata: { fixture: 'generic-mascot-dsb' } }) };
}
