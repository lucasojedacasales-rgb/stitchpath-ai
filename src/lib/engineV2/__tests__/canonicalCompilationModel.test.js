import { describe, expect, it } from 'vitest';
import { createCanonicalCommandV2 } from '../model.js';
import { validateCanonicalCommandV2 } from '../modelValidation.js';
import { CANONICAL_COMPILATION_STATUSES, CANONICAL_DISCONTINUITY_CLASSIFICATIONS, canonicalDispositionId, canonicalGapId, canonicalSpanId, createCanonicalCommandCompilationV2, createCanonicalCompilationDispositionV2, createCanonicalDiscontinuityClassificationV2, createCanonicalObjectCommandSpanV2 } from '../commandCompilation/canonicalCompilationModel.js';

describe('Phase 10 canonical compilation models', () => {
  it('keeps legacy canonical command calls valid', () => expect(validateCanonicalCommandV2(createCanonicalCommandV2({ type: 'stitch', x: 1, y: 2 })).valid).toBe(true));
  it('defaults optional lineage safely', () => expect(createCanonicalCommandV2({ type: 'end' })).toEqual(expect.objectContaining({ id: null, sequenceIndex: null, transitionId: null, reasonCode: null })));
  it('preserves optional command lineage', () => expect(createCanonicalCommandV2({ type: 'stitch', x: 1, y: 2, id: 'c', sequenceIndex: 3, threadBlockId: 'b', executionStepId: 'e', subpathId: 's', physicalPointId: 'p', transitionId: 't', phase: 'top', technique: 'running', reasonCode: 'R' })).toEqual(expect.objectContaining({ id: 'c', sequenceIndex: 3, threadBlockId: 'b', executionStepId: 'e', subpathId: 's', physicalPointId: 'p', transitionId: 't', phase: 'top', technique: 'running', reasonCode: 'R' })));
  it('deep-clones command source', () => { const source = { nested: { value: 1 } }; const command = createCanonicalCommandV2({ type: 'end', source }); source.nested.value = 2; expect(command.source.nested.value).toBe(1); });
  it('lists all compilation statuses', () => expect(CANONICAL_COMPILATION_STATUSES).toEqual(['compiled', 'manual_required', 'blocked']));
  it('lists all discontinuity classifications', () => expect(CANONICAL_DISCONTINUITY_CLASSIFICATIONS).toEqual(['safe_connector_stitch', 'jump_with_trim', 'jump_without_trim', 'zero_distance_continuation']));
  it('creates deterministic disposition ids', () => expect(canonicalDispositionId('object:1')).toBe('canonical-disposition:object:1'));
  it('creates immutable dispositions', () => expect(Object.isFrozen(createCanonicalCompilationDispositionV2({ objectId: 'o', executionStepId: 'e' }))).toBe(true));
  it('creates compiled dispositions', () => expect(createCanonicalCompilationDispositionV2({ objectId: 'o', executionStepId: 'e', status: 'compiled' }).status).toBe('compiled'));
  it('deep-clones disposition evidence', () => { const evidence = [{ a: 1 }]; const value = createCanonicalCompilationDispositionV2({ objectId: 'o', executionStepId: 'e', evidence }); evidence[0].a = 2; expect(value.evidence[0].a).toBe(1); });
  it('creates deterministic span ids', () => expect(canonicalSpanId('object:1')).toBe('canonical-span:object:1'));
  it('creates immutable command spans', () => expect(Object.isFrozen(createCanonicalObjectCommandSpanV2({ objectId: 'o' }))).toBe(true));
  it('preserves span counts', () => expect(createCanonicalObjectCommandSpanV2({ objectId: 'o', commandCount: 4, stitchCommandCount: 3 }).stitchCommandCount).toBe(3));
  it('creates deterministic gap ids', () => expect(canonicalGapId('transition:1')).toBe('canonical-gap:transition:1'));
  it('creates immutable gap classifications', () => expect(Object.isFrozen(createCanonicalDiscontinuityClassificationV2({ transitionId: 't' }))).toBe(true));
  it('preserves classification evidence', () => expect(createCanonicalDiscontinuityClassificationV2({ transitionId: 't', classification: 'jump_with_trim', trimRequired: true }).trimRequired).toBe(true));
  it('creates immutable compilation roots', () => expect(Object.isFrozen(createCanonicalCommandCompilationV2())).toBe(true));
  it('builds compilation indexes', () => { const value = createCanonicalCommandCompilationV2({ dispositions: [{ objectId: 'o', executionStepId: 'e' }], objectCommandSpans: [{ objectId: 'o' }], commands: [{ id: 'c', type: 'end' }], discontinuityClassifications: [{ transitionId: 't' }] }); expect(Object.keys(value.byDispositionId)).toEqual(['canonical-disposition:o']); expect(Object.keys(value.byCommandId)).toEqual(['c']); });
  it('deep-freezes nested compilation data', () => { const value = createCanonicalCommandCompilationV2({ summary: { nested: { count: 1 } } }); expect(Object.isFrozen(value.summary.nested)).toBe(true); });
  it('uses no timestamps or random identifiers', () => expect(JSON.stringify(createCanonicalCommandCompilationV2())).not.toMatch(/timestamp|random/i));
});
