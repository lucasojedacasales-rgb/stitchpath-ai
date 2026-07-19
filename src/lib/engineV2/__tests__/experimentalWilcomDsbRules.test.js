import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseReferenceFile } from '../../referenceLearning/referenceFileParser.js';
import { assessDSBReferenceStructuralAcceptance } from '../formatAdaptation/dsbBinaryAcceptance.js';
import { decodeWilcomDSBRecord, parseEngineV2DSBBinary } from '../formatAdaptation/dsbBinaryParser.js';
import { DEFAULT_DSB_FORMAT_CONFIG, resolveDSBFormatConfig } from '../formatAdaptation/dsbFormatConfig.js';

const REFERENCE_ROOT = process.env.STITCHPATH_PHASE13B19R_REFERENCE_ROOT || path.join(os.homedir(), 'Documents', 'StitchPath-References', 'yoshi-real-01');
const ZIP = path.join(REFERENCE_ROOT, 'wilcom-yoshi-three-variant-reference-addendum-r1', 'wilcom-yoshi-three-variant-reference-addendum-r1.zip');
const SPECS = Object.freeze([
  { id: 'compact', filename: 'yoshi simple 2(3).DSB', sha256: '6556733f1873a586455a135abcb65c28e3b67c67e61967f9b52f288896164d74', byteSize: 42723, recordCount: 14070, bounds: { plusX: 724, minusX: 98, plusY: 247, minusY: 880 }, finalPosition: { xUnits: 541, yUnits: -441 }, E7: 15, state: 4 },
  { id: 'high-information', filename: 'yoshi simple(3).DSB', sha256: '37d3f95844eaba2ffb18cfbfb53721837c2394d5f6da645947b694a1957a6c7b', byteSize: 105978, recordCount: 35155, bounds: { plusX: 587, minusX: 235, plusY: 783, minusY: 344 }, finalPosition: { xUnits: 377, yUnits: 508 }, E7: 490, state: 503 },
  { id: 'large', filename: 'yoshi(1).DSB', sha256: '5696b67408087f954eab7859d73c4274d1836fcfe4be721d490be59e6eea3339', byteSize: 78507, recordCount: 25998, bounds: { plusX: 837, minusX: 328, plusY: 1106, minusY: 493 }, finalPosition: { xUnits: 600, yUnits: -287 }, E7: 6, state: 15 },
]);
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function readZipEntries(buffer) {
  const entries = new Map();
  let eocd = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 65557); index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054B50) { eocd = index; break; }
  }
  if (eocd < 0) throw new Error('ZIP EOCD not found');
  const count = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014B50) throw new Error('ZIP central directory entry missing');
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8').replaceAll('\\', '/');
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(start, start + compressedSize);
    const content = method === 0 ? Buffer.from(compressed) : method === 8 ? zlib.inflateRawSync(compressed) : null;
    if (!content || content.length !== uncompressedSize) throw new Error(`Invalid ZIP member ${name}`);
    entries.set(name, new Uint8Array(content));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function replaceRange(source, start, deleteCount, insert = []) {
  return new Uint8Array([...source.slice(0, start), ...insert, ...source.slice(start + deleteCount)]);
}

let corpus;
beforeAll(() => {
  const entries = readZipEntries(fs.readFileSync(ZIP));
  corpus = SPECS.map(spec => {
    const pair = [...entries].find(([name]) => name.endsWith(`/files/${spec.filename}`) || name.endsWith(`files/${spec.filename}`));
    if (!pair) throw new Error(`Missing immutable fixture ${spec.filename}`);
    return { spec, bytes: pair[1] };
  });
});

describe('Phase 13B19R Wilcom sign-magnitude family decoder', () => {
  it('defaults both DSB experimental flags false and keeps them independent', () => {
    expect(DEFAULT_DSB_FORMAT_CONFIG.experimentalWilcomDsbSignMagnitudeFamilyDecode).toBe(false);
    expect(DEFAULT_DSB_FORMAT_CONFIG.experimentalRawComplexityQualityNeutrality).toBe(false);
    expect(resolveDSBFormatConfig({ experimentalWilcomDsbSignMagnitudeFamilyDecode: true })).toMatchObject({ experimentalWilcomDsbSignMagnitudeFamilyDecode: true, experimentalRawComplexityQualityNeutrality: false });
    expect(resolveDSBFormatConfig({ experimentalRawComplexityQualityNeutrality: true })).toMatchObject({ experimentalWilcomDsbSignMagnitudeFamilyDecode: false, experimentalRawComplexityQualityNeutrality: true });
  });

  it.each([
    [0x80, 'stitch', 7, 5], [0xA0, 'stitch', -7, 5], [0xC0, 'stitch', 7, -5], [0xE0, 'stitch', -7, -5],
    [0x81, 'jump', 7, 5], [0xA1, 'jump', -7, 5], [0xC1, 'jump', 7, -5], [0xE1, 'jump', -7, -5],
  ])('decodes movement family 0x%s with its X/Y signs', (control, type, dx, dy) => {
    expect(decodeWilcomDSBRecord([control, 5, 7])).toMatchObject({ command: control, type, dx, dy, literalControlValue: control, decodedDelta: { xUnits: dx, yUnits: dy } });
  });

  it('preserves E7 without trim or cut semantics', () => {
    const record = decodeWilcomDSBRecord([0xE7, 0, 0]);
    expect(record).toMatchObject({ type: 'opaqueControl', controlFamily: 'opaque_zero_displacement_control', literalControlValue: 0xE7, physicalSemanticStatus: 'unresolved_not_trim_or_thread_cut' });
    expect(JSON.stringify(record)).not.toMatch(/"type":"(?:trim|threadCut)"/);
  });

  it.each([0xE8, 0xE9, 0xEA, 0xEB, 0xEC, 0xED, 0xEE, 0xEF])('preserves opaque literal 0x%s separately', control => {
    expect(decodeWilcomDSBRecord([control, 0, 0])).toMatchObject({ type: 'opaqueStateControl', literalControlValue: control, physicalSemanticStatus: 'unresolved_not_a_verified_physical_colour_block' });
  });

  it('recognizes F8 as END', () => expect(decodeWilcomDSBRecord([0xF8, 0, 0])).toMatchObject({ type: 'end', controlFamily: 'end' }));

  it('preserves exact flag-off parser behavior', () => {
    const { bytes } = corpus[0];
    expect(parseEngineV2DSBBinary(bytes)).toEqual(parseEngineV2DSBBinary(bytes, { experimentalWilcomDsbSignMagnitudeFamilyDecode: false }));
    expect(parseEngineV2DSBBinary(bytes).valid).toBe(false);
  });

  it('parses all three immutable files with exact reconstruction and control preservation', () => {
    corpus.forEach(({ spec, bytes }) => {
      expect(bytes.length).toBe(spec.byteSize);
      expect(sha256(bytes)).toBe(spec.sha256);
      const parsed = parseEngineV2DSBBinary(bytes, { experimentalWilcomDsbSignMagnitudeFamilyDecode: true });
      expect(parsed.valid, JSON.stringify(parsed.errors)).toBe(true);
      expect(parsed.recordCount).toBe(spec.recordCount);
      expect(parsed.recordCount).toBe(parsed.header.ST);
      expect(parsed.decodedBounds).toEqual(spec.bounds);
      expect(parsed.finalPosition).toEqual(spec.finalPosition);
      expect(parsed.records.filter(record => record.rawControlByte === 0xE7)).toHaveLength(spec.E7);
      expect(parsed.records.filter(record => record.type === 'opaqueStateControl')).toHaveLength(spec.state);
      expect(parsed.endRecordCount).toBe(1);
      expect(parsed.records.at(-1)).toMatchObject({ type: 'end', rawControlByte: 0xF8 });
      expect(parsed.records.every((record, index) => record.index === index && record.offset === 512 + index * 3)).toBe(true);
      expect(parsed.records.every(record => record.rawRecordBytes.length === 3)).toBe(true);
    });
  });

  it('leaves the DSB encoder byte-wise unchanged', () => {
    const encoderPath = fileURLToPath(new URL('../../dsbEncoder.js', import.meta.url));
    expect(sha256(fs.readFileSync(encoderPath))).toBe('cce83ef329786d40a53a7c243327def1ea60d8fdbb68d0b077f0f8859ea14c79');
  });
});

describe('Phase 13B19R raw-complexity quality neutrality', () => {
  it('accepts all three structurally valid files without enabling the command decoder flag', () => {
    corpus.forEach(({ spec, bytes }) => {
      const result = parseReferenceFile(bytes, spec.filename, { experimentalRawComplexityQualityNeutrality: true });
      expect(result.experimentalFeatureFlags).toEqual({ experimentalWilcomDsbSignMagnitudeFamilyDecode: false, experimentalRawComplexityQualityNeutrality: true });
      expect(result.structuralAcceptance.accepted, JSON.stringify(result.structuralAcceptance.errors)).toBe(true);
      expect(result.structuralAcceptance.rawComplexityAffectsAcceptance).toBe(false);
      expect(result.rawComplexityMetrics.totalRecordCount).toBe(spec.recordCount);
    });
  });

  it('keeps high-information counts descriptive and quality-neutral', () => {
    const { bytes } = corpus[1];
    const parsed = parseEngineV2DSBBinary(bytes, { experimentalWilcomDsbSignMagnitudeFamilyDecode: true });
    const acceptance = assessDSBReferenceStructuralAcceptance({ parsedResult: parsed, config: { experimentalRawComplexityQualityNeutrality: true } });
    expect(acceptance).toMatchObject({ accepted: true, qualityFailure: false, rawComplexityAffectsAcceptance: false });
    expect(acceptance.metrics).toMatchObject({ totalRecordCount: 35155, jumpLikeMovementCount: 1311, E7ControlCount: 490, opaqueStateControlCount: 503, fileByteSize: 105978 });
  });

  it('rejects all six deterministic structural mutations', () => {
    const source = corpus[1].bytes;
    const stTag = Buffer.from(source).indexOf(Buffer.from('ST:'));
    const firstStDigit = Array.from(source.slice(stTag + 3, stTag + 14)).findIndex(byte => byte >= 0x30 && byte <= 0x39) + stTag + 3;
    const corruptHeader = new Uint8Array(source);
    corruptHeader[firstStDigit] = corruptHeader[firstStDigit] === 0x39 ? 0x38 : 0x39;
    const mutations = [
      { id: 'truncate-complete-record', bytes: replaceRange(source, source.length - 7, 3), code: 'DSB_PARSER_HEADER_ST_MISMATCH' },
      { id: 'remove-final-end', bytes: replaceRange(source, source.length - 4, 3), code: 'DSB_PARSER_END_COUNT_INVALID' },
      { id: 'record-after-end', bytes: replaceRange(source, source.length - 1, 0, [0x80, 0, 0]), code: 'DSB_PARSER_RECORD_AFTER_END' },
      { id: 'unknown-critical-control', bytes: replaceRange(source, 512, 1, [0x82]), code: 'DSB_PARSER_UNKNOWN_RECORD' },
      { id: 'corrupt-header-record-count', bytes: corruptHeader, code: 'DSB_PARSER_HEADER_ST_MISMATCH' },
      { id: 'non-record-boundary-cut', bytes: replaceRange(source, source.length - 2, 1), code: 'DSB_PARSER_TRAILING_BYTES' },
    ];
    mutations.forEach(mutation => {
      const parsed = parseEngineV2DSBBinary(mutation.bytes, { experimentalWilcomDsbSignMagnitudeFamilyDecode: true });
      const acceptance = assessDSBReferenceStructuralAcceptance({ parsedResult: parsed, config: { experimentalRawComplexityQualityNeutrality: true } });
      expect(acceptance.accepted, mutation.id).toBe(false);
      expect(parsed.errors.some(error => error.code === mutation.code), `${mutation.id}: ${JSON.stringify(parsed.errors)}`).toBe(true);
      expect(acceptance.metrics.totalRecordCount).toBeGreaterThan(0);
    });
  });

  it('contains no hash-specific production branch', () => {
    const source = `${assessDSBReferenceStructuralAcceptance}${parseReferenceFile}`;
    SPECS.forEach(spec => expect(source).not.toContain(spec.sha256));
  });
});
