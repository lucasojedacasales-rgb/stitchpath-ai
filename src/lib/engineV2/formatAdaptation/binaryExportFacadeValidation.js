import { BINARY_EXPORT_FORMATS, BINARY_EXPORT_STATUS_CATEGORIES, BINARY_EXPORT_STATUS_CODES, fingerprintMachineAdaptedStreamV2 } from './binaryExportFacadeModel.js';

const issue = (code, path, message) => ({ code, path, message });
const equalBytes = (left, right) => left?.length === right?.length && left.every((value, index) => value === right[index]);
const checksum = bytes => bytes.reduce((value, byte) => value ^ byte, 0);

export function validateBinaryExportRequestV2(request, machineAdaptedStream = null) {
  const errors = [];
  if (!request?.format) errors.push(issue('BINARY_EXPORT_FORMAT_REQUIRED', 'format', 'Explicit binary format is required.'));
  else if (!BINARY_EXPORT_FORMATS.includes(request.format)) errors.push(issue('UNSUPPORTED_BINARY_EXPORT_FORMAT', 'format', `Unsupported binary format ${request.format}.`));
  if (!/^[0-9a-f]{8}$/.test(request?.sourceStreamFingerprint || '')) errors.push(issue('BINARY_EXPORT_FINGERPRINT_INVALID', 'sourceStreamFingerprint', 'Source fingerprint must be deterministic eight-character hexadecimal text.'));
  const expectedId = `binary-export-request:${request?.format || 'missing'}:${request?.sourceStreamFingerprint}`;
  if (request?.id !== expectedId) errors.push(issue('BINARY_EXPORT_REQUEST_ID_INVALID', 'id', 'Request ID is not deterministic.'));
  if (!Number.isInteger(request?.sourceCommandCount) || request.sourceCommandCount < 0) errors.push(issue('BINARY_EXPORT_SOURCE_COUNT_INVALID', 'sourceCommandCount', 'Source command count must be a non-negative integer.'));
  if (machineAdaptedStream && request?.sourceStreamFingerprint !== fingerprintMachineAdaptedStreamV2(machineAdaptedStream)) errors.push(issue('BINARY_EXPORT_SOURCE_FINGERPRINT_MISMATCH', 'sourceStreamFingerprint', 'Request fingerprint differs from source stream.'));
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function validateBinaryExportStatusV2(status) {
  const errors = [];
  if (!BINARY_EXPORT_STATUS_CATEGORIES.includes(status?.category)) errors.push(issue('BINARY_EXPORT_STATUS_CATEGORY_INVALID', 'category', 'Status category is invalid.'));
  if (status?.code !== BINARY_EXPORT_STATUS_CODES[status?.category]) errors.push(issue('BINARY_EXPORT_STATUS_CODE_INVALID', 'code', 'Status code does not match category.'));
  if (status?.category === 'accepted' && (!status.accepted || status.transactionBlocked || !status.binaryGenerated || !status.adapterInvoked)) errors.push(issue('BINARY_EXPORT_ACCEPTED_STATUS_INCONSISTENT', 'status', 'Accepted status requires binary and one adapter invocation.'));
  if (status?.category !== 'accepted' && (status.accepted || status.binaryGenerated)) errors.push(issue('BINARY_EXPORT_BLOCKED_STATUS_INCONSISTENT', 'status', 'Non-accepted status cannot claim accepted binary.'));
  if (['unsupported', 'invalid_request'].includes(status?.category) && status.adapterInvoked) errors.push(issue('BINARY_EXPORT_PRE_ROUTING_STATUS_INVOKED_ADAPTER', 'adapterInvoked', 'Unsupported and invalid requests cannot invoke an adapter.'));
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function validateUnifiedBinaryArtifactV2(artifact) {
  const errors = [];
  if (!BINARY_EXPORT_FORMATS.includes(artifact?.format)) errors.push(issue('BINARY_ARTIFACT_FORMAT_INVALID', 'format', 'Artifact format must be DST or DSB.'));
  if (!(artifact?.bytes instanceof Uint8Array)) errors.push(issue('BINARY_ARTIFACT_BYTES_REQUIRED', 'bytes', 'Artifact bytes must be Uint8Array.'));
  if (artifact?.byteLength !== artifact?.bytes?.length) errors.push(issue('BINARY_ARTIFACT_LENGTH_MISMATCH', 'byteLength', 'Artifact byte length differs from bytes.'));
  if (artifact?.bytes instanceof Uint8Array && artifact.checksum !== checksum(artifact.bytes)) errors.push(issue('BINARY_ARTIFACT_CHECKSUM_MISMATCH', 'checksum', 'Artifact checksum differs from bytes.'));
  if (!artifact?.filename || !artifact?.mimeType) errors.push(issue('BINARY_ARTIFACT_IDENTITY_REQUIRED', 'filename', 'Artifact filename and MIME are required.'));
  if (artifact?.headerByteLength !== 512) errors.push(issue('BINARY_ARTIFACT_HEADER_INVALID', 'headerByteLength', 'Validated artifacts require a 512-byte header.'));
  if (!artifact?.finalEOFPresent || !artifact?.parserRoundtripPassed || !artifact?.deterministicBytesVerified) errors.push(issue('BINARY_ARTIFACT_ACCEPTANCE_INCOMPLETE', 'acceptance', 'Artifact must preserve EOF, parser, and determinism acceptance.'));
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function validateBinaryExportReadinessV2(readiness) {
  const errors = [];
  if (readiness?.physicalMachineAcceptanceVerified) errors.push(issue('BINARY_PHYSICAL_MACHINE_ACCEPTANCE_UNVERIFIED', 'physicalMachineAcceptanceVerified', 'Physical machine acceptance cannot be claimed.'));
  if (readiness?.readyForApplicationIntegration) errors.push(issue('BINARY_APPLICATION_READINESS_FORBIDDEN', 'readyForApplicationIntegration', 'Phase 12D is disconnected from the application.'));
  if (readiness?.readyForProductionRelease) errors.push(issue('BINARY_PRODUCTION_READINESS_FORBIDDEN', 'readyForProductionRelease', 'Phase 12D is not production-ready.'));
  if (readiness?.readyForDisconnectedBinaryTesting && (!readiness.structurallyAccepted || !readiness.binaryGenerated || !readiness.parserRoundtripPassed || !readiness.deterministicBytesVerified)) errors.push(issue('BINARY_DISCONNECTED_READINESS_INCONSISTENT', 'readyForDisconnectedBinaryTesting', 'Disconnected readiness requires structural binary acceptance.'));
  if (readiness?.format === 'DSB' && readiness?.physicalTrimSupportVerified) errors.push(issue('DSB_PHYSICAL_TRIM_SUPPORT_UNVERIFIED', 'physicalTrimSupportVerified', 'DSB physical trim support cannot be claimed.'));
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function validateUnifiedBinaryExportResultV2(result, machineAdaptedStream) {
  const errors = []; const statusValidation = validateBinaryExportStatusV2(result?.status); const readinessValidation = validateBinaryExportReadinessV2(result?.readiness);
  errors.push(...statusValidation.errors, ...readinessValidation.errors);
  const requestValidation = validateBinaryExportRequestV2(result?.request, machineAdaptedStream);
  if (!['invalid_request', 'unsupported'].includes(result?.status?.category)) errors.push(...requestValidation.errors);
  if (result?.status?.accepted && !result?.artifact) errors.push(issue('BINARY_ACCEPTED_RESULT_MISSING_ARTIFACT', 'artifact', 'Accepted result requires an artifact.'));
  if (!result?.status?.accepted && result?.artifact) errors.push(issue('BINARY_BLOCKED_RESULT_HAS_ARTIFACT', 'artifact', 'Blocked result cannot contain an artifact.'));
  if (result?.artifact) errors.push(...validateUnifiedBinaryArtifactV2(result.artifact).errors);
  const expectedAdapter = !result?.status?.adapterInvoked ? null : result?.selectedFormat === 'DST' ? 'engineV2-dst' : result?.selectedFormat === 'DSB' ? 'engineV2-dsb' : null;
  if (result?.selectedAdapter !== expectedAdapter) errors.push(issue('BINARY_SELECTED_ADAPTER_MISMATCH', 'selectedAdapter', 'Selected adapter differs from requested format.'));
  if (BINARY_EXPORT_FORMATS.includes(result?.request?.format) && result?.selectedFormat !== result.request.format) errors.push(issue('BINARY_SELECTED_FORMAT_MISMATCH', 'selectedFormat', 'Selected format differs from the explicit request.'));
  if (result?.formatResult && result.formatResult.format !== result.selectedFormat) errors.push(issue('BINARY_FORMAT_RESULT_MISMATCH', 'formatResult.format', 'Direct adapter format differs from selected format.'));
  const summary = result?.summary || {}; const totalInvocations = (summary.DSTAdapterInvocationCount || 0) + (summary.DSBAdapterInvocationCount || 0);
  if (totalInvocations > 1 || summary.totalFormatAdapterInvocationCount !== totalInvocations) errors.push(issue('BINARY_MULTIPLE_ADAPTER_INVOCATIONS', 'summary', 'At most one format adapter may be invoked.'));
  if ((result?.selectedFormat === 'DST' && (summary.DSBAdapterInvocationCount || 0) > 0) || (result?.selectedFormat === 'DSB' && (summary.DSTAdapterInvocationCount || 0) > 0)) errors.push(issue('BINARY_CROSS_FORMAT_ADAPTER_SELECTED', 'summary', 'The adapter invocation does not match the selected format.'));
  if (summary.crossFormatInvocationCount !== 0) errors.push(issue('BINARY_CROSS_FORMAT_INVOCATION', 'summary.crossFormatInvocationCount', 'Cross-format invocation is forbidden.'));
  if (summary.formatFallbackCount !== 0) errors.push(issue('BINARY_FORMAT_FALLBACK_DETECTED', 'summary.formatFallbackCount', 'Format fallback is forbidden.'));
  if (summary.Base44InvocationCount || summary.applicationInvocationCount || summary.browserDownloadCreationCount) errors.push(issue('BINARY_FORBIDDEN_EXTERNAL_INVOCATION', 'summary', 'Base44, application, and browser download invocations are forbidden.'));
  if (summary.sourceStreamMutationCount) errors.push(issue('BINARY_SOURCE_STREAM_MUTATED', 'summary.sourceStreamMutationCount', 'Source stream mutation detected.'));
  if (result?.artifact && result?.formatResult?.binary) {
    const direct = result.formatResult.binary;
    if (result.artifact.format !== result.selectedFormat || result.artifact.byteLength !== direct.byteLength || result.artifact.checksum !== direct.checksum || !equalBytes(result.artifact.bytes, direct.bytes)) errors.push(issue('BINARY_ARTIFACT_DIRECT_PARITY_FAILED', 'artifact', 'Artifact differs from selected direct adapter binary.'));
    if (result.artifact.filename !== result.formatResult.filename || result.artifact.mimeType !== result.formatResult.mimeType) errors.push(issue('BINARY_ARTIFACT_IDENTITY_MUTATED', 'artifact', 'Artifact filename or MIME differs from direct adapter.'));
  }
  if (result?.formatResult) {
    const directSummary = result.formatResult.summary || {};
    if (summary.sourceCommandDispositionCoveragePercent !== directSummary.sourceCommandDispositionCoveragePercent) errors.push(issue('BINARY_SOURCE_COVERAGE_MUTATED', 'summary.sourceCommandDispositionCoveragePercent', 'Source command disposition coverage differs from the direct adapter.'));
    if (summary.binaryLineageCoveragePercent !== directSummary.binaryLineageCoveragePercent) errors.push(issue('BINARY_LINEAGE_COVERAGE_MUTATED', 'summary.binaryLineageCoveragePercent', 'Binary lineage coverage differs from the direct adapter.'));
    if (summary.parserRoundtripPassed !== (directSummary.parserRoundtripPassed === true)) errors.push(issue('BINARY_PARSER_STATUS_MUTATED', 'summary.parserRoundtripPassed', 'Parser roundtrip status differs from the direct adapter.'));
    if (summary.finalEOFPresent !== (directSummary.finalEOFPresent === true)) errors.push(issue('BINARY_EOF_STATUS_MUTATED', 'summary.finalEOFPresent', 'EOF status differs from the direct adapter.'));
    if (JSON.stringify(result.errors) !== JSON.stringify(result.formatResult.errors)) errors.push(issue('BINARY_FORMAT_ERRORS_SUPPRESSED', 'errors', 'Direct adapter errors must be preserved exactly.'));
    if (JSON.stringify(result.warnings) !== JSON.stringify(result.formatResult.warnings)) errors.push(issue('BINARY_FORMAT_WARNINGS_SUPPRESSED', 'warnings', 'Direct adapter warnings must be preserved exactly.'));
  }
  if (result?.selectedFormat === 'DSB' && result?.formatResult?.summary?.trimIntentPresent && !result.limitations.some(item => ['DSB_TRIM_UNSUPPORTED', 'DSB_TRIM_INTENT_HAS_NO_BINARY_REPRESENTATION'].includes(item.code))) errors.push(issue('DSB_TRIM_LIMITATION_MISSING', 'limitations', 'DSB trim limitation must remain explicit.'));
  if ((result?.formatResult && summary.formatResultParityPercent !== 100) || summary.formatMetricMutationCount || summary.formatWarningSuppressionCount || summary.formatErrorSuppressionCount) errors.push(issue('BINARY_FORMAT_PARITY_INCOMPLETE', 'summary', 'Direct format parity must remain complete.'));
  if (result?.valid !== result?.status?.accepted) errors.push(issue('BINARY_UNIFIED_VALIDITY_INCONSISTENT', 'valid', 'Unified valid flag must equal accepted status.'));
  return { valid: errors.length === 0, errors, warnings: [] };
}
