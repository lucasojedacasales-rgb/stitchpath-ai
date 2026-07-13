import { createDSBBinaryAcceptanceResultV2, createDSBBinaryRecordSpanV2, createDSBFormatAdaptationV2 } from './dsbFormatModel.js';

const issue = (code, path, message) => ({ code, path, message });
const equalBytes = (left, right) => left?.length === right?.length && left.every((value, index) => value === right[index]);
const xorChecksum = bytes => bytes.reduce((checksum, byte) => checksum ^ byte, 0);

function verifyRecord(plan, record) {
  if (!plan || !record) return false;
  const expectedY = plan.dyUnits < 0 ? plan.dyUnits + 256 : plan.dyUnits;
  const expectedX = plan.dxUnits < 0 ? plan.dxUnits + 256 : plan.dxUnits;
  return record.type === plan.type && record.commandByte === plan.expectedCommandByte && record.dxUnits === plan.dxUnits && record.dyUnits === plan.dyUnits
    && record.bytes[0] === plan.expectedCommandByte && record.bytes[1] === expectedY && record.bytes[2] === expectedX;
}

function acceptedSpans(adaptation, records) {
  return adaptation.binaryRecordSpans.map(span => {
    const plans = span.sourceRecordPlanIds.map(id => adaptation.byRecordPlanId[id]).filter(Boolean); const expected = plans.length;
    const first = expected ? span.expectedFirstBinaryRecordIndex : null; const actual = expected ? records.slice(first, first + expected) : [];
    const verified = expected === span.expectedBinaryRecordCount && actual.length === expected && plans.every((plan, index) => verifyRecord(plan, actual[index]));
    return createDSBBinaryRecordSpanV2({
      ...span, actualFirstBinaryRecordIndex: actual.length ? first : null, actualLastBinaryRecordIndex: actual.length ? first + actual.length - 1 : null,
      actualBinaryRecordCount: actual.length, verified: expected ? verified : span.expectedFirstBinaryRecordIndex == null && span.expectedLastBinaryRecordIndex == null,
      source: { ...span.source, acceptance: 'engine-v2-phase12c' },
    });
  });
}

export function validateDSBBinaryAcceptance({ adaptation, binaryResult, parsedResult, comparisonBinaryResult = null, sourceStreamMutationCount = 0 }) {
  const bytes = binaryResult?.bytes instanceof Uint8Array ? binaryResult.bytes : new Uint8Array(); const errors = []; const warnings = [];
  if (!(binaryResult?.bytes instanceof Uint8Array)) errors.push(issue('DSB_BINARY_UINT8ARRAY_REQUIRED', 'binaryResult.bytes', 'Binary builder must return Uint8Array bytes.'));
  if (!adaptation?.valid) errors.push(issue('DSB_BINARY_ACCEPTANCE_REQUIRES_VALID_ADAPTATION', 'adaptation.valid', 'Blocked adaptation cannot enter binary acceptance.'));
  const parsed = parsedResult; if (!parsed?.valid) errors.push(issue('DSB_PARSER_ROUNDTRIP_FAILED', 'parsedResult', 'Generated DSB failed parser roundtrip.'));
  const records = parsed?.records || []; const spans = acceptedSpans(adaptation, records);
  const acceptedAdaptation = createDSBFormatAdaptationV2({ ...adaptation, binaryRecordSpans: spans });
  const endCount = records.filter(record => record.type === 'end').length; const colorCount = records.filter(record => record.type === 'colorChange').length;
  const finalEOFPresent = bytes.at(-1) === 0x1A; const expectedBinaryRecordCount = adaptation.headerMetadata.expectedBinaryRecordCount;
  if (bytes.length < 516) errors.push(issue('DSB_BINARY_TOO_SHORT', 'bytes', 'Binary must contain header, END and EOF.'));
  if (parsed?.header?.byteLength !== 512) errors.push(issue('DSB_HEADER_SIZE_INVALID', 'parsed.header', 'Header must be 512 bytes.'));
  if (!parsed?.header?.terminatorPresent) errors.push(issue('DSB_HEADER_TERMINATOR_MISSING', 'parsed.header', 'Header terminator is missing.'));
  if (!finalEOFPresent) errors.push(issue('DSB_FINAL_EOF_MISSING', 'bytes', 'Final EOF 0x1A is missing.'));
  if (endCount !== 1 || records.at(-1)?.type !== 'end') errors.push(issue('DSB_BINARY_END_INVALID', 'records', 'Exactly one final END record is required.'));
  if (records.length !== expectedBinaryRecordCount) errors.push(issue('DSB_BINARY_RECORD_COUNT_MISMATCH', 'records', 'Binary record count differs from record plan.'));
  if (parsed?.header?.ST !== records.length) errors.push(issue('DSB_HEADER_ST_MISMATCH', 'header.ST', 'ST differs from actual record count.'));
  if (parsed?.header?.CO !== colorCount || colorCount !== adaptation.headerMetadata.expectedColorChangeCount) errors.push(issue('DSB_HEADER_CO_MISMATCH', 'header.CO', 'CO differs from color-change record count.'));
  if (JSON.stringify(parsed?.decodedBounds) !== JSON.stringify(binaryResult?.header?.bounds)) errors.push(issue('DSB_HEADER_BOUNDS_MISMATCH', 'header.bounds', 'Header bounds differ from decoded full movement stream.'));
  const expectedFinal = adaptation.headerMetadata.expectedFinalPosition;
  if (parsed?.finalPosition?.xUnits !== expectedFinal?.xUnits || parsed?.finalPosition?.yUnits !== expectedFinal?.yUnits) errors.push(issue('DSB_FINAL_POSITION_MISMATCH', 'parsed.finalPosition', 'Parsed final position differs from adapter endpoint.'));
  spans.filter(span => !span.verified).forEach(span => errors.push(issue('DSB_BINARY_SPAN_UNVERIFIED', `binaryRecordSpans.${span.id}`, 'Binary lineage span did not verify.')));
  const deterministicBytesVerified = comparisonBinaryResult?.bytes instanceof Uint8Array ? equalBytes(bytes, comparisonBinaryResult.bytes) : false;
  if (!deterministicBytesVerified) errors.push(issue('DSB_BYTES_NONDETERMINISTIC', 'bytes', 'Two identical binary builds must produce equal bytes.'));
  if (sourceStreamMutationCount) errors.push(issue('DSB_SOURCE_MUTATION_DETECTED', 'metadata', 'Source stream changed during export.'));
  const binaryLineageCoveragePercent = spans.length ? spans.filter(span => span.verified).length / spans.length * 100 : 100;
  const silentBinaryLineageDropCount = spans.filter(span => !span.verified).length;
  const trimIntentPresent = adaptation.dispositions.some(item => item.sourceType === 'trim');
  const summary = {
    ...adaptation.summary, binaryColorChangeRecordCount: colorCount, binaryEndRecordCount: endCount,
    expectedBinaryRecordCount, actualBinaryRecordCount: records.length, binaryLineageCoveragePercent, silentBinaryLineageDropCount,
    duplicateBinaryLineageMappingCount: spans.length - new Set(spans.map(span => span.sourceMachineCommandId)).size,
    headerByteLength: parsed?.header?.byteLength || 0, binaryByteLength: bytes.length, finalEOFPresent,
    parserRoundtripPassed: parsed?.valid === true, deterministicBytesVerified,
    exactFinalEndpointVerified: adaptation.summary.exactFinalEndpointVerified && parsed?.finalPosition?.xUnits === expectedFinal?.xUnits && parsed?.finalPosition?.yUnits === expectedFinal?.yUnits,
    trimIntentPresent, trimBinaryRecordCount: 0, trimBinaryRepresentationPresent: false, physicalTrimEncoded: false, physicalTrimSupportVerified: false,
    transactionBlocked: false, binaryOutputGenerated: bytes.length > 0, sourceStreamMutationCount,
    encoderSourceFileModificationCount: 0, DSTInvocationCount: 0, Base44InvocationCount: 0,
  };
  const valid = errors.length === 0;
  return createDSBBinaryAcceptanceResultV2({
    format: 'DSB', filename: `${adaptation.headerMetadata.label}.dsb`, mimeType: binaryResult?.blob?.type || 'application/octet-stream',
    bytes, checksum: xorChecksum(bytes), parsed, header: { ...parsed?.header, bounds: parsed?.decodedBounds, finalPosition: parsed?.finalPosition },
    records, adaptation: acceptedAdaptation, valid, errors, warnings, summary,
    metadata: {
      DSBLowLevelEncoderInvoked: binaryResult?.metadata?.DSBLowLevelEncoderInvoked === true, binaryOutputGenerated: bytes.length > 0,
      DSTEncoderInvoked: false, Base44Invoked: false, applicationConnected: false,
      trimPolicy: adaptation.config.trimPolicy, trimNoOutputAcknowledgement: adaptation.config.trimNoOutputAcknowledgement,
      trimIntentPresent, physicalTrimEncoded: false, physicalTrimSupportVerified: false,
    },
  });
}
