import { beforeAll, describe, expect, it } from 'vitest';
import { createThreadChangeCommandFixture } from '../fixtures/threadChangeCommandFixture.js';
import { createObjectTransitionCommandFixture } from '../fixtures/objectTransitionCommandFixture.js';

let fixture; let commands; let blocks;
beforeAll(() => { fixture = createThreadChangeCommandFixture(); commands = fixture.canonicalCompilation.commands; blocks = fixture.sequencePlan.threadBlocks; });

describe('Phase 10 thread-block command compilation', () => {
  it('preserves five thread blocks', () => expect(fixture.canonicalCompilation.summary.sourceThreadBlockCount).toBe(5));
  it('compiles all five thread blocks', () => expect(fixture.canonicalCompilation.summary.compiledThreadBlockCount).toBe(5));
  it('reports full thread-block coverage', () => expect(fixture.canonicalCompilation.summary.threadBlockCompilationCoveragePercent).toBe(100));
  it('emits four color changes', () => expect(fixture.canonicalCompilation.summary.colorChangeCommandCount).toBe(4));
  it('does not emit an initial color change', () => expect(commands[0].type).toBe('jump'));
  it('activates each subsequent block thread', () => expect(commands.filter(item => item.type === 'colorChange').map(item => item.threadId)).toEqual(blocks.slice(1).map(item => item.threadId)));
  it('emits no trailing color change', () => expect(commands.at(-1).type).toBe('end'));
  it('emits no color change inside a block', () => expect(commands.filter(item => item.type === 'colorChange').every(item => item.threadBlockId && item.threadId === blocks.find(block => block.id === item.threadBlockId).threadId)).toBe(true));
  it('preserves thread-block order', () => expect(fixture.canonicalCompilation.threadBlockOrder).toEqual(blocks.map(item => item.id)));
  it('preserves object order inside blocks', () => expect(fixture.canonicalCompilation.executionOrder).toEqual(fixture.sequencePlan.executionSteps.map(item => item.objectId)));
  it('compiles every block contiguously', () => { const indexes = new Map(); commands.forEach((item, index) => { if (!item.threadBlockId) return; const values = indexes.get(item.threadBlockId) || []; values.push(index); indexes.set(item.threadBlockId, values); }); expect([...indexes.values()].every(values => values.at(-1) - values[0] + 1 === values.length)).toBe(true); });
  it('does not merge separate blocks', () => expect(fixture.canonicalCompilation.threadBlockOrder).toHaveLength(blocks.length));
  it('creates one span per object', () => expect(fixture.canonicalCompilation.objectCommandSpans).toHaveLength(7));
  it('creates non-overlapping spans', () => { const spans = fixture.canonicalCompilation.objectCommandSpans; expect(spans.slice(1).every((item, index) => item.firstCommandIndex > spans[index].lastCommandIndex)).toBe(true); });
  it('keeps command indices contiguous', () => expect(commands.map(item => item.sequenceIndex)).toEqual(commands.map((_, index) => index)));
  it('trims same-thread object transitions', () => { const value = createObjectTransitionCommandFixture(); const second = value.canonicalCompilation.objectCommandSpans.find(item => item.objectId === value.sameThreadPair[1]); expect(value.canonicalCompilation.commands[second.firstCommandIndex].type).toBe('trim'); });
  it('does not color-change between same-thread objects', () => { const value = createObjectTransitionCommandFixture(); const second = value.canonicalCompilation.objectCommandSpans.find(item => item.objectId === value.sameThreadPair[1]); expect(value.canonicalCompilation.commands.slice(second.firstCommandIndex, second.lastCommandIndex + 1).some(item => item.type === 'colorChange')).toBe(false); });
  it('color-changes between different-thread objects', () => { const value = createObjectTransitionCommandFixture(); const second = value.canonicalCompilation.objectCommandSpans.find(item => item.objectId === value.differentThreadPair[1]); expect(value.canonicalCompilation.commands.slice(second.firstCommandIndex, second.lastCommandIndex + 1).some(item => item.type === 'colorChange')).toBe(true); });
  it('does not create adjacent duplicate trims', () => expect(fixture.canonicalCompilation.summary.adjacentDuplicateTrimCount).toBe(0));
  it('is deterministic', () => expect(createThreadChangeCommandFixture().canonicalCompilation).toEqual(fixture.canonicalCompilation));
});
