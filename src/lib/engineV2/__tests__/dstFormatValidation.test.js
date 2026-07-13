import { describe, expect, it } from 'vitest';
import { adaptMachineCommandStreamToDST } from '../formatAdaptation/dstCommandAdapter.js';
import { createDSTEncoderCommandV2, createDSTSourceCommandDispositionV2 } from '../formatAdaptation/dstFormatModel.js';
import { validateDSTEncoderCommandV2, validateDSTFormatAdaptationV2, validateDSTSourceCommandDispositionV2 } from '../formatAdaptation/dstFormatValidation.js';
import { createDSTBoundaryMovementFixture } from '../fixtures/dstBoundaryMovementFixture.js';
import { createDSTColorSequenceFixture } from '../fixtures/dstColorSequenceFixture.js';

describe('Phase 12B DST format validation', () => {
  const validDisposition = { sourceMachineCommandId: 'machine:1', sourceAdaptedIndex: 1, sourceType: 'stitch', status: 'adapted', dstCommandCount: 1, expectedBinaryRecordCount: 1 };
  it.each([
    ['sourceMachineCommandId', null], ['id', 'wrong'], ['sourceAdaptedIndex', -1], ['status', 'lost'], ['dstCommandCount', -1], ['expectedBinaryRecordCount', -1],
  ])('rejects invalid disposition field %s', (key, value) => expect(validateDSTSourceCommandDispositionV2(createDSTSourceCommandDispositionV2({ ...validDisposition, [key]: value })).valid).toBe(false));
  const validCommand = { dstCommandIndex: 0, type: 'stitch', x: 1, y: 2, color: 'thread:1', sourceMachineCommandId: 'machine:1', sourceAdaptedIndex: 1, sourceCanonicalCommandId: 'canonical:1', source: { adapterDeltaUnits: { dxUnits: 10, dyUnits: 20 } } };
  it.each([
    ['id', 'wrong'], ['dstCommandIndex', -1], ['type', 'stop'], ['x', 0.01], ['y', Number.NaN], ['color', null], ['sourceMachineCommandId', null], ['sourceAdaptedIndex', null], ['splitIndex', -1], ['splitCount', 0], ['expectedBinaryRecordCount', 3],
  ])('rejects invalid encoder field %s', (key, value) => expect(validateDSTEncoderCommandV2(createDSTEncoderCommandV2({ ...validCommand, [key]: value })).valid).toBe(false));
  it('accepts valid adaptation', () => { const source = createDSTColorSequenceFixture(); expect(validateDSTFormatAdaptationV2(adaptMachineCommandStreamToDST(source), source).valid).toBe(true); });
  it('detects delta beyond limit', () => { const source = createDSTBoundaryMovementFixture(); const adaptation = adaptMachineCommandStreamToDST(source); const changed = { ...adaptation, encoderCommands: adaptation.encoderCommands.map((command, index) => index ? command : { ...command, source: { adapterDeltaUnits: { dxUnits: 122, dyUnits: 0 } } }) }; expect(validateDSTFormatAdaptationV2(changed, source).valid).toBe(false); });
  it('detects source coverage loss', () => { const source = createDSTColorSequenceFixture(); const adaptation = adaptMachineCommandStreamToDST(source); expect(validateDSTFormatAdaptationV2({ ...adaptation, dispositions: adaptation.dispositions.slice(1) }, source).valid).toBe(false); });
  it('accepts deterministic valid factories', () => { expect(validateDSTSourceCommandDispositionV2(createDSTSourceCommandDispositionV2(validDisposition)).valid).toBe(true); expect(validateDSTEncoderCommandV2(createDSTEncoderCommandV2(validCommand)).valid).toBe(true); });
});

