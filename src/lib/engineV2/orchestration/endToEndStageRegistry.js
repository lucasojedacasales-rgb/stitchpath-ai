import { createEngineV2PipelineStageDefinition } from './endToEndPipelineModel.js';

const definitions = [
  ['region_ingestion', 'RegionV2[]', 'RegionIngestionV2', 'ingestion/regionIngestion.js'],
  ['semantic_analysis', 'RegionIngestionV2', 'SemanticAnalysisResultV2', 'semantics/semanticRoleAnalyzer.js'],
  ['object_planning', 'SemanticAnalysisResultV2', 'EmbroideryObjectProposalPlanV2', 'planning/objectPlanningPipeline.js'],
  ['draft_materialization', 'EmbroideryObjectProposalPlanV2', 'ObjectDraftMaterializationV2', 'materialization/objectDraftMaterializer.js'],
  ['thread_resolution', 'ObjectDraftMaterializationV2', 'ThreadedObjectMaterializationV2', 'threads/finalObjectMaterializer.js'],
  ['technical_planning', 'ThreadedObjectMaterializationV2', 'TechnicalEmbroideryPlanV2', 'technical/technicalPlanningPipeline.js'],
  ['global_sequence', 'TechnicalEmbroideryPlanV2', 'GlobalSequencePlanV2', 'sequencing/globalSequencePlanner.js'],
  ['physical_generation', 'GlobalSequencePlanV2', 'PhysicalStitchPlanV2', 'stitchGeneration/physicalStitchPipeline.js'],
  ['canonical_compilation', 'PhysicalStitchPlanV2', 'CanonicalCommandCompilationV2', 'commandCompilation/canonicalCommandCompiler.js'],
  ['machine_adaptation', 'CanonicalCommandCompilationV2', 'MachineAdaptedCommandStreamV2', 'machineAdaptation/machineCommandAdapter.js'],
  ['binary_export', 'MachineAdaptedCommandStreamV2', 'UnifiedBinaryExportResultV2', 'formatAdaptation/binaryExportFacade.js'],
];

export const ENGINE_V2_END_TO_END_STAGE_REGISTRY = Object.freeze(definitions.map(([id, inputContract, outputContract, sourceModule], sequenceIndex) => createEngineV2PipelineStageDefinition({ id, sequenceIndex, inputContract, outputContract, transactional: true, sourceModule })));

export function getEngineV2EndToEndStageRegistry() { return ENGINE_V2_END_TO_END_STAGE_REGISTRY; }
export function getEngineV2EndToEndStageDefinition(stageId) { return ENGINE_V2_END_TO_END_STAGE_REGISTRY.find(stage => stage.id === stageId) ?? null; }
