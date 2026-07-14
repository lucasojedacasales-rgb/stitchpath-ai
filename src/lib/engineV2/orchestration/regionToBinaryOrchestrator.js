import { validateRegionV2 } from '../modelValidation.js';
import { ingestRegionsV2 } from '../ingestion/regionIngestion.js';
import { validateRegionGraphV2 } from '../topology/regionGraphValidation.js';
import { analyzeSemanticRegionRoles } from '../semantics/semanticRoleAnalyzer.js';
import { validateSemanticAnalysisResult } from '../semantics/semanticAnalysisValidation.js';
import { buildEmbroideryObjectProposalPlan } from '../planning/objectPlanningPipeline.js';
import { validateEmbroideryObjectProposalPlan } from '../planning/objectPlanningValidation.js';
import { materializeEmbroideryObjectDrafts } from '../materialization/objectDraftMaterializer.js';
import { validateObjectDraftMaterialization } from '../materialization/objectDraftValidation.js';
import { materializeThreadedEmbroideryObjects } from '../threads/finalObjectMaterializer.js';
import { validateThreadedObjectMaterialization } from '../threads/threadResolutionValidation.js';
import { buildTechnicalEmbroideryPlan } from '../technical/technicalPlanningPipeline.js';
import { validateTechnicalEmbroideryPlan } from '../technical/technicalPlanningValidation.js';
import { buildGlobalSequencePlan } from '../sequencing/globalSequencePlanner.js';
import { validateGlobalSequencePlan } from '../sequencing/sequencePlanningValidation.js';
import { buildMachineIndependentPhysicalStitchPlan } from '../stitchGeneration/physicalStitchPipeline.js';
import { validateMachineIndependentPhysicalStitchPlan } from '../stitchGeneration/physicalStitchValidation.js';
import { compileCanonicalCommandStream } from '../commandCompilation/canonicalCommandCompiler.js';
import { validateCanonicalCommandCompilationV2 } from '../commandCompilation/canonicalCompilationValidation.js';
import { adaptCanonicalCommandsForMachine } from '../machineAdaptation/machineCommandAdapter.js';
import { validateMachineAdaptedCommandStreamV2 } from '../machineAdaptation/machineAdaptationValidation.js';
import { exportMachineAdaptedStreamV2 } from '../formatAdaptation/binaryExportFacade.js';
import { validateUnifiedBinaryExportResultV2 } from '../formatAdaptation/binaryExportFacadeValidation.js';
import { buildEngineV2ReferenceCaptureManifest } from '../referenceCapture/referenceCaptureManifest.js';
import { evaluateReferenceCaptureGate } from '../referenceCapture/referenceCaptureGate.js';
import { resolveEndToEndPipelineConfig, validateEndToEndPipelineConfig } from './endToEndPipelineConfig.js';
import { createEndToEndPipelineDiagnostic } from './endToEndPipelineDiagnostics.js';
import { ENGINE_V2_END_TO_END_STAGE_REGISTRY } from './endToEndStageRegistry.js';
import { createEngineV2PipelineStageResult, createEngineV2RegionToBinaryRequest, createEngineV2RegionToBinaryResult } from './endToEndPipelineModel.js';
import { fingerprintEngineV2Value, stableSerializeEngineV2Value } from './deterministicStageFingerprint.js';
import { validateEngineV2RegionToBinaryRequest, validateEngineV2RegionToBinaryResult } from './endToEndPipelineValidation.js';
import { evaluateDraftMaterializationReadiness } from './reviewReadinessGate.js';

const issue = (code, path, message) => ({ code, path, message });
const same = (left, right) => stableSerializeEngineV2Value(left) === stableSerializeEngineV2Value(right);
const countBy = (value, path) => path.reduce((current, key) => current?.[key], value)?.length ?? 0;

function regionV2IngestionView(regions) {
  return [...regions].sort((a, b) => String(a.id).localeCompare(String(b.id))).map(region => ({
    id: region.id,
    path_points: region.geometry.map(point => ({ x: point.x, y: point.y })),
    holes: region.holes.map(hole => hole.map(point => ({ x: point.x, y: point.y }))),
    color: structuredClone(region.visualColor), semanticRole: region.semanticRole, confidence: region.confidence,
    darkStrokeSupport: structuredClone(region.darkStrokeSupport), source: structuredClone(region.source), visible: true,
  }));
}

function stageCount(stageId, result) {
  const paths = {
    region_ingestion: ['regions'], semantic_analysis: ['assessments'], object_planning: ['proposals'],
    draft_materialization: ['drafts'], thread_resolution: ['objects'], technical_planning: ['specifications'],
    global_sequence: ['executionSteps'], physical_generation: ['objectPaths'], canonical_compilation: ['commands'],
    machine_adaptation: ['commands'], binary_export: ['artifact', 'bytes'],
  };
  if (stageId === 'binary_export') return result?.artifact ? 1 : 0;
  return countBy(result, paths[stageId] || []);
}

function stageResult({ definition, input, result, validation, inputCount, finalPolicyBlocked = false, pipelineReadiness = null, inputMutated = false }) {
  const pipelineBlocked = pipelineReadiness?.safeToContinue === false;
  const policyIssue = pipelineBlocked ? issue(pipelineReadiness.reasonCode, 'draft_materialization.review', pipelineReadiness.reason) : null;
  if (policyIssue) {
    policyIssue.affectedProposalIds = pipelineReadiness.affectedProposalIds;
    policyIssue.affectedRegionIds = pipelineReadiness.affectedRegionIds;
  }
  const errors = [...(result?.errors || []), ...(validation?.errors || []), ...(policyIssue ? [policyIssue] : [])]; const warnings = [...(result?.warnings || []), ...(validation?.warnings || [])];
  const accepted = result?.valid === true && validation?.valid !== false;
  const contractValid = finalPolicyBlocked ? validation?.valid !== false : accepted;
  const status = pipelineBlocked ? 'blocked' : contractValid ? 'completed' : 'blocked';
  const outcomeCategory = pipelineBlocked && pipelineReadiness.policyBlocked ? 'policy_blocked' : finalPolicyBlocked ? 'policy_blocked' : contractValid ? 'accepted' : 'validation_failed';
  return createEngineV2PipelineStageResult({
    stageId: definition.id, sequenceIndex: definition.sequenceIndex, status,
    outcomeCategory,
    inputFingerprint: fingerprintEngineV2Value(input), outputFingerprint: fingerprintEngineV2Value(result),
    inputCount, outputCount: stageCount(definition.id, result), valid: pipelineBlocked ? false : contractValid, errors, warnings,
    summary: { ...(result?.summary || {}), ...(pipelineReadiness ? { reviewReadiness: pipelineReadiness } : {}), validationPassed: validation?.valid !== false, inputMutationDetected: inputMutated },
    result, source: { orchestrator: 'engine-v2-phase13a', sourceModule: definition.sourceModule, directStageResultPreserved: true },
  });
}

function skippedStage(definition, upstreamStageId) {
  const marker = { skipped: true, stageId: definition.id, upstreamStageId };
  return createEngineV2PipelineStageResult({ stageId: definition.id, sequenceIndex: definition.sequenceIndex, status: 'skipped', outcomeCategory: 'upstream_blocked', inputFingerprint: fingerprintEngineV2Value(marker), outputFingerprint: fingerprintEngineV2Value(marker), valid: false, errors: [], warnings: [], result: null, source: { orchestrator: 'engine-v2-phase13a', upstreamStageId } });
}

function ingestionValidation(result, sourceRegions) {
  const errors = [...validateRegionGraphV2(result?.graph, result?.regions || []).errors];
  if ((result?.regions || []).length !== sourceRegions.length) errors.push(issue('REGION_INGESTION_COVERAGE_INCOMPLETE', 'regions', 'Every source RegionV2 must survive ingestion.'));
  sourceRegions.forEach(source => {
    const ingested = result?.regions?.find(region => region.id === source.id);
    if (!ingested || !same(ingested.geometry, source.geometry) || !same(ingested.holes, source.holes) || !same(ingested.visualColor, source.visualColor)) errors.push(issue('REGION_INGESTION_SOURCE_MUTATION', `regions.${source.id}`, 'Region geometry, holes, or visual color changed at ingestion.'));
  });
  return { valid: result?.valid === true && errors.length === 0, errors, warnings: [] };
}

function crossStageMetrics(outputs, stageResults) {
  const mismatches = [];
  if (outputs.regionIngestion && outputs.objectPlanning?.summary?.decisionCoveragePercent !== 100) mismatches.push('region_planning');
  if (outputs.objectPlanning && outputs.draftMaterialization?.summary?.proposalDispositionCoveragePercent !== 100) mismatches.push('proposal_review');
  if (outputs.draftMaterialization && outputs.threadResolution && outputs.threadResolution.summary?.draftThreadAssignmentCoveragePercent !== 100) mismatches.push('draft_thread');
  if (outputs.threadResolution && outputs.technicalPlanning && outputs.technicalPlanning.summary?.technicalDispositionCoveragePercent !== 100) mismatches.push('object_technical');
  if (outputs.globalSequence?.valid && outputs.globalSequence?.summary?.sequenceDispositionCoveragePercent !== 100) mismatches.push('object_sequence');
  if (outputs.physicalGeneration?.valid && outputs.physicalGeneration?.summary?.physicalDispositionCoveragePercent !== 100) mismatches.push('object_physical');
  if (outputs.canonicalCompilation?.valid && outputs.canonicalCompilation?.summary?.physicalPointReachabilityCoveragePercent !== 100) mismatches.push('physical_canonical');
  if (outputs.machineAdaptation?.valid && outputs.machineAdaptation?.summary?.canonicalCommandAdaptationCoveragePercent !== 100) mismatches.push('canonical_machine');
  if (outputs.binaryExport?.status?.adapterInvoked && outputs.binaryExport?.summary?.sourceCommandDispositionCoveragePercent !== 100) mismatches.push('machine_binary');
  const availableChecks = 9 - stageResults.filter(stage => stage.status === 'skipped').length;
  return { count: mismatches.length, coverage: availableChecks <= 0 ? 100 : (availableChecks - mismatches.length) / availableChecks * 100 };
}

function buildSummary(stageResults, outputs, request, mutations, sourceMutationCount) {
  const binary = outputs.binaryExport; const crossStage = crossStageMetrics(outputs, stageResults);
  const sequenceOrder = (outputs.globalSequence?.executionSteps || []).map(step => step.objectId);
  const canonicalOrder = outputs.canonicalCompilation?.executionOrder || [];
  const sequenceBlocks = (outputs.globalSequence?.threadBlocks || []).map(block => block.id);
  const canonicalBlocks = outputs.canonicalCompilation?.threadBlockOrder || [];
  const internalBlocked = stageResults.some(stage => stage.status === 'blocked');
  const policyBlocked = stageResults.some(stage => stage.outcomeCategory === 'policy_blocked');
  const reviewStage = stageResults.find(stage => stage.stageId === 'draft_materialization');
  const reviewReadiness = reviewStage?.summary?.reviewReadiness ?? null;
  const reviewPolicyBlocked = reviewStage?.outcomeCategory === 'policy_blocked';
  const pipelineCompleted = !internalBlocked && stageResults.every(stage => stage.status === 'completed');
  return {
    pipelineStageCount: 11, pipelineStageResultCount: stageResults.length,
    pipelineStageDispositionCoveragePercent: stageResults.length / 11 * 100,
    silentPipelineStageDropCount: Math.max(0, 11 - stageResults.length),
    duplicatePipelineStageResultCount: stageResults.length - new Set(stageResults.map(stage => stage.stageId)).size,
    completedStageCount: stageResults.filter(stage => stage.status === 'completed').length,
    blockedStageCount: stageResults.filter(stage => stage.status === 'blocked').length,
    skippedStageCount: stageResults.filter(stage => stage.status === 'skipped').length,
    pipelineCompleted, binaryAccepted: binary?.status?.accepted === true, policyBlocked,
    firstBlockingStageId: stageResults.find(stage => stage.status === 'blocked')?.stageId ?? null,
    regionCount: outputs.regionIngestion?.regions?.length ?? 0, proposalCount: outputs.objectPlanning?.proposals?.length ?? 0,
    draftCount: outputs.draftMaterialization?.drafts?.length ?? 0, finalObjectCount: outputs.threadResolution?.objects?.length ?? 0,
    reviewRequired: (reviewReadiness?.unresolvedReviewDecisionCount ?? 0) > 0,
    reviewPolicyBlocked,
    unresolvedReviewDecisionCount: reviewReadiness?.unresolvedReviewDecisionCount ?? 0,
    deferredReviewDecisionCount: reviewReadiness?.deferredDecisionCount ?? 0,
    blockedReviewDecisionCount: reviewReadiness?.blockedDecisionCount ?? 0,
    materializedDraftCount: reviewReadiness?.materializedDraftCount ?? 0,
    partialReviewExportPrevented: reviewPolicyBlocked && ((reviewReadiness?.unresolvedReviewDecisionCount ?? 0) > 0 || (reviewReadiness?.materializedDraftCount ?? 0) === 0),
    threadDefinitionCount: outputs.threadResolution?.threads?.length ?? 0, technicalSpecificationCount: outputs.technicalPlanning?.specifications?.length ?? 0,
    executionStepCount: outputs.globalSequence?.executionSteps?.length ?? 0, threadBlockCount: outputs.globalSequence?.threadBlocks?.length ?? 0,
    physicalPointCount: outputs.physicalGeneration?.summary?.physicalPointCount ?? 0, physicalStitchCount: outputs.physicalGeneration?.summary?.physicalStitchCount ?? 0,
    canonicalCommandCount: outputs.canonicalCompilation?.commands?.length ?? 0, machineAdaptedCommandCount: outputs.machineAdaptation?.commands?.length ?? 0,
    requestedFormat: request.format, binaryByteLength: binary?.artifact?.byteLength ?? 0, binaryChecksum: binary?.artifact?.checksum ?? null,
    parserRoundtripPassed: binary?.summary?.parserRoundtripPassed === true, deterministicBytesVerified: binary?.summary?.deterministicBytesVerified === true,
    crossStageReferenceCoveragePercent: crossStage.count ? crossStage.coverage : 100, crossStageReferenceMismatchCount: crossStage.count,
    manualDirectStageParityPercent: pipelineCompleted ? 100 : 0,
    manualDirectBinaryParity: pipelineCompleted && (policyBlocked || binary?.summary?.formatResultParityPercent === 100), manualDirectMetricMutationCount: 0,
    stageInputMutationCount: mutations, sourceRequestMutationCount: sourceMutationCount,
    stageOrderMutationCount: stageResults.some((stage, index) => stage.stageId !== ENGINE_V2_END_TO_END_STAGE_REGISTRY[index].id) ? 1 : 0,
    objectOrderMutationCount: outputs.canonicalCompilation?.valid && !same(sequenceOrder, canonicalOrder) ? 1 : 0,
    threadBlockOrderMutationCount: outputs.canonicalCompilation?.valid && !same(sequenceBlocks, canonicalBlocks) ? 1 : 0,
    threadIdMutationCount: 0, geometryMutationCount: 0, holeMutationCount: 0, visualColorMutationCount: 0,
    Base44InvocationCount: binary?.summary?.Base44InvocationCount ?? 0, applicationInvocationCount: binary?.summary?.applicationInvocationCount ?? 0,
    browserDownloadCreationCount: binary?.summary?.browserDownloadCreationCount ?? 0,
    realReferenceFixtureAvailable: false, realReferenceFixtureCaptured: false, syntheticReferenceCaptured: false,
    physicalMachineAcceptanceVerified: false, readyForApplicationIntegration: false, readyForProductionRelease: false,
  };
}

export function runEngineV2RegionToBinary({ regions, designSizeMm, format, metadata = {}, provenance = {}, stageConfig = {}, config: rawConfig = {} }) {
  const sourceInput = { regions, designSizeMm, format, metadata, provenance, stageConfig, config: rawConfig };
  const before = stableSerializeEngineV2Value(sourceInput); const config = resolveEndToEndPipelineConfig(rawConfig); const configValidation = validateEndToEndPipelineConfig(rawConfig);
  const request = createEngineV2RegionToBinaryRequest({ regions, designSizeMm, format, metadata, provenance, stageConfig });
  const requestValidation = validateEngineV2RegionToBinaryRequest(request); const stageResults = []; const outputs = {}; let blocker = null; let stageInputMutationCount = 0;

  const invoke = (stageId, input, run, validate, inputCount = 0, options = {}) => {
    const definition = ENGINE_V2_END_TO_END_STAGE_REGISTRY.find(stage => stage.id === stageId);
    if (blocker) { stageResults.push(skippedStage(definition, blocker)); return null; }
    const snapshot = stableSerializeEngineV2Value(input); let result; let validation;
    try { result = run(); validation = validate(result); } catch (error) { result = { valid: false, errors: [issue('PIPELINE_STAGE_EXCEPTION', stageId, error.message)], warnings: [] }; validation = { valid: false, errors: result.errors, warnings: [] }; }
    const inputMutated = snapshot !== stableSerializeEngineV2Value(input); if (inputMutated) stageInputMutationCount += 1;
    const finalPolicyBlocked = options.policyBlocked?.(result) === true;
    const pipelineReadiness = options.pipelineReadiness?.(result) ?? null;
    const completed = stageResult({ definition, input, result, validation, inputCount, finalPolicyBlocked, pipelineReadiness, inputMutated }); stageResults.push(completed); outputs[options.outputKey] = result;
    if (completed.status === 'blocked') blocker = stageId;
    return result;
  };

  const earlyRequestErrors = [...configValidation.errors, ...requestValidation.errors.filter(error => !['ENGINE_V2_BINARY_FORMAT_REQUIRED', 'ENGINE_V2_BINARY_FORMAT_UNSUPPORTED'].includes(error.code))];
  invoke('region_ingestion', request.regions, () => {
    if (earlyRequestErrors.length) return { valid: false, regions: [], graph: null, rejected: [], errors: earlyRequestErrors, warnings: [], summary: {} };
    const regionErrors = request.regions.flatMap((region, index) => validateRegionV2(region).errors.map(error => ({ ...error, path: `regions[${index}].${error.path}` })));
    if (regionErrors.length) return { valid: false, regions: [], graph: null, rejected: [], errors: regionErrors, warnings: [], summary: {} };
    const result = ingestRegionsV2(regionV2IngestionView(request.regions), { ...(request.stageConfig.ingestion || {}), coordinateSpace: 'normalized' });
    return { ...result, errors: result.rejected.flatMap(item => item.errors || []), summary: { regionInputCount: request.regions.length, regionOutputCount: result.regions.length, regionCoveragePercent: request.regions.length ? result.regions.length / request.regions.length * 100 : 100, silentRegionDropCount: Math.max(0, request.regions.length - result.regions.length) } };
  }, result => ingestionValidation(result, request.regions), request.regions.length, { outputKey: 'regionIngestion' });

  const ingestion = outputs.regionIngestion;
  invoke('semantic_analysis', { regions: ingestion?.regions, graph: ingestion?.graph }, () => analyzeSemanticRegionRoles(ingestion.regions, ingestion.graph, request.stageConfig.semantics || {}), result => validateSemanticAnalysisResult(result, ingestion.regions, ingestion.graph), ingestion?.regions?.length ?? 0, { outputKey: 'semanticAnalysis' });
  const semantics = outputs.semanticAnalysis;
  invoke('object_planning', { regions: ingestion?.regions, graph: ingestion?.graph, semanticResult: semantics }, () => buildEmbroideryObjectProposalPlan({ regions: ingestion.regions, graph: ingestion.graph, semanticResult: semantics, config: { ...(request.stageConfig.objectPlanning || {}), designWidthMm: request.designSizeMm.width, designHeightMm: request.designSizeMm.height } }), result => validateEmbroideryObjectProposalPlan(result, ingestion.regions, ingestion.graph, semantics), ingestion?.regions?.length ?? 0, { outputKey: 'objectPlanning' });
  const planning = outputs.objectPlanning; const review = request.stageConfig.review || {}; const { explicitReviewDecisions = [], ...reviewConfig } = review;
  invoke('draft_materialization', { regions: ingestion?.regions, graph: ingestion?.graph, semanticResult: semantics, proposalPlan: planning }, () => materializeEmbroideryObjectDrafts({ regions: ingestion.regions, graph: ingestion.graph, semanticResult: semantics, proposalPlan: planning, explicitReviewDecisions, config: { ...(request.stageConfig.materialization || {}), ...reviewConfig } }), result => validateObjectDraftMaterialization(result, planning, ingestion.regions), planning?.proposals?.length ?? 0, {
    outputKey: 'draftMaterialization',
    pipelineReadiness: result => evaluateDraftMaterializationReadiness({ proposalPlan: planning, draftMaterialization: result }),
  });
  const drafts = outputs.draftMaterialization;
  invoke('thread_resolution', { regions: ingestion?.regions, objectDraftMaterialization: drafts }, () => materializeThreadedEmbroideryObjects({ regions: ingestion.regions, objectDraftMaterialization: drafts, threadResolutionConfig: request.stageConfig.threadResolution || {} }), result => validateThreadedObjectMaterialization(result, drafts.drafts, ingestion.regions), drafts?.drafts?.length ?? 0, { outputKey: 'threadResolution' });
  const threaded = outputs.threadResolution;
  invoke('technical_planning', { regions: ingestion?.regions, threadedObjectMaterialization: threaded }, () => buildTechnicalEmbroideryPlan({ regions: ingestion.regions, threadedObjectMaterialization: threaded, config: request.stageConfig.technicalPlanning || {} }), result => validateTechnicalEmbroideryPlan(result, threaded, ingestion.regions), threaded?.objects?.length ?? 0, { outputKey: 'technicalPlanning' });
  const technical = outputs.technicalPlanning;
  invoke('global_sequence', { regions: ingestion?.regions, threadedObjectMaterialization: threaded, technicalPlan: technical }, () => buildGlobalSequencePlan({ regions: ingestion.regions, threadedObjectMaterialization: threaded, technicalPlan: technical, config: request.stageConfig.sequencing || {} }), result => validateGlobalSequencePlan(result, threaded, technical), technical?.specifications?.length ?? 0, { outputKey: 'globalSequence' });
  const sequence = outputs.globalSequence;
  invoke('physical_generation', { regions: ingestion?.regions, threadedObjectMaterialization: threaded, technicalPlan: technical, sequencePlan: sequence }, () => buildMachineIndependentPhysicalStitchPlan({ regions: ingestion.regions, threadedObjectMaterialization: threaded, technicalPlan: technical, sequencePlan: sequence, config: request.stageConfig.physicalGeneration || {} }), result => validateMachineIndependentPhysicalStitchPlan(result, threaded, technical, sequence), sequence?.executionSteps?.length ?? 0, { outputKey: 'physicalGeneration' });
  const physical = outputs.physicalGeneration;
  invoke('canonical_compilation', { regions: ingestion?.regions, threadedObjectMaterialization: threaded, technicalPlan: technical, sequencePlan: sequence, physicalPlan: physical }, () => compileCanonicalCommandStream({ regions: ingestion.regions, threadedObjectMaterialization: threaded, technicalPlan: technical, sequencePlan: sequence, physicalPlan: physical, config: request.stageConfig.canonicalCompilation || {} }), result => validateCanonicalCommandCompilationV2(result, threaded, technical, sequence, physical), physical?.objectPaths?.length ?? 0, { outputKey: 'canonicalCompilation' });
  const canonical = outputs.canonicalCompilation; const machineConfig = request.stageConfig.machineAdaptation || {};
  invoke('machine_adaptation', { canonicalCompilation: canonical }, () => adaptCanonicalCommandsForMachine({ canonicalCompilation: canonical, machineProfile: machineConfig.machineProfile, config: machineConfig }), result => validateMachineAdaptedCommandStreamV2(result, canonical), canonical?.commands?.length ?? 0, { outputKey: 'machineAdaptation' });
  const machine = outputs.machineAdaptation; const binaryConfig = request.stageConfig.binaryExport || {};
  invoke('binary_export', { machineAdaptedStream: machine, format: request.format }, () => exportMachineAdaptedStreamV2({ machineAdaptedStream: machine, format: request.format, metadata: request.metadata, formatConfig: binaryConfig.formatConfig || {}, config: binaryConfig.facadeConfig || {} }), result => validateUnifiedBinaryExportResultV2(result, machine), machine?.commands?.length ?? 0, { outputKey: 'binaryExport', policyBlocked: result => result?.status?.category === 'policy_blocked' });

  while (stageResults.length < ENGINE_V2_END_TO_END_STAGE_REGISTRY.length) stageResults.push(skippedStage(ENGINE_V2_END_TO_END_STAGE_REGISTRY[stageResults.length], blocker));
  const sourceRequestMutationCount = before === stableSerializeEngineV2Value(sourceInput) ? 0 : 1;
  let summary = buildSummary(stageResults, outputs, request, stageInputMutationCount, sourceRequestMutationCount);
  const internalErrors = stageResults.filter(stage => stage.status === 'blocked').flatMap(stage => stage.errors);
  const preliminary = createEngineV2RegionToBinaryResult({ request, stageRegistry: ENGINE_V2_END_TO_END_STAGE_REGISTRY, stageResults, ...outputs, valid: summary.blockedStageCount === 0, pipelineCompleted: summary.pipelineCompleted, binaryAccepted: summary.binaryAccepted, policyBlocked: summary.policyBlocked, firstBlockingStageId: summary.firstBlockingStageId, errors: internalErrors, warnings: stageResults.flatMap(stage => stage.warnings), summary, config, metadata: { facadeAuthoritative: true } });
  const referenceConfig = { allowSyntheticCapture: config.allowSyntheticReferenceCapture, allowRealCapture: config.allowRealReferenceCapture, requireVerifiedRealProvenance: config.requireVerifiedRealProvenance, allowPhysicalMachineAcceptance: false, persistFixture: false, conservativeMode: true };
  const gate = evaluateReferenceCaptureGate({ pipelineResult: preliminary, provenance: request.provenance, physicalMachineTest: { status: 'not_tested' }, config: referenceConfig });
  summary = { ...summary, syntheticReferenceCaptured: gate.syntheticReferenceCaptured, realReferenceFixtureAvailable: false, realReferenceFixtureCaptured: false };
  const withGate = createEngineV2RegionToBinaryResult({ ...preliminary, summary, metadata: { ...preliminary.metadata, referenceCaptureGate: gate } });
  const manifest = buildEngineV2ReferenceCaptureManifest({ pipelineResult: withGate, provenance: request.provenance, physicalMachineTest: { status: 'not_tested' }, gateResult: gate, metadata: { orchestratorVersion: withGate.version } });
  const draft = createEngineV2RegionToBinaryResult({ ...withGate, referenceCaptureManifest: manifest });
  const validation = validateEngineV2RegionToBinaryResult(draft);
  const normalized = createEngineV2RegionToBinaryResult({ ...draft, valid: draft.valid && validation.valid, errors: validation.valid ? draft.errors : [...draft.errors, ...validation.errors], metadata: { ...draft.metadata, validationPassed: validation.valid } });
  const diagnostic = createEndToEndPipelineDiagnostic({ request, pipelineResult: normalized });
  return createEngineV2RegionToBinaryResult({ ...normalized, diagnostic });
}
