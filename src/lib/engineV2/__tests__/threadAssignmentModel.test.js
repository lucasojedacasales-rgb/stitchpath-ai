import { describe, expect, it } from 'vitest';
import { createDraftThreadAssignmentV2, threadAssignmentIdForDraft, validateDraftThreadAssignmentV2 } from '../index.js';

describe('Phase 6 thread assignment model', () => {
  const assigned = () => createDraftThreadAssignmentV2({ draftId: 'draft:p1', regionId: 'r1', status: 'assigned', threadId: 'thread:artwork:00FF00', visualColor: '#0f0', normalizedVisualColor: '#00FF00', deltaE: 0, exactMatch: true, confidence: 1, policy: 'artwork_exact' });
  it('creates deterministic assignment IDs', () => expect(assigned().id).toBe('thread-assignment:draft:p1'));
  it('exposes the deterministic ID helper', () => expect(threadAssignmentIdForDraft('draft:x')).toBe('thread-assignment:draft:x'));
  it('validates an assigned disposition', () => expect(validateDraftThreadAssignmentV2(assigned()).valid).toBe(true));
  it('requires a thread for assigned status', () => expect(validateDraftThreadAssignmentV2(createDraftThreadAssignmentV2({ draftId: 'draft:x', status: 'assigned' })).errors.some(item => item.code === 'ASSIGNED_THREAD_ID_REQUIRED')).toBe(true));
  it('forces blocked thread ID to null', () => expect(createDraftThreadAssignmentV2({ draftId: 'draft:x', status: 'blocked', threadId: 'thread:x' }).threadId).toBeNull());
  it('validates a blocked disposition', () => expect(validateDraftThreadAssignmentV2(createDraftThreadAssignmentV2({ draftId: 'draft:x', status: 'blocked' })).valid).toBe(true));
  it('rejects unknown statuses', () => expect(validateDraftThreadAssignmentV2(createDraftThreadAssignmentV2({ draftId: 'draft:x', status: 'pending' })).valid).toBe(false));
  it('rejects a nondeterministic ID', () => expect(validateDraftThreadAssignmentV2({ ...assigned(), id: 'random' }).errors.some(item => item.code === 'NON_DETERMINISTIC_THREAD_ASSIGNMENT_ID')).toBe(true));
  it.each([-1, NaN, Infinity])('rejects invalid Delta E %j', deltaE => expect(validateDraftThreadAssignmentV2({ ...assigned(), deltaE }).errors.some(item => item.code === 'INVALID_ASSIGNMENT_DELTA_E')).toBe(true));
  it('deeply freezes assignment evidence', () => { const assignment = assigned(); expect(Object.isFrozen(assignment)).toBe(true); expect(Object.isFrozen(assignment.evidence)).toBe(true); });
  it('clamps confidence', () => expect(createDraftThreadAssignmentV2({ draftId: 'draft:x', confidence: 3 }).confidence).toBe(1));
});
