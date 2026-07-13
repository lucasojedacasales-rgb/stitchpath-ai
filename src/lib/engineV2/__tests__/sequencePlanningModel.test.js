import { describe, expect, it } from 'vitest';
import {
  createGlobalSequencePlanV2, createObjectExecutionStepV2, createObjectSequenceDispositionV2,
  createSelectedEntryExitPairV2, createSequenceSearchMetadataV2, createSequenceTransitionV2,
  executionStepId, selectedEntryExitIdForObject, sequenceDispositionIdForObject, transitionId,
} from '../sequencing/sequencePlanningModel.js';

describe('Phase 8 sequence planning models', () => {
  it('creates a deterministic disposition ID', () => expect(sequenceDispositionIdForObject('object:a')).toBe('sequence-disposition:object:a'));
  it('creates an immutable disposition', () => expect(Object.isFrozen(createObjectSequenceDispositionV2({ objectId: 'object:a', status: 'scheduled' }))).toBe(true));
  it('clones disposition evidence', () => { const evidence = [{ code: 'A' }]; const result = createObjectSequenceDispositionV2({ objectId: 'object:a', evidence }); evidence[0].code = 'B'; expect(result.evidence[0].code).toBe('A'); });
  it('defaults disposition automation to true', () => expect(createObjectSequenceDispositionV2({ objectId: 'object:a' }).automatic).toBe(true));
  it('creates a deterministic selection ID', () => expect(selectedEntryExitIdForObject('object:a')).toBe('selected-entry-exit:object:a'));
  it('preserves finite incoming travel', () => expect(createSelectedEntryExitPairV2({ objectId: 'object:a', incomingTravelMm: 2.5 }).incomingTravelMm).toBe(2.5));
  it('clones selected points', () => { const point = { x: 1, y: 2 }; const result = createSelectedEntryExitPairV2({ objectId: 'object:a', entryPoint: point }); point.x = 9; expect(result.entryPoint.x).toBe(1); });
  it('deep-freezes selected points', () => expect(Object.isFrozen(createSelectedEntryExitPairV2({ objectId: 'object:a', entryPoint: { x: 1, y: 2 } }).entryPoint)).toBe(true));
  it('formats zero-padded execution IDs', () => expect(executionStepId(7, 'object:a')).toBe('execution:0007:object:a'));
  it('creates execution steps with cloned dependencies', () => { const ids = ['object:b']; const result = createObjectExecutionStepV2({ sequenceIndex: 0, objectId: 'object:a', structuralDependencyIds: ids }); ids.push('object:c'); expect(result.structuralDependencyIds).toEqual(['object:b']); });
  it('creates deterministic transition IDs', () => expect(transitionId('object:a', 'object:b')).toBe('transition:object:a:object:b'));
  it('preserves transition relationship flags', () => expect(createSequenceTransitionV2({ fromObjectId: 'object:a', toObjectId: 'object:b', threadChanged: true }).threadChanged).toBe(true));
  it('creates immutable search metadata', () => expect(Object.isFrozen(createSequenceSearchMetadataV2({ algorithmUsed: 'exact' }))).toBe(true));
  it('defaults search fallback to false', () => expect(createSequenceSearchMetadataV2().fallbackUsed).toBe(false));
  it('creates the Phase 8 plan version', () => expect(createGlobalSequencePlanV2().version).toBe('2-global-sequence-plan'));
  it('indexes dispositions when omitted', () => { const disposition = createObjectSequenceDispositionV2({ objectId: 'object:a' }); expect(createGlobalSequencePlanV2({ dispositions: [disposition] }).byDispositionId[disposition.id]).toEqual(disposition); });
  it('deep-freezes a global plan', () => expect(Object.isFrozen(createGlobalSequencePlanV2())).toBe(true));
  it('does not add timestamps or random IDs', () => expect(JSON.stringify(createGlobalSequencePlanV2())).not.toMatch(/timestamp|createdAt|random/i));
});
