import { exportMachineAdaptedStreamV2 } from '../formatAdaptation/binaryExportFacade.js';
import { buildEngineV2DSTExport } from '../formatAdaptation/dstExportPipeline.js';
import { createGenericMascotMachineFixture } from './genericMascotMachineFixture.js';

export function createUnifiedDSTExportFixture(format = 'DST', formatConfig = {}) {
  const source = createGenericMascotMachineFixture(); const metadata = { fixture: 'unified-dst-export' }; const config = { label: 'GENERIC_MASCOT', ...formatConfig };
  return { ...source, directResult: buildEngineV2DSTExport({ machineAdaptedStream: source.machineAdaptedStream, metadata, config }), unifiedResult: exportMachineAdaptedStreamV2({ machineAdaptedStream: source.machineAdaptedStream, format, metadata, formatConfig: config }) };
}
