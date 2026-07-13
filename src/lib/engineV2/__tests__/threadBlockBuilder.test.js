import { describe, expect, it } from 'vitest';
import { createObjectExecutionStepV2 } from '../sequencing/sequencePlanningModel.js';
import { buildThreadBlocksFromExecution, sanitizeThreadIdForBlock } from '../sequencing/threadBlockBuilder.js';

const objects = [
  { id: 'object:a', threadId: 'thread:red', layer: 2 },
  { id: 'object:b', threadId: 'thread:red', layer: 1 },
  { id: 'object:c', threadId: 'thread:blue', layer: 3 },
  { id: 'object:d', threadId: 'thread:red', layer: 4 },
];
const step = (index, objectId, threadId, repeatedThreadReason = null) => createObjectExecutionStepV2({ sequenceIndex: index, objectId, threadId, source: { repeatedThreadReason } });

describe('Phase 8 thread-block builder', () => {
  const executionSteps = [step(0, 'object:a', 'thread:red'), step(1, 'object:b', 'thread:red'), step(2, 'object:c', 'thread:blue'), step(3, 'object:d', 'thread:red', 'dependency_gated_revisit')];
  const result = buildThreadBlocksFromExecution({ executionSteps, objects, searchMetadata: {} });
  it('creates contiguous thread blocks', () => expect(result.threadBlocks).toHaveLength(3));
  it('preserves execution object order', () => expect(result.threadBlocks.flatMap(block => block.objectIds)).toEqual(executionSteps.map(item => item.objectId)));
  it('keeps same-thread objects together', () => expect(result.threadBlocks[0].objectIds).toEqual(['object:a', 'object:b']));
  it('uses the minimum structural layer in a block', () => expect(result.threadBlocks[0].layer).toBe(1));
  it('creates no empty blocks', () => expect(result.threadBlocks.every(block => block.objectIds.length > 0)).toBe(true));
  it('creates no adjacent same-thread blocks', () => expect(result.threadBlocks.every((block, index) => index === 0 || block.threadId !== result.threadBlocks[index - 1].threadId)).toBe(true));
  it('keeps first thread reason null', () => expect(result.threadBlocks[0].repeatedThreadReason).toBeNull());
  it('records repeated thread reason', () => expect(result.threadBlocks[2].repeatedThreadReason).toBe('dependency_gated_revisit'));
  it('uses deterministic zero-padded IDs', () => expect(result.threadBlocks[0].id).toBe('thread-block:0000:thread-red'));
  it('sanitizes thread IDs deterministically', () => expect(sanitizeThreadIdForBlock('thread:red/40')).toBe('thread-red-40'));
  it('detects sanitization collisions', () => { const collisionObjects = [{ id: 'object:x', threadId: 'thread:a/b', layer: 0 }, { id: 'object:y', threadId: 'thread:a-b', layer: 0 }]; const collisionSteps = [step(0, 'object:x', 'thread:a/b'), step(1, 'object:y', 'thread:a-b')]; expect(buildThreadBlocksFromExecution({ executionSteps: collisionSteps, objects: collisionObjects }).errors[0].code).toBe('THREAD_BLOCK_SANITIZATION_COLLISION'); });
  it('rejects a repeated thread without reason', () => { const bad = [step(0, 'object:a', 'thread:red'), step(1, 'object:c', 'thread:blue'), step(2, 'object:d', 'thread:red')]; expect(buildThreadBlocksFromExecution({ executionSteps: bad, objects }).errors.some(error => error.code === 'REPEATED_THREAD_REASON_REQUIRED')).toBe(true); });
  it('does not merge disconnected objects', () => expect(result.threadBlocks[0].objectIds).toHaveLength(2));
  it('does not create color-change commands', () => expect(JSON.stringify(result)).not.toMatch(/colorChange|commands/));
});
