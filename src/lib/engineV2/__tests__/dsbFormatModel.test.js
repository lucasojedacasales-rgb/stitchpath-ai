import { describe, expect, it } from 'vitest';
import {
  createDSBBinaryAcceptanceResultV2, createDSBBinaryRecordSpanV2, createDSBFormatAdaptationV2,
  createDSBRecordPlanV2, createDSBSourceCommandDispositionV2, dsbBinaryRecordSpanId, dsbDispositionId, dsbRecordPlanId,
} from '../formatAdaptation/dsbFormatModel.js';

describe('Phase 12C DSB immutable format models', () => {
  it.each(Array.from({ length: 12 }, (_, index) => `machine-command:${index}`))('creates deterministic disposition ID for %s', sourceMachineCommandId => expect(dsbDispositionId(sourceMachineCommandId)).toBe(`dsb-disposition:${sourceMachineCommandId}`));
  it.each(['stitch', 'jump', 'colorChange', 'end'])('creates padded record-plan ID for %s', type => expect(dsbRecordPlanId(7, type)).toBe(`dsb-record-plan:00000007:${type}`));
  it.each(Array.from({ length: 8 }, (_, index) => `source:${index}`))('creates deterministic span ID for %s', id => expect(dsbBinaryRecordSpanId(id)).toBe(`dsb-record-span:${id}`));
  it('deep clones and freezes disposition data', () => { const source = { nested: { value: 1 } }; const model = createDSBSourceCommandDispositionV2({ sourceMachineCommandId: 'a', sourceAdaptedIndex: 0, sourceType: 'trim', source }); source.nested.value = 2; expect(model.source.nested.value).toBe(1); expect(Object.isFrozen(model.source.nested)).toBe(true); });
  it('freezes record plan', () => expect(Object.isFrozen(createDSBRecordPlanV2({ recordPlanIndex: 0, type: 'end' }))).toBe(true));
  it('freezes binary span arrays', () => expect(Object.isFrozen(createDSBBinaryRecordSpanV2({ sourceMachineCommandId: 'a', sourceRecordPlanIds: ['p'] }).sourceRecordPlanIds)).toBe(true));
  it('builds deterministic adaptation maps', () => { const result = createDSBFormatAdaptationV2({ dispositions: [{ sourceMachineCommandId: 'a', sourceAdaptedIndex: 0 }], recordPlan: [{ recordPlanIndex: 0, type: 'end', sourceMachineCommandId: 'a', sourceAdaptedIndex: 0 }] }); expect(result.bySourceMachineCommandId.a.id).toBe('dsb-disposition:a'); expect(result.byRecordPlanId['dsb-record-plan:00000000:end'].type).toBe('end'); });
  it('clones acceptance bytes', () => { const bytes = new Uint8Array([1, 2, 3]); const result = createDSBBinaryAcceptanceResultV2({ bytes }); bytes[0] = 9; expect(result.bytes[0]).toBe(1); });
  it('uses stable model versions', () => { expect(createDSBFormatAdaptationV2().version).toBe('2-dsb-format-adaptation'); expect(createDSBBinaryAcceptanceResultV2().version).toBe('2-dsb-binary-acceptance'); });
});
