import { validateSemanticAnalysisResult } from './semanticAnalysisValidation.js';
import { ARTWORK_SEMANTIC_ROLES, DEFAULT_SEMANTIC_ANALYSIS_OPTIONS } from './semanticRoleModel.js';

export function createSemanticAnalysisDiagnostic(regions, graph, semanticResult) {
  const validation = validateSemanticAnalysisResult(semanticResult, regions, graph);
  const assessments = Array.isArray(semanticResult?.assessments) ? semanticResult.assessments : [];
  const distribution = Object.fromEntries(ARTWORK_SEMANTIC_ROLES.map(role => [role, assessments.filter(item => item.semanticRole === role).length]));
  return {
    valid: validation.valid,
    regionCount: Array.isArray(regions) ? regions.length : 0,
    assessmentCount: assessments.length,
    highConfidenceCount: assessments.filter(item => item.confidence >= DEFAULT_SEMANTIC_ANALYSIS_OPTIONS.minimumHighConfidence).length,
    acceptedConfidenceCount: assessments.filter(item => item.confidence >= DEFAULT_SEMANTIC_ANALYSIS_OPTIONS.minimumAcceptedConfidence).length,
    needsReviewCount: assessments.filter(item => item.needsReview).length,
    unknownCount: distribution.unknown,
    backgroundCount: distribution.background,
    primaryShapeCount: distribution.primary_shape,
    secondaryShapeCount: distribution.secondary_shape,
    internalFeatureCount: distribution.internal_feature,
    darkMarkCount: distribution.dark_mark,
    highlightCount: distribution.highlight,
    negativeSpaceCount: distribution.negative_space,
    invalidColorCount: assessments.filter(item => item.colorFeatures?.valid === false).length,
    conflictingSourceEvidenceCount: assessments.filter(item => item.needsReview && item.sourceRoleTrusted === false && item.semanticTags?.length > 1).length,
    explicitHoleCount: (regions || []).reduce((sum, region) => sum + (region.holes?.length || 0), 0),
    inferredHoleCount: 0,
    regionsInsideExplicitHoles: graph?.metadata?.regionsInsideExplicitHoles || 0,
    holeAwareParentCorrections: graph?.metadata?.holeAwareParentCorrections || 0,
    mutationsDetected: semanticResult?.metadata?.mutationsDetected === true,
    roleDistribution: distribution,
    errors: validation.errors.map(item => ({ ...item })),
    warnings: [...(semanticResult?.warnings || []), ...validation.warnings].map(item => ({ ...item })),
  };
}
