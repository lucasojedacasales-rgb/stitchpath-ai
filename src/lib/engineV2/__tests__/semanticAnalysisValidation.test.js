import { describe, expect, it } from 'vitest';
import {
  analyzeSemanticRegionRoles,
  ingestV1RegionsToRegionGraphV2,
  validateSemanticAnalysisResult,
  validateSemanticAnalyzerOptions,
  validateSemanticRegionAssessmentV2,
} from '../index.js';
import { createSemanticRolesFixture } from '../fixtures/semanticRolesFixture.js';

function validContext() {
  const ingestion = ingestV1RegionsToRegionGraphV2(createSemanticRolesFixture(), { coordinateSpace: 'normalized' });
  const result = analyzeSemanticRegionRoles(ingestion.regions, ingestion.graph);
  return { ...ingestion, result };
}

describe('Phase 3 semantic validation', () => {
  it('validates a complete semantic result', () => {
    const context = validContext();
    expect(validateSemanticAnalysisResult(context.result, context.regions, context.graph).valid).toBe(true);
  });

  it('detects assessments for unknown regions', () => {
    const context = validContext();
    const result = structuredClone(context.result);
    result.assessments[0].regionId = 'missing';
    expect(validateSemanticAnalysisResult(result, context.regions, context.graph).errors.some(item => item.code === 'ASSESSMENT_UNKNOWN_REGION')).toBe(true);
  });

  it('detects missing and duplicate assessments', () => {
    const context = validContext();
    const missing = structuredClone(context.result);
    missing.assessments.pop();
    expect(validateSemanticAnalysisResult(missing, context.regions, context.graph).errors.some(item => item.code === 'MISSING_REGION_ASSESSMENT')).toBe(true);
    const duplicate = structuredClone(context.result);
    duplicate.assessments.push(structuredClone(duplicate.assessments[0]));
    expect(validateSemanticAnalysisResult(duplicate, context.regions, context.graph).errors.some(item => item.code === 'DUPLICATE_ASSESSMENT_REGION')).toBe(true);
  });

  it('detects malformed roles, confidence, tags, evidence, and alternatives', () => {
    const validation = validateSemanticRegionAssessmentV2({
      regionId: 'r1',
      semanticRole: 'outline',
      semanticTags: ['eye', 'eye'],
      confidence: 2,
      evidence: [{}],
      alternatives: [{ role: 'fill', score: -1 }],
    });
    const codes = validation.errors.map(item => item.code);
    expect(codes).toEqual(expect.arrayContaining([
      'INVALID_SEMANTIC_ROLE', 'INVALID_SEMANTIC_CONFIDENCE', 'DUPLICATE_SEMANTIC_TAG',
      'MALFORMED_SEMANTIC_EVIDENCE', 'INVALID_ALTERNATIVE_ROLE', 'INVALID_ALTERNATIVE_SCORE',
    ]));
  });

  it('rejects negative_space without explicit evidence', () => {
    const validation = validateSemanticRegionAssessmentV2({
      regionId: 'r1', semanticRole: 'negative_space', semanticTags: [], confidence: 0.9,
      evidence: [{ code: 'TEST', message: 'No explicit evidence.' }], alternatives: [],
    });
    expect(validation.errors.some(item => item.code === 'NEGATIVE_SPACE_WITHOUT_EXPLICIT_EVIDENCE')).toBe(true);
  });

  it('requires a record when source role changes', () => {
    const validation = validateSemanticRegionAssessmentV2({
      regionId: 'r1', semanticRole: 'primary_shape', semanticTags: [], confidence: 0.9,
      sourceRole: 'body', evidence: [{ code: 'TEST', message: 'Missing source record.' }], alternatives: [],
    });
    expect(validation.errors.some(item => item.code === 'SOURCE_ROLE_OVERWRITTEN_WITHOUT_RECORD')).toBe(true);
  });

  it('validates semantic thresholds and weights', () => {
    expect(validateSemanticAnalyzerOptions({ minimumAcceptedConfidence: 0.9, minimumHighConfidence: 0.8 }).valid).toBe(false);
    expect(validateSemanticAnalyzerOptions({ sourceEvidenceWeight: 0, topologyWeight: 0, geometryWeight: 0, colorWeight: 0 }).valid).toBe(false);
    expect(validateSemanticAnalyzerOptions({ sourceEvidenceWeight: 3, topologyWeight: 2, geometryWeight: 1, colorWeight: 1 }).valid).toBe(true);
  });

  it('detects input mutation and graph mismatch metadata', () => {
    const context = validContext();
    const mutated = structuredClone(context.result);
    mutated.metadata.mutationsDetected = true;
    expect(validateSemanticAnalysisResult(mutated, context.regions, context.graph).errors.some(item => item.code === 'INPUT_REGION_MUTATION')).toBe(true);
    const graph = structuredClone(context.graph);
    delete graph.nodes.body;
    expect(validateSemanticAnalysisResult(context.result, context.regions, graph).errors.some(item => item.code === 'GRAPH_ASSESSMENT_MISMATCH')).toBe(true);
  });
});
