import { exportMachineAdaptedStreamV2 } from '../formatAdaptation/binaryExportFacade.js';
import { createGenericMascotMachineFixture } from './genericMascotMachineFixture.js';

export function createUnsupportedBinaryFormatFixture(format = 'PES') {
  const source = createGenericMascotMachineFixture();
  return { ...source, unifiedResult: exportMachineAdaptedStreamV2({ machineAdaptedStream: source.machineAdaptedStream, format, metadata: { fixture: 'unsupported-binary-format' } }) };
}
