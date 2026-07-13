import { beforeAll, describe, expect, it } from 'vitest';
import { createCanonicalCommandBlockingFixture } from '../fixtures/canonicalCommandBlockingFixture.js';
import { createGenericMascotCommandFixture } from '../fixtures/genericMascotCommandFixture.js';

let fixture; let compilation;
beforeAll(() => { fixture = createGenericMascotCommandFixture(); compilation = fixture.canonicalCompilation; });

describe('Phase 10 canonical command compiler', () => {
  it('produces a valid canonical compilation', () => expect(compilation.valid).toBe(true));
  it('compiles all seven objects', () => expect(compilation.summary.compiledObjectCount).toBe(7));
  it('creates one disposition per object', () => expect(compilation.dispositions).toHaveLength(7));
  it('reports complete disposition coverage', () => expect(compilation.summary.canonicalDispositionCoveragePercent).toBe(100));
  it('has no silent object drops', () => expect(compilation.summary.silentScheduledObjectDropCount).toBe(0));
  it('sets initial thread from first block', () => expect(compilation.initialThreadId).toBe(fixture.sequencePlan.threadBlocks[0].threadId));
  it('emits one initial positioning jump', () => expect(compilation.summary.initialPositionJumpCount).toBe(1));
  it('emits no trim before initial positioning', () => expect(compilation.commands[0].type).toBe('jump'));
  it('targets the first physical anchor initially', () => expect(compilation.commands[0]).toEqual(expect.objectContaining({ x: fixture.physicalPlan.objectPaths[0].firstPhysicalPoint.x, y: fixture.physicalPlan.objectPaths[0].firstPhysicalPoint.y, physicalPointId: fixture.physicalPlan.objectPaths[0].firstPhysicalPoint.id })));
  it('generates canonical stitch commands', () => expect(compilation.metadata.stitchCommandsGenerated).toBe(true));
  it('generates canonical jump commands', () => expect(compilation.metadata.jumpCommandsGenerated).toBe(true));
  it('generates universal trim intents', () => expect(compilation.metadata.trimCommandsGenerated).toBe(true));
  it('generates thread-block color changes', () => expect(compilation.metadata.colorChangeCommandsGenerated).toBe(true));
  it('generates exactly one final end', () => expect(compilation.commands.filter(item => item.type === 'end')).toHaveLength(1));
  it('places end last', () => expect(compilation.commands.at(-1).reasonCode).toBe('STREAM_COMPLETE'));
  it('maps every physical stitch once', () => expect(compilation.summary.physicalStitchMovementCoveragePercent).toBe(100));
  it('reaches every physical point', () => expect(compilation.summary.physicalPointReachabilityCoveragePercent).toBe(100));
  it('classifies every physical gap', () => expect(compilation.summary.discontinuityClassificationCoveragePercent).toBe(100));
  it('does not quantize command coordinates', () => expect(compilation.metadata.commandCoordinatesQuantized).toBe(false));
  it('does not split movements', () => expect(compilation.metadata.movementsSplitForMachine).toBe(false));
  it('does not apply machine behavior or encoding', () => expect([compilation.metadata.machineAdaptationAdded, compilation.metadata.encodingAdded]).toEqual([false, false]));
  it('rejects a missing physical path transactionally', () => { const blocked = createCanonicalCommandBlockingFixture().missingPhysicalPath.canonicalCompilation; expect(blocked.valid).toBe(false); expect(blocked.commands).toEqual([]); });
  it('is deterministic', () => expect(createGenericMascotCommandFixture().canonicalCompilation).toEqual(compilation));
});
