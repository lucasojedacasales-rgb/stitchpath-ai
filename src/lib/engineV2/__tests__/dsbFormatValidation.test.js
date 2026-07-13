import { beforeAll, describe, expect, it } from 'vitest';
import { adaptMachineCommandStreamToDSB } from '../formatAdaptation/dsbCommandAdapter.js';
import { validateDSBBinaryAcceptanceResultV2, validateDSBFormatAdaptationV2, validateDSBRecordPlanV2, validateDSBSourceCommandDispositionV2 } from '../formatAdaptation/dsbFormatValidation.js';
import { createDSBRecordPlanV2, createDSBSourceCommandDispositionV2 } from '../formatAdaptation/dsbFormatModel.js';
import { createGenericMascotDSBFixture } from '../fixtures/genericMascotDSBFixture.js';
import { createGenericMascotMachineFixture } from '../fixtures/genericMascotMachineFixture.js';
import { explicitDSBTrimNoOutputConfig } from '../fixtures/dsbTrimPolicyFixture.js';

describe('Phase 12C DSB validation', () => {
  let source; let strict; let explicit; let exportResult;
  beforeAll(() => { source = createGenericMascotMachineFixture(); strict = adaptMachineCommandStreamToDSB(source.machineAdaptedStream); explicit = adaptMachineCommandStreamToDSB(source.machineAdaptedStream, explicitDSBTrimNoOutputConfig()); exportResult = createGenericMascotDSBFixture(explicitDSBTrimNoOutputConfig()).dsbExport; });
  it('validates strict blocked adaptation structure', () => expect(validateDSBFormatAdaptationV2(strict, source.machineAdaptedStream).valid).toBe(true));
  it('validates explicit accepted adaptation', () => expect(validateDSBFormatAdaptationV2(explicit, source.machineAdaptedStream).valid).toBe(true));
  it('validates accepted binary result', () => expect(validateDSBBinaryAcceptanceResultV2(exportResult.binary).valid).toBe(true));
  it.each([
    [{ sourceMachineCommandId: null, sourceAdaptedIndex: 0 }, 'DSB_DISPOSITION_SOURCE_REQUIRED'],
    [{ sourceMachineCommandId: 'a', sourceAdaptedIndex: -1 }, 'DSB_DISPOSITION_SOURCE_INDEX_INVALID'],
    [{ sourceMachineCommandId: 'a', sourceAdaptedIndex: 0, status: 'unknown' }, 'DSB_DISPOSITION_STATUS_INVALID'],
    [{ sourceMachineCommandId: 'a', sourceAdaptedIndex: 0, status: 'zero_output', recordPlanCount: 1, expectedBinaryRecordCount: 1 }, 'DSB_NO_OUTPUT_DISPOSITION_HAS_OUTPUT'],
  ])('detects malformed disposition %#', (input, code) => expect(validateDSBSourceCommandDispositionV2(createDSBSourceCommandDispositionV2(input)).errors.some(error => error.code === code)).toBe(true));
  it.each([
    [{ recordPlanIndex: 0, type: 'unknown', dxUnits: 0, dyUnits: 0, sourceMachineCommandId: 'a', sourceAdaptedIndex: 0 }, 'DSB_RECORD_PLAN_TYPE_INVALID'],
    [{ recordPlanIndex: -1, type: 'stitch', dxUnits: 0, dyUnits: 0, sourceMachineCommandId: 'a', sourceAdaptedIndex: 0 }, 'DSB_RECORD_PLAN_INDEX_INVALID'],
    [{ recordPlanIndex: 0, type: 'stitch', dxUnits: 128, dyUnits: 0, sourceMachineCommandId: 'a', sourceAdaptedIndex: 0, expectedCommandByte: 0x80 }, 'DSB_RECORD_PLAN_DELTA_OUT_OF_RANGE'],
    [{ recordPlanIndex: 0, type: 'colorChange', dxUnits: 1, dyUnits: 0, sourceMachineCommandId: 'a', sourceAdaptedIndex: 0, expectedCommandByte: 0x88 }, 'DSB_NON_MOVEMENT_RECORD_HAS_DELTA'],
    [{ recordPlanIndex: 0, type: 'jump', dxUnits: 1.5, dyUnits: 0, sourceMachineCommandId: 'a', sourceAdaptedIndex: 0, expectedCommandByte: 0x81 }, 'DSB_RECORD_PLAN_DELTA_INVALID'],
  ])('detects malformed record plan %#', (input, code) => expect(validateDSBRecordPlanV2(createDSBRecordPlanV2(input)).errors.some(error => error.code === code)).toBe(true));
  it('detects missing source disposition', () => { const tampered = structuredClone(explicit); tampered.dispositions.pop(); expect(validateDSBFormatAdaptationV2(tampered, source.machineAdaptedStream).errors.some(error => error.code === 'DSB_SOURCE_DISPOSITION_MISSING')).toBe(true); });
  it('detects duplicate source disposition', () => { const tampered = structuredClone(explicit); tampered.dispositions.push(tampered.dispositions[0]); expect(validateDSBFormatAdaptationV2(tampered, source.machineAdaptedStream).errors.some(error => error.code === 'DSB_DUPLICATE_SOURCE_DISPOSITION')).toBe(true); });
  it('detects out-of-range adapted movement', () => { const tampered = structuredClone(explicit); const movement = tampered.recordPlan.find(record => record.type === 'stitch'); movement.dxUnits = 128; expect(validateDSBFormatAdaptationV2(tampered, source.machineAdaptedStream).errors.some(error => error.code === 'DSB_RECORD_PLAN_DELTA_OUT_OF_RANGE')).toBe(true); });
  it('detects changed color order', () => { const tampered = structuredClone(explicit); const colors = tampered.recordPlan.filter(record => record.type === 'colorChange'); [colors[0].source.threadId, colors[1].source.threadId] = [colors[1].source.threadId, colors[0].source.threadId]; expect(validateDSBFormatAdaptationV2(tampered, source.machineAdaptedStream).errors.some(error => error.code === 'DSB_COLOR_CHANGE_ORDER_CHANGED')).toBe(true); });
  it('detects missing trim acknowledgement', () => { const tampered = structuredClone(explicit); tampered.config.trimNoOutputAcknowledgement = null; expect(validateDSBFormatAdaptationV2(tampered, source.machineAdaptedStream).errors.some(error => error.code === 'DSB_TRIM_ACKNOWLEDGEMENT_MISSING')).toBe(true); });
});
