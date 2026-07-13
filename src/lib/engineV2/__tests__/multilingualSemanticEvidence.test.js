import { describe, expect, it } from 'vitest';
import { analyzeSourceSemanticEvidence, matchControlledSemanticTerms, normalizeControlledSemanticText } from '../index.js';
import { COMPOUND_SEMANTIC_FIXTURE, UNSAFE_SUBSTRING_FIXTURE } from '../fixtures/multilingualSemanticFixture.js';

describe('Phase 4 multilingual controlled semantic evidence', () => {
  it.each([
    ['body', 'primary_shape'], ['cuerpo', 'primary_shape'], ['face', 'secondary_shape'], ['cara', 'secondary_shape'],
    ['eye', 'internal_feature'], ['ojo', 'internal_feature'], ['mouth', 'internal_feature'], ['boca', 'internal_feature'],
    ['línea', 'dark_mark'], ['nariz', 'internal_feature'], ['mejilla', 'internal_feature'], ['pie', 'secondary_shape'],
    ['mano', 'secondary_shape'], ['fondo', 'background'], ['brillo', 'highlight'], ['vacío', 'negative_space'],
  ])('maps %s to %s', (label, concept) => {
    expect(matchControlledSemanticTerms(label).map(item => item.concept)).toContain(concept);
  });

  it.each(UNSAFE_SUBSTRING_FIXTURE)('rejects unsafe substring %s', label => {
    expect(matchControlledSemanticTerms(label)).toEqual([]);
  });

  it.each(COMPOUND_SEMANTIC_FIXTURE)('recognizes controlled compound %s', label => {
    expect(matchControlledSemanticTerms(label)).toHaveLength(1);
  });

  it('normalizes accents while preserving original evidence text', () => {
    const result = analyzeSourceSemanticEvidence({ semanticRole: 'línea', source: { name: 'LÍNEA' } });
    expect(normalizeControlledSemanticText('LÍNEA')).toBe('linea');
    expect(result.evidence.some(item => item.originalToken === 'LÍNEA')).toBe(true);
    expect(result.exactSourceValues[0]).toBe('línea');
  });

  it('keeps outline intent separate from artwork role', () => {
    const result = analyzeSourceSemanticEvidence({ semanticRole: 'outline' });
    expect(result.trustedRoleCandidate).toBeNull();
    expect(result.outlineIntentEvidence).toHaveLength(1);
  });

  it('preserves planning words without assigning an artwork role', () => {
    const result = analyzeSourceSemanticEvidence({ semanticRole: 'fill satin tatami running' });
    expect(result.trustedRoleCandidate).toBeNull();
    expect(result.planningNeutralEvidence).toHaveLength(4);
  });
});
