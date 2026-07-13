import { buildDSTFromCommands } from '../../dstDirectExport.js';
import { decodeDSTRecord } from '../../dstEncoder.js';
import { parseDST } from '../../exportedFileBinaryRoundtripForensics.js';
import { parseEmbroideryHeader, validateRecordStructure } from '../../embroideryBinaryInspector.js';
import { createDSTBinaryAcceptanceResultV2, createDSTBinaryRecordSpanV2, createDSTFormatAdaptationV2 } from './dstFormatModel.js';
import { validateDSTFormatAdaptationV2 } from './dstFormatValidation.js';

const issue = (code, path, message) => ({ code, path, message });
const equalBytes = (left, right) => left?.length === right?.length && left.every((value, index) => value === right[index]);
const xorChecksum = bytes => bytes.reduce((checksum, byte) => checksum ^ byte, 0);

function decodeRecords(bytes) {
  const eof = bytes.at(-1) === 0x1A; const dataEnd = eof ? bytes.length - 1 : bytes.length; const records = [];
  let xUnits = 0; let yUnits = 0;
  for (let offset = 512, index = 0; offset + 2 < dataEnd; offset += 3, index += 1) {
    const raw = [bytes[offset], bytes[offset + 1], bytes[offset + 2]]; const decoded = decodeDSTRecord(raw);
    xUnits += decoded.dx; yUnits += decoded.dy;
    records.push({ index, offset, bytes: raw, type: decoded.flag, dxUnits: decoded.dx, dyUnits: decoded.dy, xUnits, yUnits });
  }
  return records;
}

function expectedRecordType(command, localIndex) {
  if (command.type === 'trim') return localIndex < 3 ? 'jump' : null;
  return command.type === 'colorChange' ? 'colorChange' : command.type;
}

function verifyCommandRecords(command, records) {
  if (records.length !== command.expectedBinaryRecordCount) return false;
  if (command.type === 'trim') return records.every(record => record.type === 'jump' && record.dxUnits === 0 && record.dyUnits === 0);
  const record = records[0]; if (!record || record.type !== expectedRecordType(command, 0)) return false;
  if (['stitch', 'jump'].includes(command.type)) return record.dxUnits === command.source.adapterDeltaUnits.dxUnits && record.dyUnits === command.source.adapterDeltaUnits.dyUnits;
  return record.dxUnits === 0 && record.dyUnits === 0;
}

function actualSpans(adaptation, records) {
  return adaptation.binaryRecordSpans.map(span => {
    const commands = span.sourceDSTCommandIds.map(id => adaptation.byDSTCommandId[id]).filter(Boolean);
    const expectedCount = commands.reduce((sum, command) => sum + command.expectedBinaryRecordCount, 0);
    const first = expectedCount ? span.expectedFirstRecordIndex : null;
    const actualCount = expectedCount ? Math.max(0, Math.min(expectedCount, records.length - first)) : 0;
    const last = actualCount ? first + actualCount - 1 : null;
    let cursor = first; let verified = expectedCount === span.expectedRecordCount;
    for (const command of commands) {
      const slice = records.slice(cursor, cursor + command.expectedBinaryRecordCount);
      verified = verified && verifyCommandRecords(command, slice); cursor += command.expectedBinaryRecordCount;
    }
    if (!expectedCount) verified = span.expectedFirstRecordIndex == null && span.expectedLastRecordIndex == null;
    return createDSTBinaryRecordSpanV2({ ...span, actualFirstRecordIndex: actualCount ? first : null, actualLastRecordIndex: last, actualRecordCount: actualCount, verified, source: { ...span.source, acceptance: 'engine-v2-phase12b' } });
  });
}

function recordBounds(records) {
  let minX = 0; let maxX = 0; let minY = 0; let maxY = 0;
  records.filter(record => record.type === 'stitch').forEach(record => { minX = Math.min(minX, record.xUnits); maxX = Math.max(maxX, record.xUnits); minY = Math.min(minY, record.yUnits); maxY = Math.max(maxY, record.yUnits); });
  return { plusX: maxX, minusX: -minX, plusY: maxY, minusY: -minY };
}

export function encodeDSTFormatAdaptation({ adaptation, encoderOptions = {} }) {
  const validation = validateDSTFormatAdaptationV2(adaptation, encoderOptions.machineAdaptedStream);
  if (!adaptation?.valid || !validation.valid) return { valid: false, errors: [...(adaptation?.errors || []), ...validation.errors], bytes: new Uint8Array(), blob: null, meta: null };
  const label = encoderOptions.label || adaptation.headerMetadata.label || adaptation.config.label;
  const result = buildDSTFromCommands(adaptation.encoderCommands, { label, ce01Strict: true });
  return { ...result, valid: true, errors: [], encoderOptions: { label, ce01Strict: true } };
}

export function validateDSTBinaryAcceptance({ adaptation, encoderResult, parsedResult, comparisonEncoderResult = null, sourceStreamMutationCount = 0 }) {
  const bytes = encoderResult?.bytes instanceof Uint8Array ? encoderResult.bytes : new Uint8Array(); const errors = []; const warnings = [];
  if (!(encoderResult?.bytes instanceof Uint8Array)) errors.push(issue('DST_BINARY_UINT8ARRAY_REQUIRED', 'encoderResult.bytes', 'Encoder must return Uint8Array bytes.'));
  if (bytes.length < 516) errors.push(issue('DST_BINARY_TOO_SHORT', 'bytes', 'Binary must contain header, END and EOF.'));
  const records = decodeRecords(bytes); const parsed = parsedResult || parseDST(bytes); const header = bytes.length >= 512 ? parseEmbroideryHeader(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)) : null;
  const structure = bytes.length ? validateRecordStructure(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), 'DST') : null;
  const endIndexes = records.filter(record => record.type === 'end').map(record => record.index); const stopCount = records.filter(record => record.type === 'colorChange').length;
  const finalEOFPresent = bytes.at(-1) === 0x1A; const headerTerminatorPresent = bytes.slice(0, 512).includes(0x1A);
  const spans = actualSpans(adaptation, records); const acceptedAdaptation = createDSTFormatAdaptationV2({ ...adaptation, binaryRecordSpans: spans });
  const expectedRecordCount = adaptation.headerMetadata.expectedBinaryRecordCount; const actualBinaryRecordCount = records.length;
  if (!structure?.hasHeader512 || structure?.headerSize !== 512) errors.push(issue('DST_HEADER_SIZE_INVALID', 'header', 'Header must be 512 bytes.'));
  if (!headerTerminatorPresent) errors.push(issue('DST_HEADER_TERMINATOR_MISSING', 'header', 'Header terminator 0x1A is missing.'));
  if (!finalEOFPresent) errors.push(issue('DST_FINAL_EOF_MISSING', 'bytes', 'Final EOF 0x1A is missing.'));
  if (endIndexes.length !== 1 || endIndexes[0] !== records.length - 1) errors.push(issue('DST_BINARY_END_INVALID', 'records', 'Exactly one final binary END is required.'));
  if (actualBinaryRecordCount !== expectedRecordCount) errors.push(issue('DST_UNEXPECTED_ENCODER_RECORD_COUNT', 'records', 'Encoder record count differs from adaptation expectation.'));
  if (header?.ST !== actualBinaryRecordCount) errors.push(issue('DST_HEADER_ST_MISMATCH', 'header.ST', 'ST does not equal actual record count.'));
  if (header?.CO !== stopCount || stopCount !== adaptation.headerMetadata.expectedColorChangeCount) errors.push(issue('DST_HEADER_CO_MISMATCH', 'header.CO', 'CO/STOP count mismatch.'));
  const bounds = recordBounds(records); const expectedBounds = adaptation.headerMetadata.expectedBounds;
  if (JSON.stringify(bounds) !== JSON.stringify(expectedBounds) || [header?.plusX, header?.minusX, header?.plusY, header?.minusY].join(',') !== [bounds.plusX, bounds.minusX, bounds.plusY, bounds.minusY].join(',')) errors.push(issue('DST_HEADER_BOUNDS_MISMATCH', 'header.bounds', 'Header extents do not match stitch-target bounds.'));
  const finalRecord = records.at(-2) || records.at(-1); const finalMovement = [...records].reverse().find(record => record.type !== 'end' && record.type !== 'colorChange');
  const finalCommand = [...adaptation.encoderCommands].reverse().find(command => ['stitch', 'jump'].includes(command.type));
  const finalPositionVerified = !finalCommand || (finalMovement?.xUnits === Math.round(finalCommand.x * 10) && finalMovement?.yUnits === Math.round(finalCommand.y * 10));
  if (!finalPositionVerified) errors.push(issue('DST_FINAL_POSITION_MISMATCH', 'records', 'Parsed final position differs from adapter endpoint.'));
  if (!parsed?.binaryFileValid) errors.push(issue('DST_PARSER_ROUNDTRIP_FAILED', 'parsed', 'Existing parser rejected generated DST.'));
  spans.filter(span => !span.verified).forEach(span => errors.push(issue('DST_BINARY_SPAN_UNVERIFIED', `binaryRecordSpans.${span.id}`, 'Binary lineage span did not verify.')));
  const deterministicBytesVerified = comparisonEncoderResult?.bytes instanceof Uint8Array ? equalBytes(bytes, comparisonEncoderResult.bytes) : false;
  if (!deterministicBytesVerified) errors.push(issue('DST_BYTES_NONDETERMINISTIC', 'bytes', 'Two identical encoder invocations must produce equal bytes.'));
  if (sourceStreamMutationCount) errors.push(issue('DST_SOURCE_MUTATION_DETECTED', 'metadata', 'Source stream changed during export.'));
  const binaryLineageCoveragePercent = spans.length ? spans.filter(span => span.verified).length / spans.length * 100 : 100;
  const silentBinaryLineageDropCount = spans.filter(span => !span.verified).length;
  const trimSourceIds = new Set(adaptation.dispositions.filter(item => item.sourceType === 'trim').map(item => item.sourceMachineCommandId));
  const actualTrimBinaryRecordCount = spans.filter(span => trimSourceIds.has(span.sourceMachineCommandId)).reduce((sum, span) => sum + span.actualRecordCount, 0);
  const summary = {
    ...adaptation.summary, actualTrimBinaryRecordCount, binarySTOPRecordCount: stopCount, binaryENDRecordCount: endIndexes.length,
    expectedBinaryRecordCount: expectedRecordCount, actualBinaryRecordCount, binaryLineageCoveragePercent, silentBinaryLineageDropCount,
    duplicateBinaryLineageMappingCount: spans.length - new Set(spans.map(span => span.sourceMachineCommandId)).size,
    headerByteLength: structure?.headerSize || 0, binaryByteLength: bytes.length, finalEOFPresent, headerTerminatorPresent,
    parserRoundtripPassed: parsed?.binaryFileValid === true, deterministicBytesVerified, exactFinalEndpointVerified: adaptation.summary.exactFinalEndpointVerified && finalPositionVerified,
    sourceStreamMutationCount, encoderSourceFileModificationCount: 0, DSBInvocationCount: 0, Base44InvocationCount: 0,
  };
  const valid = errors.length === 0;
  return createDSTBinaryAcceptanceResultV2({
    format: 'DST', filename: `${adaptation.headerMetadata.label}.dst`, mimeType: encoderResult?.blob?.type || 'application/octet-stream',
    bytes, checksum: xorChecksum(bytes), parsed, header: { ...header, bounds, finalPosition: finalMovement ? { xUnits: finalMovement.xUnits, yUnits: finalMovement.yUnits } : { xUnits: 0, yUnits: 0 }, finalRecord },
    records, adaptation: acceptedAdaptation, valid, errors, warnings, summary,
    metadata: { DSTEncoderInvoked: true, binaryOutputGenerated: bytes.length > 0, DSBEncoderInvoked: false, Base44Invoked: false, applicationConnected: false, ce01Strict: true, ce01StrictEffect: 'appends final EOF byte 0x1A only' },
  });
}
