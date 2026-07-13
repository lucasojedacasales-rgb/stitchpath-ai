import { validateMachineAdaptedCommandStreamV2, validateMachineProfileV2 } from '../machineAdaptation/machineAdaptationValidation.js';
import { buildEngineV2DSTExport } from './dstExportPipeline.js';
import { buildEngineV2DSBExport } from './dsbExportPipeline.js';
import { createUnifiedBinaryArtifactFromFormatResult } from './binaryExportArtifact.js';
import { resolveBinaryExportFacadeConfig, validateBinaryExportFacadeConfig } from './binaryExportFacadeConfig.js';
import { createUnifiedBinaryExportDiagnostic } from './binaryExportFacadeDiagnostics.js';
import {
  BINARY_EXPORT_FORMATS, createBinaryExportRequestV2, createBinaryExportStatusV2, createBinaryFormatLimitationV2,
  createUnifiedBinaryExportResultV2, normalizeBinaryExportFormat,
} from './binaryExportFacadeModel.js';
import { buildBinaryExportReadiness } from './binaryExportReadiness.js';
import { validateUnifiedBinaryExportResultV2 } from './binaryExportFacadeValidation.js';

const issue = (code, path, message) => ({ code, path, message });
const equals = (left, right) => left?.length === right?.length && left.every((value, index) => value === right[index]);

function statusFor({ category, reasonCode, reason, adapterInvoked = false, binaryGenerated = false }) {
  return createBinaryExportStatusV2({
    category, accepted: category === 'accepted', transactionBlocked: category !== 'accepted', binaryGenerated,
    adapterInvoked, reasonCode, reason,
  });
}

function buildLimitations(format, status, formatResult) {
  const source = { facade: 'engine-v2-phase12d', formatResultVersion: formatResult?.version ?? null };
  if (format === 'DST' && status.accepted) return [
    createBinaryFormatLimitationV2({ code: 'SYNTHETIC_BINARY_ACCEPTANCE_ONLY', severity: 'warning', format, message: 'Binary acceptance uses deterministic synthetic fixtures only.', source }),
    createBinaryFormatLimitationV2({ code: 'PHYSICAL_MACHINE_ACCEPTANCE_NOT_VERIFIED', severity: 'warning', format, message: 'Physical-machine acceptance is not verified.', source }),
    createBinaryFormatLimitationV2({ code: 'LEGACY_DST_TRIM_SEQUENCE_USED', severity: 'info', format, message: 'DST trim intent uses the existing legacy three-zero-jump sequence.', source }),
    createBinaryFormatLimitationV2({ code: 'PHYSICAL_TRIM_BEHAVIOR_NOT_ISOLATED', severity: 'warning', format, message: 'Physical trim behavior has not been isolated or verified.', source }),
  ];
  if (format === 'DSB' && status.category === 'policy_blocked') return [
    createBinaryFormatLimitationV2({ code: 'DSB_TRIM_UNSUPPORTED', severity: 'blocking', format, message: 'The verified DSB contract has no physical trim representation.', source }),
  ];
  if (format === 'DSB' && status.accepted) {
    const acknowledgement = formatResult?.config?.trimNoOutputAcknowledgement ?? null;
    return [
      createBinaryFormatLimitationV2({ code: 'SYNTHETIC_BINARY_ACCEPTANCE_ONLY', severity: 'warning', format, message: 'Binary acceptance uses deterministic synthetic fixtures only.', source }),
      createBinaryFormatLimitationV2({ code: 'PHYSICAL_MACHINE_ACCEPTANCE_NOT_VERIFIED', severity: 'warning', format, message: 'Physical-machine acceptance is not verified.', source }),
      createBinaryFormatLimitationV2({ code: 'DSB_TRIM_INTENT_HAS_NO_BINARY_REPRESENTATION', severity: 'warning', format, message: 'DSB trim intents produce no binary records under the acknowledged policy.', acknowledged: Boolean(acknowledgement), acknowledgement, source }),
      createBinaryFormatLimitationV2({ code: 'PHYSICAL_TRIM_SUPPORT_NOT_VERIFIED', severity: 'warning', format, message: 'Physical DSB trim support is not verified.', acknowledged: Boolean(acknowledgement), acknowledgement, source }),
    ];
  }
  return [];
}

function buildSummary({ requestedFormat, normalizedFormat, selectedAdapter, status, artifact, readiness, limitations, formatResult, invocations, sourceCommandCount, sourceStreamMutationCount }) {
  const direct = formatResult?.summary || {};
  const artifactParity = !artifact || (artifact.format === formatResult?.format && artifact.byteLength === formatResult?.binary?.byteLength
    && artifact.checksum === formatResult?.binary?.checksum && equals(artifact.bytes, formatResult?.binary?.bytes));
  const identityParity = !artifact || (artifact.filename === formatResult?.filename && artifact.mimeType === formatResult?.mimeType);
  const parserParity = !artifact || artifact.parserRoundtripPassed === direct.parserRoundtripPassed;
  const eofParity = !artifact || artifact.finalEOFPresent === direct.finalEOFPresent;
  const parityChecks = formatResult ? [artifactParity, identityParity, parserParity, eofParity, true] : [];
  return {
    requestedFormat: requestedFormat ?? null, normalizedFormat, selectedAdapter, exportAccepted: status.accepted,
    transactionBlocked: status.transactionBlocked, binaryGenerated: status.binaryGenerated, sourceMachineCommandCount: sourceCommandCount,
    artifactByteLength: artifact?.byteLength ?? 0, artifactChecksum: artifact?.checksum ?? null,
    sourceCommandDispositionCoveragePercent: direct.sourceCommandDispositionCoveragePercent ?? 0,
    binaryLineageCoveragePercent: direct.binaryLineageCoveragePercent ?? 0,
    parserRoundtripPassed: artifact?.parserRoundtripPassed === true, deterministicBytesVerified: artifact?.deterministicBytesVerified === true,
    finalEOFPresent: artifact?.finalEOFPresent === true, trimIntentPresent: readiness.trimIntentPresent,
    trimBinaryRepresentationPresent: readiness.trimBinaryRepresentationPresent, physicalTrimEncoded: false,
    physicalTrimSupportVerified: false, physicalMachineAcceptanceVerified: false, limitationCount: limitations.length,
    blockingLimitationCount: limitations.filter(item => item.severity === 'blocking').length,
    warningLimitationCount: limitations.filter(item => item.severity === 'warning').length,
    ...invocations, formatResultParityPercent: parityChecks.length ? parityChecks.filter(Boolean).length / parityChecks.length * 100 : 0,
    formatMetricMutationCount: parityChecks.filter(value => !value).length, formatWarningSuppressionCount: 0,
    formatErrorSuppressionCount: 0, sourceStreamMutationCount, Base44InvocationCount: 0,
    applicationInvocationCount: 0, browserDownloadCreationCount: 0,
  };
}

function validateSourceForRouting(machineAdaptedStream) {
  const errors = [];
  if (machineAdaptedStream?.valid !== true || !Array.isArray(machineAdaptedStream?.commands)) errors.push(issue('BINARY_EXPORT_SOURCE_STREAM_INVALID', 'machineAdaptedStream', 'A valid Phase 11 command stream is required.'));
  errors.push(...validateMachineProfileV2(machineAdaptedStream?.machineProfile).errors);
  const canonicalContract = { commands: (machineAdaptedStream?.commands || []).map(command => ({ id: command.sourceCanonicalCommandId, type: command.type })) };
  errors.push(...validateMachineAdaptedCommandStreamV2(machineAdaptedStream, canonicalContract).errors);
  return errors;
}

export function exportMachineAdaptedStreamV2({ machineAdaptedStream, format, metadata = {}, formatConfig = {}, config: rawConfig = {} }) {
  const before = JSON.stringify(machineAdaptedStream); const configValidation = validateBinaryExportFacadeConfig(rawConfig);
  const config = resolveBinaryExportFacadeConfig(rawConfig); const normalizedFormat = normalizeBinaryExportFormat(format);
  const request = createBinaryExportRequestV2({ machineAdaptedStream, format, label: formatConfig?.label ?? null, metadata, formatConfig });
  let selectedAdapter = null; let formatResult = null; let status; let errors = []; let warnings = [];
  const invocations = { DSTAdapterInvocationCount: 0, DSBAdapterInvocationCount: 0, totalFormatAdapterInvocationCount: 0, crossFormatInvocationCount: 0, formatFallbackCount: 0 };

  if (!normalizedFormat) {
    errors = [issue('BINARY_EXPORT_FORMAT_REQUIRED', 'format', 'Explicit binary format is required.')];
    status = statusFor({ category: 'invalid_request', reasonCode: 'BINARY_EXPORT_FORMAT_REQUIRED', reason: errors[0].message });
  } else if (!BINARY_EXPORT_FORMATS.includes(normalizedFormat)) {
    errors = [issue('UNSUPPORTED_BINARY_EXPORT_FORMAT', 'format', `Unsupported binary format ${normalizedFormat}.`)];
    status = statusFor({ category: 'unsupported', reasonCode: 'UNSUPPORTED_BINARY_EXPORT_FORMAT', reason: errors[0].message });
  } else {
    const sourceErrors = validateSourceForRouting(machineAdaptedStream); const requestErrors = [...configValidation.errors, ...sourceErrors];
    if (requestErrors.length) {
      errors = requestErrors;
      status = statusFor({ category: 'invalid_request', reasonCode: requestErrors[0].code, reason: requestErrors[0].message });
    } else if (normalizedFormat === 'DST') {
      selectedAdapter = 'engineV2-dst'; invocations.DSTAdapterInvocationCount = 1; invocations.totalFormatAdapterInvocationCount = 1;
      formatResult = buildEngineV2DSTExport({ machineAdaptedStream, metadata, config: formatConfig });
    } else {
      selectedAdapter = 'engineV2-dsb'; invocations.DSBAdapterInvocationCount = 1; invocations.totalFormatAdapterInvocationCount = 1;
      formatResult = buildEngineV2DSBExport({ machineAdaptedStream, metadata, config: formatConfig });
    }
  }

  if (formatResult) {
    errors = [...formatResult.errors]; warnings = [...formatResult.warnings];
    if (formatResult.valid && formatResult.binary?.valid) status = statusFor({ category: 'accepted', reasonCode: 'FORMAT_ADAPTER_ACCEPTED', reason: `${normalizedFormat} adapter accepted binary.`, adapterInvoked: true, binaryGenerated: true });
    else if (normalizedFormat === 'DSB' && formatResult.summary?.transactionBlocked && formatResult.summary?.blockedTrimCount > 0) status = statusFor({ category: 'policy_blocked', reasonCode: 'DSB_TRIM_UNSUPPORTED', reason: 'DSB trim policy blocked the transaction.', adapterInvoked: true });
    else status = statusFor({ category: 'adapter_error', reasonCode: formatResult.errors[0]?.code || 'FORMAT_ADAPTER_REJECTED', reason: formatResult.errors[0]?.message || 'Selected format adapter rejected the request.', adapterInvoked: true });
  }

  const limitations = buildLimitations(normalizedFormat, status, formatResult);
  const artifact = status.accepted ? createUnifiedBinaryArtifactFromFormatResult(formatResult) : null;
  const readiness = buildBinaryExportReadiness({ format: normalizedFormat, status, artifact, formatResult, limitations });
  const sourceStreamMutationCount = before === JSON.stringify(machineAdaptedStream) ? 0 : 1;
  const summary = buildSummary({ requestedFormat: format, normalizedFormat, selectedAdapter, status, artifact, readiness, limitations, formatResult, invocations, sourceCommandCount: machineAdaptedStream?.commands?.length ?? 0, sourceStreamMutationCount });
  const draft = createUnifiedBinaryExportResultV2({
    request, status, artifact, readiness, limitations, selectedFormat: BINARY_EXPORT_FORMATS.includes(normalizedFormat) ? normalizedFormat : null,
    selectedAdapter, formatResult, valid: status.accepted, errors, warnings, summary, config,
    metadata: { ...structuredClone(metadata), facadeApplied: true, applicationConnected: false, ExportModalConnected: false, Base44Invoked: false, browserDownloadCreated: false },
  });
  const validation = validateUnifiedBinaryExportResultV2(draft, machineAdaptedStream);
  const normalized = createUnifiedBinaryExportResultV2({ ...draft, valid: draft.valid && validation.valid, errors: validation.valid ? draft.errors : [...draft.errors, ...validation.errors], metadata: { ...draft.metadata, validationPassed: validation.valid } });
  const diagnostic = createUnifiedBinaryExportDiagnostic({ machineAdaptedStream, unifiedResult: normalized });
  return createUnifiedBinaryExportResultV2({ ...normalized, diagnostic });
}
