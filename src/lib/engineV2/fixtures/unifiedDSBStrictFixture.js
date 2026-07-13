import { exportMachineAdaptedStreamV2 } from '../formatAdaptation/binaryExportFacade.js';
import { buildEngineV2DSBExport } from '../formatAdaptation/dsbExportPipeline.js';
import { createGenericMascotMachineFixture } from './genericMascotMachineFixture.js';

export function createUnifiedDSBStrictFixture(format = 'DSB') {
  const source = createGenericMascotMachineFixture(); const metadata = { fixture: 'unified-dsb-strict' }; const formatConfig = { label: 'GENERIC_MASCOT' };
  return { ...source, directResult: buildEngineV2DSBExport({ machineAdaptedStream: source.machineAdaptedStream, metadata, config: formatConfig }), unifiedResult: exportMachineAdaptedStreamV2({ machineAdaptedStream: source.machineAdaptedStream, format, metadata, formatConfig }) };
}
