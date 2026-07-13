import { describe, expect, it } from 'vitest';
import { createGenericMascotSequenceFixture } from '../fixtures/genericMascotSequenceFixture.js';
import { buildGlobalSequencePlan } from '../sequencing/globalSequencePlanner.js';
import {
  validateGlobalSequencePlan, validateObjectExecutionStepV2, validateObjectSequenceDispositionV2,
  validateSelectedEntryExitPairV2, validateSequenceTransitionV2,
} from '../sequencing/sequencePlanningValidation.js';

const fixture = createGenericMascotSequenceFixture();
const plan = buildGlobalSequencePlan({ regions: fixture.regions, threadedObjectMaterialization: fixture.threadedObjectMaterialization, technicalPlan: fixture.technicalPlan });
const clone = value => JSON.parse(JSON.stringify(value));
const validate = altered => validateGlobalSequencePlan(altered, fixture.threadedObjectMaterialization, fixture.technicalPlan);

describe('Phase 8 sequence validation', () => {
  it('accepts the valid mascot plan', () => expect(validate(plan).valid).toBe(true));
  it('rejects a missing disposition ID', () => expect(validateObjectSequenceDispositionV2({ objectId: 'object:a', status: 'scheduled' }).valid).toBe(false));
  it('rejects a nondeterministic disposition ID', () => expect(validateObjectSequenceDispositionV2({ id: 'wrong', objectId: 'object:a', status: 'scheduled' }).errors[0].code).toBe('NONDETERMINISTIC_SEQUENCE_DISPOSITION_ID'));
  it('rejects an invalid disposition status', () => expect(validateObjectSequenceDispositionV2({ id: 'sequence-disposition:object:a', objectId: 'object:a', status: 'lost' }).valid).toBe(false));
  it('rejects an incomplete execution step', () => expect(validateObjectExecutionStepV2({ id: 'execution:0000:object:a', sequenceIndex: 0, objectId: 'object:a' }).valid).toBe(false));
  it('accepts a valid selected pair', () => { const selection = plan.selectedEntryExitPairs[0]; const object = fixture.objects.find(item => item.id === selection.objectId); expect(validateSelectedEntryExitPairV2(selection, object, fixture.technicalPlan.byObjectId[object.id]).valid).toBe(true); });
  it('rejects a changed selected point', () => { const selection = clone(plan.selectedEntryExitPairs[0]); selection.entryPoint.x += 1; const object = fixture.objects.find(item => item.id === selection.objectId); expect(validateSelectedEntryExitPairV2(selection, object, fixture.technicalPlan.byObjectId[object.id]).errors.some(error => error.code === 'SELECTED_ENTRY_POINT_CHANGED')).toBe(true); });
  it('rejects a missing entry candidate', () => { const selection = clone(plan.selectedEntryExitPairs[0]); selection.entryCandidateId = 'missing'; const object = fixture.objects.find(item => item.id === selection.objectId); expect(validateSelectedEntryExitPairV2(selection, object, fixture.technicalPlan.byObjectId[object.id]).valid).toBe(false); });
  it('accepts a valid transition record', () => expect(validateSequenceTransitionV2(plan.transitions[0]).valid).toBe(true));
  it('rejects inconsistent transition thread flags', () => expect(validateSequenceTransitionV2({ ...plan.transitions[0], sameThread: true, threadChanged: true }).valid).toBe(false));
  it('detects a final object without disposition', () => { const altered = clone(plan); altered.dispositions.pop(); expect(validate(altered).errors.some(error => error.code === 'FINAL_OBJECT_WITHOUT_SEQUENCE_DISPOSITION')).toBe(true); });
  it('detects duplicate disposition IDs', () => { const altered = clone(plan); altered.dispositions.push(clone(altered.dispositions[0])); expect(validate(altered).errors.some(error => error.code === 'DUPLICATE_SEQUENCE_DISPOSITION_ID')).toBe(true); });
  it('detects duplicate execution objects', () => { const altered = clone(plan); altered.executionSteps[1].objectId = altered.executionSteps[0].objectId; expect(validate(altered).errors.some(error => error.code === 'DUPLICATE_EXECUTION_OBJECT')).toBe(true); });
  it('detects non-contiguous indices', () => { const altered = clone(plan); altered.executionSteps[1].sequenceIndex = 9; expect(validate(altered).errors.some(error => error.code === 'NONCONTIGUOUS_EXECUTION_INDEX')).toBe(true); });
  it('detects dependency order violations', () => { const altered = clone(plan); altered.executionSteps.reverse(); expect(validate(altered).errors.some(error => error.code === 'SEQUENCE_DEPENDENCY_VIOLATION')).toBe(true); });
  it('detects transition distance mismatch', () => { const altered = clone(plan); altered.transitions[0].distanceMm += 1; expect(validate(altered).errors.some(error => error.code === 'TRANSITION_DISTANCE_MISMATCH')).toBe(true); });
  it('detects missing transitions', () => { const altered = clone(plan); altered.transitions.pop(); expect(validate(altered).errors.some(error => error.code === 'TRANSITION_COVERAGE_MISMATCH')).toBe(true); });
  it('detects an object missing from thread blocks', () => { const altered = clone(plan); altered.threadBlocks[0].objectIds = []; expect(validate(altered).errors.some(error => error.code === 'EXECUTION_OBJECT_MISSING_FROM_THREAD_BLOCKS')).toBe(true); });
  it('detects a thread block mismatch', () => { const altered = clone(plan); altered.threadBlocks[0].threadId = 'thread:wrong'; expect(validate(altered).errors.some(error => error.code === 'THREAD_BLOCK_OBJECT_THREAD_MISMATCH')).toBe(true); });
  it('detects repeated thread without reason', () => { const altered = clone(plan); altered.threadBlocks.push({ ...clone(altered.threadBlocks[0]), id: 'thread-block:9999:repeat', objectIds: [], repeatedThreadReason: null }); expect(validate(altered).errors.some(error => error.code === 'REPEATED_THREAD_WITHOUT_REASON')).toBe(true); });
  it('detects physical stitch arrays', () => { const altered = clone(plan); altered.stitches = [{ x: 0, y: 0 }]; expect(validate(altered).errors.some(error => error.code === 'PHYSICAL_OR_COMMAND_OUTPUT_FORBIDDEN')).toBe(true); });
  it('detects canonical command arrays', () => { const altered = clone(plan); altered.canonicalCommands = [{ type: 'jump' }]; expect(validate(altered).errors.some(error => error.code === 'PHYSICAL_OR_COMMAND_OUTPUT_FORBIDDEN')).toBe(true); });
  it('detects machine fields', () => { const altered = clone(plan); altered.machineProfile = { id: 'machine' }; expect(validate(altered).errors.some(error => error.code === 'MACHINE_OR_ENCODER_FIELD_FORBIDDEN')).toBe(true); });
  it('does not silently repair invalid plans', () => { const altered = clone(plan); altered.executionSteps = []; validate(altered); expect(altered.executionSteps).toEqual([]); });
});
