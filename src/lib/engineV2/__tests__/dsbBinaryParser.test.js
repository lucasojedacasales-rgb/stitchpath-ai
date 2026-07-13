import { describe, expect, it } from 'vitest';
import { adaptMachineCommandStreamToDSB } from '../formatAdaptation/dsbCommandAdapter.js';
import { buildDSBBinaryFromRecordPlan } from '../formatAdaptation/dsbBinaryBuilder.js';
import { parseEngineV2DSBBinary } from '../formatAdaptation/dsbBinaryParser.js';
import { createDSBBasicFormatFixture } from '../fixtures/dsbBasicFormatFixture.js';
import { createDSBColorSequenceFixture } from '../fixtures/dsbColorSequenceFixture.js';
import { createDSBLongJumpFixture } from '../fixtures/dsbLongJumpFixture.js';

const parse = stream => { const adaptation = adaptMachineCommandStreamToDSB(stream, { label: 'PARSER_TEST' }); const binary = buildDSBBinaryFromRecordPlan({ adaptation }); return { adaptation, binary, parsed: parseEngineV2DSBBinary(binary.bytes) }; };

describe('Phase 12C isolated DSB binary parser', () => {
  it.each(['stitch', 'jump'])('parses basic %s binary', type => expect(parse(createDSBBasicFormatFixture(type)).parsed.valid).toBe(true));
  it.each([
    ['stitch', 0x80], ['jump', 0x81],
  ])('decodes %s command byte', (type, byte) => { const { parsed } = parse(createDSBBasicFormatFixture(type)); expect(parsed.records[0]).toMatchObject({ type, commandByte: byte }); });
  it('parses label', () => expect(parse(createDSBBasicFormatFixture()).parsed.header.label).toBe('PARSER_TEST'));
  it('parses ST', () => { const { parsed } = parse(createDSBColorSequenceFixture(4)); expect(parsed.header.ST).toBe(parsed.records.length); });
  it('parses CO', () => expect(parse(createDSBColorSequenceFixture(4)).parsed.header.CO).toBe(4));
  it.each(['plusX', 'minusX', 'plusY', 'minusY'])('parses and verifies %s bound', field => { const { binary, parsed } = parse(createDSBLongJumpFixture(350, -280)); expect(parsed.header[field]).toBe(binary.header.bounds[field]); });
  it.each(['AX', 'AY'])('parses final-position field %s', field => { const { parsed } = parse(createDSBLongJumpFixture(350, -280)); expect(parsed.header[field]).toBe(field === 'AX' ? 350 : -280); });
  it('reports one final END', () => { const { parsed } = parse(createDSBBasicFormatFixture()); expect(parsed.endRecordCount).toBe(1); expect(parsed.records.at(-1).type).toBe('end'); });
  it('reports final EOF', () => expect(parse(createDSBBasicFormatFixture()).parsed.finalEOFPresent).toBe(true));
  it('reports no trailing bytes', () => expect(parse(createDSBBasicFormatFixture()).parsed.trailingBytes).toBe(0));
  it('calculates command distribution', () => expect(parse(createDSBColorSequenceFixture(4)).parsed.commandDistribution.colorChange).toBe(4));
  it('calculates full movement bounds', () => expect(parse(createDSBLongJumpFixture(350, -280)).parsed.decodedBounds).toEqual({ plusX: 350, minusX: 0, plusY: 0, minusY: 280 }));
  it('calculates final position', () => expect(parse(createDSBLongJumpFixture(350, -280)).parsed.finalPosition).toEqual({ xUnits: 350, yUnits: -280 }));
  it('rejects non-Uint8Array', () => expect(parseEngineV2DSBBinary([1, 2, 3]).valid).toBe(false));
  it('rejects missing EOF', () => { const { binary } = parse(createDSBBasicFormatFixture()); expect(parseEngineV2DSBBinary(binary.bytes.slice(0, -1)).errors.some(error => error.code === 'DSB_PARSER_EOF_MISSING')).toBe(true); });
  it('rejects malformed record length', () => { const { binary } = parse(createDSBBasicFormatFixture()); const malformed = new Uint8Array([...binary.bytes.slice(0, -1), 0, 0x1A]); expect(parseEngineV2DSBBinary(malformed).errors.some(error => error.code === 'DSB_PARSER_TRAILING_BYTES')).toBe(true); });
  it('rejects unknown command byte', () => { const { binary } = parse(createDSBBasicFormatFixture()); const malformed = new Uint8Array(binary.bytes); malformed[512] = 0x90; expect(parseEngineV2DSBBinary(malformed).errors.some(error => error.code === 'DSB_PARSER_UNKNOWN_RECORD')).toBe(true); });
  it('returns immutable records', () => expect(Object.isFrozen(parse(createDSBBasicFormatFixture()).parsed.records)).toBe(true));
});
