import { runEngineV2RegionToBinary } from '../orchestration/regionToBinaryOrchestrator.js';
import { ingestRegionsV2 } from '../ingestion/regionIngestion.js';
import { analyzeSemanticRegionRoles } from '../semantics/semanticRoleAnalyzer.js';
import { buildEmbroideryObjectProposalPlan } from '../planning/objectPlanningPipeline.js';
import { materializeEmbroideryObjectDrafts } from '../materialization/objectDraftMaterializer.js';
import { materializeThreadedEmbroideryObjects } from '../threads/finalObjectMaterializer.js';
import { buildTechnicalEmbroideryPlan } from '../technical/technicalPlanningPipeline.js';
import { buildGlobalSequencePlan } from '../sequencing/globalSequencePlanner.js';
import { buildMachineIndependentPhysicalStitchPlan } from '../stitchGeneration/physicalStitchPipeline.js';
import { compileCanonicalCommandStream } from '../commandCompilation/canonicalCommandCompiler.js';
import { adaptCanonicalCommandsForMachine } from '../machineAdaptation/machineCommandAdapter.js';
import { exportMachineAdaptedStreamV2 } from '../formatAdaptation/binaryExportFacade.js';
import { createEndToEndRegionFixture } from './endToEndRegionFixture.js';

export function createEndToEndDSTFixture(overrides = {}) {
  const request = createEndToEndRegionFixture({ ...overrides, format: overrides.format ?? 'DST' });
  return { request, result: runEngineV2RegionToBinary(request) };
}

function ingestionView(regions) {
  return [...regions].sort((left, right) => left.id.localeCompare(right.id)).map(region => ({
    id: region.id,
    path_points: region.geometry.map(point => ({ ...point })),
    holes: region.holes.map(hole => hole.map(point => ({ ...point }))),
    color: structuredClone(region.visualColor),
    semanticRole: region.semanticRole,
    confidence: region.confidence,
    darkStrokeSupport: structuredClone(region.darkStrokeSupport),
    source: structuredClone(region.source),
    visible: true,
  }));
}

export function createEndToEndManualDirectParityFixture(overrides = {}) {
  const orchestrated = createEndToEndDSTFixture(overrides);
  const request = orchestrated.result.request;
  const stageConfig = request.stageConfig;
  const ingested = ingestRegionsV2(ingestionView(request.regions), { ...(stageConfig.ingestion || {}), coordinateSpace: 'normalized' });
  const regionIngestion = {
    ...ingested,
    errors: ingested.rejected.flatMap(item => item.errors || []),
    summary: { regionInputCount: request.regions.length, regionOutputCount: ingested.regions.length, regionCoveragePercent: 100, silentRegionDropCount: 0 },
  };
  const semanticAnalysis = analyzeSemanticRegionRoles(regionIngestion.regions, regionIngestion.graph, stageConfig.semantics || {});
  const objectPlanning = buildEmbroideryObjectProposalPlan({ regions: regionIngestion.regions, graph: regionIngestion.graph, semanticResult: semanticAnalysis, config: { ...(stageConfig.objectPlanning || {}), designWidthMm: request.designSizeMm.width, designHeightMm: request.designSizeMm.height } });
  const review = stageConfig.review || {};
  const { explicitReviewDecisions = [], ...reviewConfig } = review;
  const draftMaterialization = materializeEmbroideryObjectDrafts({ regions: regionIngestion.regions, graph: regionIngestion.graph, semanticResult: semanticAnalysis, proposalPlan: objectPlanning, explicitReviewDecisions, config: { ...(stageConfig.materialization || {}), ...reviewConfig } });
  const threadResolution = materializeThreadedEmbroideryObjects({ regions: regionIngestion.regions, objectDraftMaterialization: draftMaterialization, threadResolutionConfig: stageConfig.threadResolution || {} });
  const technicalPlanning = buildTechnicalEmbroideryPlan({ regions: regionIngestion.regions, threadedObjectMaterialization: threadResolution, config: stageConfig.technicalPlanning || {} });
  const globalSequence = buildGlobalSequencePlan({ regions: regionIngestion.regions, threadedObjectMaterialization: threadResolution, technicalPlan: technicalPlanning, config: stageConfig.sequencing || {} });
  const physicalGeneration = buildMachineIndependentPhysicalStitchPlan({ regions: regionIngestion.regions, threadedObjectMaterialization: threadResolution, technicalPlan: technicalPlanning, sequencePlan: globalSequence, config: stageConfig.physicalGeneration || {} });
  const canonicalCompilation = compileCanonicalCommandStream({ regions: regionIngestion.regions, threadedObjectMaterialization: threadResolution, technicalPlan: technicalPlanning, sequencePlan: globalSequence, physicalPlan: physicalGeneration, config: stageConfig.canonicalCompilation || {} });
  const machineConfig = stageConfig.machineAdaptation || {};
  const machineAdaptation = adaptCanonicalCommandsForMachine({ canonicalCompilation, machineProfile: machineConfig.machineProfile, config: machineConfig });
  const binaryConfig = stageConfig.binaryExport || {};
  const binaryExport = exportMachineAdaptedStreamV2({ machineAdaptedStream: machineAdaptation, format: request.format, metadata: request.metadata, formatConfig: binaryConfig.formatConfig || {}, config: binaryConfig.facadeConfig || {} });
  return { orchestrated, direct: { regionIngestion, semanticAnalysis, objectPlanning, draftMaterialization, threadResolution, technicalPlanning, globalSequence, physicalGeneration, canonicalCompilation, machineAdaptation, binaryExport } };
}
