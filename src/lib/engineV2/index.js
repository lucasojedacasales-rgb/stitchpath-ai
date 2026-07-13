export {
  ALLOWED_COMMAND_TYPES,
  ALLOWED_EMBROIDERY_ROLES,
  ALLOWED_STITCH_TYPES,
  createCanonicalCommandV2,
  createEmbroideryObjectV2,
  createEngineDocumentV2,
  createRegionV2,
  createThreadBlockV2,
  createThreadDefinitionV2,
} from './model.js';

export {
  isEngineV2Enabled,
  resolveEngineV2Config,
} from './engineV2Config.js';

export {
  validateCanonicalCommandV2,
  validateEmbroideryObjectV2,
  validateEngineDocumentV2,
  validateRegionV2,
  validateThreadBlockV2,
  validateThreadDefinitionV2,
} from './modelValidation.js';

export { createEngineV2FoundationDiagnostic } from './diagnostics.js';

export {
  DEFAULT_GEOMETRY_TOLERANCES,
  canonicalizeHoles,
  canonicalizePolygon,
  isPointInPolygon,
  polygonArea,
  polygonBounds,
  polygonCentroid,
  polygonContainsPolygon,
  polygonSignedArea,
  polygonsOverlap,
  polygonsTouch,
} from './ingestion/geometryCanonicalization.js';

export { adaptV1RegionToRegionV2, adaptV1RegionsToRegionV2 } from './ingestion/v1RegionAdapter.js';
export { ingestRegionsV2, ingestV1RegionsToRegionGraphV2 } from './ingestion/regionIngestion.js';
export { createRegionIngestionDiagnostic } from './ingestion/ingestionDiagnostics.js';

export {
  buildRegionGraphV2,
  getConnectedComponent,
  getRegionAncestors,
  getRegionDescendants,
} from './topology/regionGraph.js';

export { validateRegionGraphV2 } from './topology/regionGraphValidation.js';
export {
  REGION_RELATIONS,
  analyzeAllRegionRelations,
  analyzeRegionRelation,
  analyzeRegionRelationDetailed,
  isPointInRegionArea,
  polygonsHaveEqualGeometry,
  regionAreaWithHoles,
  regionContainsRegionArea,
  regionInsideExplicitHole,
  regionsOverlapArea,
  regionsTouchArea,
} from './topology/regionRelations.js';

export {
  ARTWORK_SEMANTIC_ROLES,
  DEFAULT_SEMANTIC_ANALYSIS_OPTIONS,
  createSemanticRegionAssessmentV2,
  resolveSemanticAnalysisOptions,
} from './semantics/semanticRoleModel.js';

export {
  DEFAULT_ARTWORK_COLOR_THRESHOLDS,
  analyzeArtworkColor,
} from './semantics/colorFeatureAnalysis.js';

export { analyzeRegionGeometryFeatures } from './semantics/geometryFeatureAnalysis.js';
export { analyzeSourceSemanticEvidence } from './semantics/sourceSemanticEvidence.js';
export { analyzeSemanticRegionRoles } from './semantics/semanticRoleAnalyzer.js';

export {
  validateSemanticAnalysisResult,
  validateSemanticAnalyzerOptions,
  validateSemanticRegionAssessmentV2,
} from './semantics/semanticAnalysisValidation.js';

export { createSemanticAnalysisDiagnostic } from './semantics/semanticDiagnostics.js';

export {
  CONTROLLED_SOURCE_SEMANTIC_VOCABULARY,
  SOURCE_SEMANTIC_CONCEPTS,
  isOutlineIntentConcept,
  matchControlledSemanticTerms,
  normalizeControlledSemanticText,
} from './semantics/sourceSemanticVocabulary.js';

export {
  EMBROIDERY_PROPOSAL_ROLES,
  EMBROIDERY_PROPOSAL_STITCH_TYPES,
  createEmbroideryObjectProposalV2,
  proposalIdFor,
} from './planning/embroideryPlanningModel.js';

export {
  DEFAULT_OBJECT_PLANNING_CONFIG,
  resolveObjectPlanningConfig,
  validateObjectPlanningConfig,
} from './planning/planningConfig.js';

export {
  normalizedHolesToMillimeters,
  normalizedPolygonToMillimeters,
  regionGeometryToMillimeters,
} from './planning/normalizedToMillimeterGeometry.js';

export { evaluateOutlineEligibility } from './planning/outlineEligibility.js';
export { planEmbroideryRoleForRegion } from './planning/embroideryRolePlanner.js';
export {
  buildEmbroideryProposalDependencies,
  getProposalAncestors,
  getProposalDescendants,
  getProposalExecutionLayers,
} from './planning/dependencyPlanner.js';
export { buildEmbroideryObjectProposalPlan } from './planning/objectPlanningPipeline.js';
export {
  validateEmbroideryObjectProposalPlan,
  validateEmbroideryObjectProposalV2,
} from './planning/objectPlanningValidation.js';
export { createObjectPlanningDiagnostic } from './planning/objectPlanningDiagnostics.js';

export {
  PROPOSAL_REVIEW_ACTIONS,
  createProposalReviewDecisionV2,
  reviewDecisionIdFor,
} from './materialization/reviewDecisionModel.js';
export {
  DEFAULT_PROPOSAL_REVIEW_POLICY_CONFIG,
  resolveProposalReviewPolicyConfig,
  validateProposalReviewPolicyConfig,
} from './materialization/reviewPolicyConfig.js';
export { resolveProposalReviewDecisions } from './materialization/proposalReviewResolver.js';
export {
  EMBROIDERY_DRAFT_ROLES,
  EMBROIDERY_DRAFT_STITCH_TYPES,
  buildDraftPlanningParameters,
  createEmbroideryObjectDraftV2,
  draftIdFor,
} from './materialization/embroideryObjectDraftModel.js';
export {
  getDraftAncestors,
  getDraftDescendants,
  getDraftExecutionLayers,
  translateProposalDependenciesToDrafts,
} from './materialization/draftDependencyTranslator.js';
export { materializeEmbroideryObjectDrafts } from './materialization/objectDraftMaterializer.js';
export {
  validateEmbroideryObjectDraftV2,
  validateObjectDraftMaterialization,
  validateProposalReviewDecisionV2,
} from './materialization/objectDraftValidation.js';
export { createObjectDraftMaterializationDiagnostic } from './materialization/objectDraftDiagnostics.js';

export {
  deltaE76,
  deltaE2000,
  determineColorFamily,
  hexToLab,
  linearRgbToXyz,
  parseHexColor,
  rgbToLab,
  rgbToLinearRgb,
  xyzToLab,
} from './threads/colorScience.js';
export { createExactArtworkPaletteEntry, createThreadPaletteEntryV2 } from './threads/threadPaletteModel.js';
export {
  COLOR_DIFFERENCE_FORMULAS,
  DEFAULT_THREAD_RESOLUTION_CONFIG,
  THREAD_RESOLUTION_POLICIES,
  resolveThreadResolutionConfig,
  validateThreadResolutionConfig,
} from './threads/threadResolutionConfig.js';
export { validateThreadCatalog } from './threads/threadCatalogValidation.js';
export {
  DRAFT_THREAD_ASSIGNMENT_STATUSES,
  createDraftThreadAssignmentV2,
  threadAssignmentIdForDraft,
  validateDraftThreadAssignmentV2,
} from './threads/threadAssignmentModel.js';
export { resolveDraftThreadAssignments } from './threads/threadPaletteResolver.js';
export {
  finalObjectIdForDraft,
  materializeThreadedEmbroideryObjects,
  translateDraftDependenciesToFinalObjects,
} from './threads/finalObjectMaterializer.js';
export { validateThreadResolutionResult, validateThreadedObjectMaterialization } from './threads/threadResolutionValidation.js';
export { createThreadResolutionDiagnostic } from './threads/threadResolutionDiagnostics.js';

export {
  BUILT_IN_MATERIAL_PROFILES,
  MATERIAL_PROFILE_CATEGORIES,
  MATERIAL_STABILITIES,
  MATERIAL_STRETCHES,
  MATERIAL_SURFACES,
  MATERIAL_THICKNESSES,
  TECHNICAL_PLANNING_NUMERIC_DEFAULTS,
  createMaterialProfileV2,
  resolveMaterialProfileV2,
  validateMaterialProfileV2,
} from './technical/materialProfileModel.js';
export {
  DEFAULT_TECHNICAL_PLANNING_CONFIG,
  TECHNICAL_PLANNING_PROFILES,
  resolveTechnicalPlanningConfig,
  validateTechnicalPlanningConfig,
} from './technical/technicalPlanningConfig.js';
export {
  ENTRY_EXIT_KINDS,
  ENTRY_EXIT_SOURCE_TYPES,
  FILL_ANGLE_STRATEGIES,
  GENERATOR_TYPES,
  PULL_COMPENSATION_STRATEGIES,
  TECHNICAL_SPECIFICATION_STATUSES,
  UNDERLAY_COMPONENT_TYPES,
  createEntryExitCandidateV2,
  createGeneratorReadinessV2,
  createObjectTechnicalSpecificationV2,
  createPullCompensationPlanV2,
  createUnderlayPlanV2,
  technicalSpecificationIdForObject,
} from './technical/technicalPlanningModel.js';
export { analyzeEmbroideryObjectGeometry } from './technical/objectGeometryMetrics.js';
export { normalizeFillAngle, planFillAngle } from './technical/fillAnglePlanner.js';
export { planObjectUnderlay } from './technical/underlayPlanner.js';
export { planPullCompensation } from './technical/pullCompensationPlanner.js';
export { planEntryExitCandidates } from './technical/entryExitCandidatePlanner.js';
export { evaluateGeneratorReadiness, evaluateStitchTypeCompatibility, planStitchParameters } from './technical/stitchParameterPlanner.js';
export { buildTechnicalEmbroideryPlan } from './technical/technicalPlanningPipeline.js';
export { validateObjectTechnicalSpecificationV2, validateTechnicalEmbroideryPlan } from './technical/technicalPlanningValidation.js';
export { createTechnicalPlanningDiagnostic } from './technical/technicalPlanningDiagnostics.js';

export {
  REPEATED_THREAD_REASONS,
  SEQUENCE_DISPOSITION_STATUSES,
  createGlobalSequencePlanV2,
  createObjectExecutionStepV2,
  createObjectSequenceDispositionV2,
  createSelectedEntryExitPairV2,
  createSequenceSearchMetadataV2,
  createSequenceTransitionV2,
  executionStepId,
  selectedEntryExitIdForObject,
  sequenceDispositionIdForObject,
  transitionId,
} from './sequencing/sequencePlanningModel.js';
export {
  DEFAULT_SEQUENCE_PLANNING_CONFIG,
  SEQUENCE_PLANNING_ALGORITHMS,
  resolveSequenceAlgorithm,
  resolveSequencePlanningConfig,
  validateSequencePlanningConfig,
} from './sequencing/sequencePlanningConfig.js';
export {
  SEQUENCE_TRAVEL_COMPARISON_TOLERANCE,
  compareSequenceCosts,
  createSequenceCost,
  formatSequenceStableSignature,
} from './sequencing/sequenceCostModel.js';
export {
  enumerateValidEntryExitPairs,
  selectEntryExitPairForTransition,
  sequencePointDistance,
} from './sequencing/candidatePairSelector.js';
export { scheduleDependencyAwareObjects } from './sequencing/dependencyAwareScheduler.js';
export { buildThreadBlocksFromExecution, sanitizeThreadIdForBlock } from './sequencing/threadBlockBuilder.js';
export { buildGlobalSequencePlan } from './sequencing/globalSequencePlanner.js';
export {
  validateGlobalSequencePlan,
  validateObjectExecutionStepV2,
  validateObjectSequenceDispositionV2,
  validateSelectedEntryExitPairV2,
  validateSequenceTransitionV2,
} from './sequencing/sequencePlanningValidation.js';
export { createGlobalSequenceDiagnostic } from './sequencing/sequencePlanningDiagnostics.js';

export {
  PHYSICAL_DISPOSITION_STATUSES,
  PHYSICAL_GENERATORS,
  PHYSICAL_STITCH_PHASES,
  PHYSICAL_STITCH_SOURCE_TYPES,
  PHYSICAL_STITCH_TECHNIQUES,
  createMachineIndependentPhysicalStitchPlanV2,
  createObjectPhysicalStitchDispositionV2,
  createObjectPhysicalStitchPathV2,
  createPhysicalStitchPointV2,
  createPhysicalStitchSubpathV2,
  createPhysicalSubpathTransitionV2,
  physicalDispositionId,
  physicalGapId,
  physicalPathId,
  physicalPointId,
  physicalSubpathId,
} from './stitchGeneration/physicalStitchModel.js';
export {
  DEFAULT_PHYSICAL_GENERATION_CONFIG,
  PHYSICAL_GENERATION_PROFILES,
  resolvePhysicalGenerationConfig,
  validatePhysicalGenerationConfig,
} from './stitchGeneration/physicalGenerationConfig.js';
export {
  calculatePathBounds,
  calculateSubpathMetrics,
  distanceBetweenPoints,
  insertPointIntoPolyline,
  inverseRotatePoint,
  pointOnPolygonBoundary,
  pointsEqualWithinTolerance,
  polylineLength,
  projectPointToSegment,
  removeConsecutiveDuplicatePoints,
  resampleClosedPolyline,
  resampleOpenPolyline,
  rotatePoint,
  segmentCrossesHole,
  segmentInsideEffectiveRegion,
} from './stitchGeneration/stitchGeometry.js';
export { distributeStitchIntervals, summarizeStitchLengths } from './stitchGeneration/stitchLengthDistribution.js';
export { clipScanlineToRegion, generateParallelScanlineOrigins } from './stitchGeneration/polygonScanlineClipper.js';
export { generateRunningPhysicalPath } from './stitchGeneration/runningStitchGenerator.js';
export { generateTatamiPhysicalPath } from './stitchGeneration/tatamiStitchGenerator.js';
export { generateSatinPhysicalPath } from './stitchGeneration/satinStitchGenerator.js';
export { generatePhysicalUnderlay } from './stitchGeneration/physicalUnderlayGenerator.js';
export { assembleObjectPhysicalStitchPath } from './stitchGeneration/objectPathAssembler.js';
export { buildMachineIndependentPhysicalStitchPlan } from './stitchGeneration/physicalStitchPipeline.js';
export {
  validateMachineIndependentPhysicalStitchPlan,
  validateObjectPhysicalStitchPathV2,
  validatePhysicalStitchPointV2,
  validatePhysicalStitchSubpathV2,
  validatePhysicalSubpathTransitionV2,
} from './stitchGeneration/physicalStitchValidation.js';
export { createPhysicalStitchDiagnostic } from './stitchGeneration/physicalStitchDiagnostics.js';

export { canonicalCommandId } from './commandCompilation/canonicalCommandId.js';
export {
  CANONICAL_COMPILATION_STATUSES,
  CANONICAL_DISCONTINUITY_CLASSIFICATIONS,
  canonicalDispositionId,
  canonicalGapId,
  canonicalSpanId,
  createCanonicalCommandCompilationV2,
  createCanonicalCompilationDispositionV2,
  createCanonicalDiscontinuityClassificationV2,
  createCanonicalObjectCommandSpanV2,
} from './commandCompilation/canonicalCompilationModel.js';
export {
  DEFAULT_CANONICAL_COMPILATION_CONFIG,
  resolveCanonicalCompilationConfig,
  validateCanonicalCompilationConfig,
} from './commandCompilation/canonicalCompilationConfig.js';
export { classifyPhysicalDiscontinuity, compileDiscontinuityCommands } from './commandCompilation/discontinuityClassifier.js';
export { compileObjectPhysicalPathToCanonicalCommands, compilePhysicalSubpathToCanonicalCommands } from './commandCompilation/objectCommandCompiler.js';
export { compileThreadBlocksToCanonicalCommands } from './commandCompilation/threadBlockCommandCompiler.js';
export { compileCanonicalCommandStream } from './commandCompilation/canonicalCommandCompiler.js';
export {
  validateCanonicalCommandCompilationV2,
  validateCanonicalCompilationDispositionV2,
  validateCanonicalDiscontinuityClassificationV2,
  validateCanonicalObjectCommandSpanV2,
} from './commandCompilation/canonicalCompilationValidation.js';
export { createCanonicalCompilationDiagnostic } from './commandCompilation/canonicalCompilationDiagnostics.js';
