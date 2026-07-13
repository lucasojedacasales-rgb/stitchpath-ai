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
