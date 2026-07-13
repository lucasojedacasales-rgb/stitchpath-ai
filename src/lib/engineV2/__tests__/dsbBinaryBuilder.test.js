import { describe, expect, it } from 'vitest';
import { adaptMachineCommandStreamToDSB } from '../formatAdaptation/dsbCommandAdapter.js';
import { buildDSBBinaryFromRecordPlan } from '../formatAdaptation/dsbBinaryBuilder.js';
import { createDSBBasicFormatFixture } from '../fixtures/dsbBasicFormatFixture.js';
import { createDSBColorSequenceFixture } from '../fixtures/dsbColorSequenceFixture.js';
import { createDSBLongJumpFixture } from '../fixtures/dsbLongJumpFixture.js';
import { createDSBZeroMovementFixture } from '../fixtures/dsbZeroMovementFixture.js';

const build = stream => { const adaptation = adaptMachineCommandStreamToDSB(stream, { label: 'BUILDER_TEST' }); return { adaptation, result: buildDSBBinaryFromRecordPlan({ adaptation }) }; };

describe('Phase 12C DSB binary builder', () => {
  it.each([
    ['stitch', 0x80], ['jump', 0x81],
  ])('uses low-level command byte for %s', (type, commandByte) => { const { result } = build(createDSBBasicFormatFixture(type)); expect(result.valid).toBe(true); expect(result.records[0].commandByte).toBe(commandByte); });
  it.each([
    [10, -5, 251, 10], [-10, 5, 5, 246], [127, -127, 129, 127], [-127, 127, 127, 129],
  ])('writes command,Y,X for signed delta (%i,%i)', (dxUnits, dyUnits, yByte, xByte) => { const { result } = build(createDSBLongJumpFixture(dxUnits, dyUnits, 'stitch')); expect(result.records[0].bytes).toEqual([0x80, yByte, xByte]); });
  it('writes color change as 88 00 00', () => { const { result } = build(createDSBColorSequenceFixture(1)); expect(result.records.find(record => record.type === 'colorChange').bytes).toEqual([0x88, 0, 0]); });
  it('writes END as F8 00 00', () => { const { result } = build(createDSBBasicFormatFixture('stitch')); expect(result.records.at(-1).bytes).toEqual([0xF8, 0, 0]); });
  it('writes zero stitch penetration as 80 00 00', () => { const { result } = build(createDSBZeroMovementFixture('stitch')); expect(result.records[0].bytes).toEqual([0x80, 0, 0]); });
  it('creates exactly 512 header bytes', () => expect(build(createDSBBasicFormatFixture('stitch')).result.header.byteLength).toBe(512));
  it('includes the header terminator', () => expect(build(createDSBBasicFormatFixture('stitch')).result.header.terminatorPresent).toBe(true));
  it('appends final EOF', () => { const { result } = build(createDSBBasicFormatFixture('stitch')); expect(result.bytes.at(-1)).toBe(0x1A); });
  it('uses record count including END for ST', () => { const { result } = build(createDSBColorSequenceFixture(4)); expect(result.header.stitchCount).toBe(result.records.length); });
  it('uses 0x88 count for CO', () => { const { result } = build(createDSBColorSequenceFixture(4)); expect(result.header.colorChanges).toBe(4); });
  it('derives bounds from full movement stream', () => { const { result } = build(createDSBLongJumpFixture(350, -280, 'jump')); expect(result.header.bounds).toEqual({ plusX: 350, minusX: 0, plusY: 0, minusY: 280 }); });
  it('derives final position from decoded records', () => { const { result } = build(createDSBLongJumpFixture(350, -280, 'jump')); expect([result.header.finalX, result.header.finalY]).toEqual([350, -280]); });
  it('uses one low-level record call per plan entry', () => { const { adaptation, result } = build(createDSBLongJumpFixture()); expect(result.metadata.encodeDSBRecordCallCount).toBe(adaptation.recordPlan.length); });
  it('does not invoke encodeDSBMove', () => expect(build(createDSBBasicFormatFixture()).result.metadata.encodeDSBMoveInvoked).toBe(false));
  it('does not duplicate signed-byte logic', () => expect(build(createDSBBasicFormatFixture()).result.metadata.signedByteLogicDuplicated).toBe(false));
  it('produces deterministic bytes', () => { const adaptation = adaptMachineCommandStreamToDSB(createDSBColorSequenceFixture(4)); expect(buildDSBBinaryFromRecordPlan({ adaptation }).bytes).toEqual(buildDSBBinaryFromRecordPlan({ adaptation }).bytes); });
  it('blocks invalid adaptation without bytes', () => { const adaptation = adaptMachineCommandStreamToDSB(createDSBBasicFormatFixture(), { format: 'DST' }); const result = buildDSBBinaryFromRecordPlan({ adaptation }); expect(result.valid).toBe(false); expect(result.bytes).toHaveLength(0); });
  it('returns octet-stream Blob', () => expect(build(createDSBBasicFormatFixture()).result.blob.type).toBe('application/octet-stream'));
});
