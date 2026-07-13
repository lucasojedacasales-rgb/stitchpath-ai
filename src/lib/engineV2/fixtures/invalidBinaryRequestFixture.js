import { exportMachineAdaptedStreamV2 } from '../formatAdaptation/binaryExportFacade.js';
import { createGenericMascotMachineFixture } from './genericMascotMachineFixture.js';

export function createInvalidBinaryRequestFixture(kind = 'missing_format') {
  const source = createGenericMascotMachineFixture();
  if (kind === 'invalid_source') return { ...source, unifiedResult: exportMachineAdaptedStreamV2({ machineAdaptedStream: { ...structuredClone(source.machineAdaptedStream), valid: false }, format: 'DST' }) };
  if (kind === 'fallback_enabled') return { ...source, unifiedResult: exportMachineAdaptedStreamV2({ machineAdaptedStream: source.machineAdaptedStream, format: 'DST', config: { allowFormatFallback: true } }) };
  return { ...source, unifiedResult: exportMachineAdaptedStreamV2({ machineAdaptedStream: source.machineAdaptedStream, metadata: { fixture: 'missing-binary-format' } }) };
}
