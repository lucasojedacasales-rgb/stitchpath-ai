import { beforeAll, describe, expect, it } from 'vitest';
import { buildEngineV2DSTExport } from '../formatAdaptation/dstExportPipeline.js';
import { createDSTBoundaryMovementFixture } from '../fixtures/dstBoundaryMovementFixture.js';
import { createDSTColorSequenceFixture } from '../fixtures/dstColorSequenceFixture.js';
import { createDSTLongJumpFixture } from '../fixtures/dstLongJumpFixture.js';
import { createDSTTrimExpansionFixture } from '../fixtures/dstTrimExpansionFixture.js';

describe('Phase 12B DST binary acceptance', () => {
  let colorResult; let trimResult;
  beforeAll(() => { colorResult = buildEngineV2DSTExport({ machineAdaptedStream: createDSTColorSequenceFixture(), config: { label: 'FIVE_COLORS' } }); trimResult = buildEngineV2DSTExport({ machineAdaptedStream: createDSTTrimExpansionFixture(17), config: { label: 'TRIM_17' } }); });
  it.each([-121, -99, -1, 1, 99, 121])('roundtrips stitch delta %i', delta => { const result = buildEngineV2DSTExport({ machineAdaptedStream: createDSTBoundaryMovementFixture({ type: 'stitch', dxUnits: delta, dyUnits: -delta }) }); expect(result.valid).toBe(true); expect(result.binary.records[0]).toMatchObject({ dxUnits: delta, dyUnits: -delta, type: 'stitch' }); });
  it.each([-121, -99, -1, 1, 99, 121])('roundtrips jump delta %i', delta => { const result = buildEngineV2DSTExport({ machineAdaptedStream: createDSTBoundaryMovementFixture({ type: 'jump', dxUnits: delta, dyUnits: -delta }) }); expect(result.valid).toBe(true); expect(result.binary.records[0]).toMatchObject({ dxUnits: delta, dyUnits: -delta, type: 'jump' }); });
  it('accepts a split long jump without encoder-side split', () => { const result = buildEngineV2DSTExport({ machineAdaptedStream: createDSTLongJumpFixture() }); expect(result.valid).toBe(true); expect(result.summary.adapterJumpCommandCount).toBe(3); expect(result.summary.actualBinaryRecordCount).toBe(result.summary.expectedBinaryRecordCount); });
  it('expands seventeen trims into 51 records', () => expect(trimResult.summary.actualTrimBinaryRecordCount).toBe(51));
  it('verifies every trim span', () => expect(trimResult.adaptation.binaryRecordSpans.every(span => span.verified)).toBe(true));
  it('writes four STOP records', () => expect(colorResult.summary.binarySTOPRecordCount).toBe(4));
  it('writes one END record', () => expect(colorResult.summary.binaryENDRecordCount).toBe(1));
  it('keeps END immediately before EOF', () => { expect(colorResult.binary.bytes.slice(-4)).toEqual(new Uint8Array([0, 0, 0xF3, 0x1A])); });
  it('uses a 512-byte header', () => expect(colorResult.summary.headerByteLength).toBe(512));
  it('writes matching ST field', () => expect(colorResult.binary.header.ST).toBe(colorResult.summary.actualBinaryRecordCount));
  it('writes matching CO field', () => expect(colorResult.binary.header.CO).toBe(4));
  it('keeps parser roundtrip valid', () => expect(colorResult.summary.parserRoundtripPassed).toBe(true));
  it('generates deterministic bytes', () => expect(colorResult.summary.deterministicBytesVerified).toBe(true));
  it('covers binary lineage completely', () => expect(colorResult.summary.binaryLineageCoveragePercent).toBe(100));
  it('uses existing strict EOF behavior only', () => expect(colorResult.binary.metadata.ce01StrictEffect).toContain('EOF byte'));
});

