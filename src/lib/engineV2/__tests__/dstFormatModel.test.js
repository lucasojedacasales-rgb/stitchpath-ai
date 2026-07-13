import { describe, expect, it } from 'vitest';
import { createDSTBinaryAcceptanceResultV2, createDSTBinaryRecordSpanV2, createDSTEncoderCommandV2, createDSTFormatAdaptationV2, createDSTSourceCommandDispositionV2, dstBinaryRecordSpanId, dstDispositionId, dstEncoderCommandId } from '../formatAdaptation/dstFormatModel.js';

describe('Phase 12B DST format models', () => {
  const disposition = createDSTSourceCommandDispositionV2({ sourceMachineCommandId: 'machine:1', sourceAdaptedIndex: 1, sourceType: 'stitch', status: 'adapted', dstCommandCount: 1, expectedBinaryRecordCount: 1 });
  const command = createDSTEncoderCommandV2({ dstCommandIndex: 0, type: 'stitch', x: 1, y: 2, color: 'thread:1', sourceMachineCommandId: 'machine:1', sourceAdaptedIndex: 1, sourceCanonicalCommandId: 'canonical:1', source: { adapterDeltaUnits: { dxUnits: 10, dyUnits: 20 } } });
  const span = createDSTBinaryRecordSpanV2({ sourceMachineCommandId: 'machine:1', sourceDSTCommandIds: [command.id], expectedFirstRecordIndex: 0, expectedLastRecordIndex: 0, expectedRecordCount: 1 });
  it('freezes disposition', () => expect(Object.isFrozen(disposition)).toBe(true));
  it('freezes encoder command', () => expect(Object.isFrozen(command)).toBe(true));
  it('freezes record span', () => expect(Object.isFrozen(span)).toBe(true));
  it('creates source lookup', () => expect(createDSTFormatAdaptationV2({ dispositions: [disposition] }).bySourceMachineCommandId['machine:1'].id).toBe(disposition.id));
  it('creates command lookup', () => expect(createDSTFormatAdaptationV2({ encoderCommands: [command] }).byDSTCommandId[command.id].type).toBe('stitch'));
  it('copies binary bytes', () => { const bytes = new Uint8Array([1, 2]); const result = createDSTBinaryAcceptanceResultV2({ bytes }); bytes[0] = 9; expect(result.bytes[0]).toBe(1); });
  it('uses DST acceptance version', () => expect(createDSTBinaryAcceptanceResultV2().version).toBe('2-dst-binary-acceptance'));
  it('uses DST adaptation version', () => expect(createDSTFormatAdaptationV2().version).toBe('2-dst-format-adaptation'));
  it.each(Array.from({ length: 32 }, (_, index) => index))('creates deterministic command id %i', index => expect(dstEncoderCommandId(index, 'jump')).toBe(`dst-command:${String(index).padStart(8, '0')}:jump`));
  it.each(['adapted', 'zero_output', 'blocked'])('preserves disposition status %s', status => expect(createDSTSourceCommandDispositionV2({ sourceMachineCommandId: status, status }).status).toBe(status));
  it.each(Array.from({ length: 12 }, (_, index) => `source:${index}`))('creates deterministic lineage IDs for %s', id => {
    expect(dstDispositionId(id)).toBe(`dst-disposition:${id}`); expect(dstBinaryRecordSpanId(id)).toBe(`dst-record-span:${id}`);
  });
});

