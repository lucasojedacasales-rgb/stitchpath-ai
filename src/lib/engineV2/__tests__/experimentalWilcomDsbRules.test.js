import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { encodeLegacyDSBRecord } from '../../dsbEncoder.js';
import { parseReferenceFile } from '../../referenceLearning/referenceFileParser.js';
import { assessDSBReferenceStructuralAcceptance } from '../formatAdaptation/dsbBinaryAcceptance.js';
import { decodeWilcomDSBRecord, parseEngineV2DSBBinary } from '../formatAdaptation/dsbBinaryParser.js';
import { DEFAULT_DSB_FORMAT_CONFIG, resolveDSBFormatConfig } from '../formatAdaptation/dsbFormatConfig.js';

const REFERENCE_ROOT = process.env.STITCHPATH_PHASE13B19R_REFERENCE_ROOT || path.join(os.homedir(), 'Documents', 'StitchPath-References', 'yoshi-real-01');
const ZIP = path.join(REFERENCE_ROOT, 'wilcom-yoshi-three-variant-reference-addendum-r1', 'wilcom-yoshi-three-variant-reference-addendum-r1.zip');
const KNOWN_GOOD_ZIP = path.join(REFERENCE_ROOT, 'ce01-known-good-reference-corpus-r1', 'ce01-known-good-reference-corpus-r1.zip');
const KNOWN_GOOD_INVENTORY = path.join(REFERENCE_ROOT, 'reference-region01-ce01-known-good-corpus-inventory.json');
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
let knownGoodCorpus;
let knownGoodDsbCorpus;
beforeAll(() => {
  const entries = readZipEntries(fs.readFileSync(ZIP));
  corpus = SPECS.map(spec => {
    const pair = [...entries].find(([name]) => name.endsWith(`/files/${spec.filename}`) || name.endsWith(`files/${spec.filename}`));
    if (!pair) throw new Error(`Missing immutable fixture ${spec.filename}`);
    return { spec, bytes: pair[1] };
  });
  const knownGoodEntries = readZipEntries(fs.readFileSync(KNOWN_GOOD_ZIP));
  const inventory = JSON.parse(fs.readFileSync(KNOWN_GOOD_INVENTORY, 'utf8'));
  knownGoodCorpus = inventory.inventory.map(spec => {
    const pair = [...knownGoodEntries].find(([name]) => name.endsWith(`/files/${spec.filename}`) || name.endsWith(`files/${spec.filename}`));
    if (!pair) throw new Error(`Missing immutable known-good fixture ${spec.filename}`);
    return { spec, bytes: pair[1] };
  });
  knownGoodDsbCorpus = knownGoodCorpus.filter(({ spec }) => spec.detectedFormat === 'DSB');
});

describe('Phase 13B19S promoted Wilcom sign-magnitude family decoder', () => {
  it('defaults Rules 2 and 3 true while keeping their kill switches independent', () => {
    expect(DEFAULT_DSB_FORMAT_CONFIG.experimentalWilcomDsbSignMagnitudeFamilyDecode).toBe(true);
    expect(DEFAULT_DSB_FORMAT_CONFIG.experimentalRawComplexityQualityNeutrality).toBe(true);
    expect(resolveDSBFormatConfig({ experimentalWilcomDsbSignMagnitudeFamilyDecode: false })).toMatchObject({ experimentalWilcomDsbSignMagnitudeFamilyDecode: false, experimentalRawComplexityQualityNeutrality: true });
    expect(resolveDSBFormatConfig({ experimentalRawComplexityQualityNeutrality: false })).toMatchObject({ experimentalWilcomDsbSignMagnitudeFamilyDecode: true, experimentalRawComplexityQualityNeutrality: false });
  });

  it.each([
    [0x80, 'stitch', 7, 5], [0xA0, 'stitch', -7, 5], [0xC0, 'stitch', 7, -5], [0xE0, 'stitch', -7, -5],
    [0x81, 'jump', 7, 5], [0xA1, 'jump', -7, 5], [0xC1, 'jump', 7, -5], [0xE1, 'jump', -7, -5],
  ])('decodes movement family 0x%s with its X/Y signs', (control, type, dx, dy) => {
    expect(decodeWilcomDSBRecord([control, 5, 7])).toMatchObject({ command: control, type, dx, dy, literalControlValue: control, decodedDelta: { xUnits: dx, yUnits: dy } });
  });

  it('preserves legacy Engine V2 two-complement payloads without changing the encoder', () => {
    expect(decodeWilcomDSBRecord([0x80, 0xFF, 0xFE])).toMatchObject({ type: 'stitch', dx: -2, dy: -1, controlFamily: 'legacy_engine_v2_twos_complement_stitch_movement' });
    expect(decodeWilcomDSBRecord([0x81, 0x80, 0x7F])).toMatchObject({ type: 'jump', dx: 127, dy: -128, controlFamily: 'legacy_engine_v2_twos_complement_jump_movement' });
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

  it('makes default parsing identical to explicit flag-on while preserving exact flag-off behavior', () => {
    const { bytes } = corpus[0];
    expect(parseEngineV2DSBBinary(bytes)).toEqual(parseEngineV2DSBBinary(bytes, { experimentalWilcomDsbSignMagnitudeFamilyDecode: true }));
    const firstLegacy = parseEngineV2DSBBinary(bytes, { experimentalWilcomDsbSignMagnitudeFamilyDecode: false });
    const secondLegacy = parseEngineV2DSBBinary(bytes, { experimentalWilcomDsbSignMagnitudeFamilyDecode: false });
    expect(secondLegacy).toEqual(firstLegacy);
    expect(firstLegacy.valid).toBe(false);
  });

  it('regresses all 11 immutable known-good DSB corpus files with exact reconstruction', () => {
    expect(knownGoodDsbCorpus).toHaveLength(11);
    knownGoodDsbCorpus.forEach(({ spec, bytes }) => {
      expect(bytes.length).toBe(spec.byteSize);
      expect(sha256(bytes)).toBe(spec.sha256);
      const parsed = parseEngineV2DSBBinary(bytes);
      expect(parsed).toEqual(parseEngineV2DSBBinary(bytes, { experimentalWilcomDsbSignMagnitudeFamilyDecode: true }));
      expect(parsed.recordCount).toBe(spec.declaredRecordOrStitchCount);
      expect(parsed.header.ST).toBe(spec.declaredRecordOrStitchCount);
      expect(parsed.decodedBounds).toEqual({
        plusX: spec.positiveAndNegativeExtents.positiveXExtentUnits,
        minusX: spec.positiveAndNegativeExtents.negativeXExtentUnits,
        plusY: spec.positiveAndNegativeExtents.positiveYExtentUnits,
        minusY: spec.positiveAndNegativeExtents.negativeYExtentUnits,
      });
      expect(parsed.finalPosition).toEqual({ xUnits: parsed.header.AX, yUnits: parsed.header.AY });
      expect(parsed.endRecordCount).toBe(1);
      expect(parsed.records.at(-1)).toMatchObject({ type: 'end', rawControlByte: 0xF8 });
      expect(parsed.records.every((record, index) => record.index === index && record.offset === 512 + index * 3)).toBe(true);
      expect(parsed.errors).toEqual([{ code: 'DSB_PARSER_EOF_MISSING', path: 'bytes', message: 'Final EOF byte 0x1A is missing.' }]);
    });
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

  it('preserves the legacy low-level DSB record contract used by the disconnected pipeline', () => {
    expect(encodeLegacyDSBRecord(7, 5, 'stitch')).toEqual([0x80, 0x05, 0x07]);
    expect(encodeLegacyDSBRecord(-7, -5, 'stitch')).toEqual([0x80, 0xFB, 0xF9]);
    expect(encodeLegacyDSBRecord(-7, 5, 'jump')).toEqual([0x81, 0x05, 0xF9]);
    expect(encodeLegacyDSBRecord(0, 0, 'end')).toEqual([0xF8, 0x00, 0x00]);
  });
});

describe('Phase 13B19S promoted raw-complexity quality neutrality', () => {
  it('accepts all three structurally valid files with both promoted defaults', () => {
    corpus.forEach(({ spec, bytes }) => {
      const result = parseReferenceFile(bytes, spec.filename);
      expect(result.experimentalFeatureFlags).toEqual({ experimentalWilcomDsbSignMagnitudeFamilyDecode: true, experimentalRawComplexityQualityNeutrality: true });
      expect(result.structuralAcceptance.accepted, JSON.stringify(result.structuralAcceptance.errors)).toBe(true);
      expect(result.structuralAcceptance.rawComplexityAffectsAcceptance).toBe(false);
      expect(result.rawComplexityMetrics.totalRecordCount).toBe(spec.recordCount);
    });
  });

  it('preserves explicit Rule 3 force-disable behavior and descriptive metrics', () => {
    const { spec, bytes } = corpus[0];
    const result = parseReferenceFile(bytes, spec.filename, { experimentalRawComplexityQualityNeutrality: false });
    expect(result.experimentalFeatureFlags).toEqual({ experimentalWilcomDsbSignMagnitudeFamilyDecode: true, experimentalRawComplexityQualityNeutrality: false });
    expect(result.structuralAcceptance).toBeNull();
    expect(result.rawComplexityMetrics.totalRecordCount).toBe(spec.recordCount);
    const parsed = parseEngineV2DSBBinary(bytes);
    const first = assessDSBReferenceStructuralAcceptance({ parsedResult: parsed, config: { experimentalRawComplexityQualityNeutrality: false } });
    const second = assessDSBReferenceStructuralAcceptance({ parsedResult: parsed, config: { experimentalRawComplexityQualityNeutrality: false } });
    expect(second).toEqual(first);
    expect(first).toMatchObject({ evaluated: false, accepted: null, experimentalRawComplexityQualityNeutrality: false });
  });

  it('keeps all 57 known-good CE01 files accepted at their applicable parser and evidence boundary', () => {
    expect(knownGoodCorpus).toHaveLength(57);
    const accepted = knownGoodCorpus.map(({ spec, bytes }) => {
      expect(bytes.length).toBe(spec.byteSize);
      expect(sha256(bytes)).toBe(spec.sha256);
      const result = parseReferenceFile(bytes, spec.filename);
      if (spec.detectedFormat === 'DST') {
        expect(spec.repositoryParserResults.genericParser.valid).toBe(true);
        expect(result.format).toBe('DST');
        expect(result.commands.length).toBeGreaterThan(0);
        return true;
      }
      expect(result.experimentalFeatureFlags).toEqual({ experimentalWilcomDsbSignMagnitudeFamilyDecode: true, experimentalRawComplexityQualityNeutrality: true });
      expect(result.rawComplexityMetrics.totalRecordCount).toBe(spec.declaredRecordOrStitchCount);
      expect(result.dsbStructuralParse.errors.map(error => error.code)).toEqual(['DSB_PARSER_EOF_MISSING']);
      expect(result.structuralAcceptance.accepted).toBe(false);
      expect(spec.exactFileCE01ImportAcceptance).toBe('user_attested_verified');
      expect(spec.exactFileCE01OpenAcceptance).toBe('user_attested_verified');
      expect(spec.exactFileCE01CompleteSewout).toBe('user_attested_verified');
      return spec.evidenceClassification === 'verified_by_exact_ce01_operator_attested_complete_sewout';
    });
    expect(accepted.filter(Boolean)).toHaveLength(57);
  });

  it('keeps high-information counts descriptive and quality-neutral', () => {
    const { bytes } = corpus[1];
    const parsed = parseEngineV2DSBBinary(bytes, { experimentalWilcomDsbSignMagnitudeFamilyDecode: true });
    const acceptance = assessDSBReferenceStructuralAcceptance({ parsedResult: parsed });
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
      const acceptance = assessDSBReferenceStructuralAcceptance({ parsedResult: parsed });
      expect(acceptance.accepted, mutation.id).toBe(false);
      expect(parsed.errors.some(error => error.code === mutation.code), `${mutation.id}: ${JSON.stringify(parsed.errors)}`).toBe(true);
      expect(acceptance.metrics.totalRecordCount).toBeGreaterThan(0);
    });
  });

  it('contains no hash-specific production branch', () => {
    const source = `${assessDSBReferenceStructuralAcceptance}${parseReferenceFile}`;
    SPECS.forEach(spec => expect(source).not.toContain(spec.sha256));
    [...SPECS, ...knownGoodCorpus.map(item => item.spec)].forEach(spec => expect(source).not.toContain(spec.filename));
  });
});
