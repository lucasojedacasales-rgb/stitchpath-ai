import { exportMachineAdaptedStreamV2 } from '../formatAdaptation/binaryExportFacade.js';
import { buildEngineV2DSBExport } from '../formatAdaptation/dsbExportPipeline.js';
import { createGenericMascotMachineFixture } from './genericMascotMachineFixture.js';
import { explicitDSBTrimNoOutputConfig } from './dsbTrimPolicyFixture.js';

export function createUnifiedDSBExplicitFixture(format = 'DSB') {
  const source = createGenericMascotMachineFixture(); const metadata = { fixture: 'unified-dsb-explicit' };
  const formatConfig = explicitDSBTrimNoOutputConfig({ label: 'GENERIC_MASCOT' });
  return { ...source, formatConfig, directResult: buildEngineV2DSBExport({ machineAdaptedStream: source.machineAdaptedStream, metadata, config: formatConfig }), unifiedResult: exportMachineAdaptedStreamV2({ machineAdaptedStream: source.machineAdaptedStream, format, metadata, formatConfig }) };
}
