import { beforeAll, describe, expect, it } from 'vitest';
import { compilePhysicalSubpathToCanonicalCommands } from '../commandCompilation/objectCommandCompiler.js';
import { createContinuousSubpathCommandFixture } from '../fixtures/continuousSubpathCommandFixture.js';

let fixture; let path; let top; let sourceCommands;
beforeAll(() => { fixture = createContinuousSubpathCommandFixture(); path = fixture.physicalPlan.objectPaths[0]; top = path.subpaths.find(item => item.phase === 'top'); sourceCommands = fixture.canonicalCompilation.commands.filter(item => item.reasonCode === 'PHYSICAL_SOURCE_STITCH'); });

describe('Phase 10 object command compilation', () => {
  it('compiles a continuous physical subpath', () => expect(sourceCommands.length).toBe(path.physicalStitchCount));
  it('maps N points to N-1 source stitches', () => expect(sourceCommands.filter(item => item.subpathId === top.id)).toHaveLength(top.points.length - 1));
  it('does not stitch to a subpath first point twice', () => expect(sourceCommands.filter(item => item.physicalPointId === top.points[0].id)).toHaveLength(0));
  it('preserves target physical point ids', () => expect(sourceCommands.filter(item => item.subpathId === top.id).map(item => item.physicalPointId)).toEqual(top.points.slice(1).map(item => item.id)));
  it('preserves target coordinates exactly', () => expect(sourceCommands.filter(item => item.subpathId === top.id).map(item => [item.x, item.y])).toEqual(top.points.slice(1).map(item => [item.x, item.y])));
  it('preserves object ids', () => expect(sourceCommands.every(item => item.objectId === path.objectId)).toBe(true));
  it('preserves region ids', () => expect(sourceCommands.every(item => item.regionId === path.regionId)).toBe(true));
  it('preserves thread ids', () => expect(sourceCommands.every(item => item.threadId === path.threadId)).toBe(true));
  it('preserves execution step ids', () => expect(sourceCommands.every(item => item.executionStepId === path.executionStepId)).toBe(true));
  it('preserves thread block ids', () => expect(sourceCommands.every(item => item.threadBlockId === path.threadBlockId)).toBe(true));
  it('preserves subpath phases', () => expect(sourceCommands.filter(item => item.subpathId === top.id).every(item => item.phase === top.phase)).toBe(true));
  it('preserves subpath techniques', () => expect(sourceCommands.filter(item => item.subpathId === top.id).every(item => item.technique === top.technique)).toBe(true));
  it('creates unique movement keys', () => expect(new Set(sourceCommands.map(item => item.source.physicalMovementKey)).size).toBe(sourceCommands.length));
  it('records from and to physical points', () => expect(sourceCommands.every(item => item.source.fromPhysicalPointId && item.source.toPhysicalPointId)).toBe(true));
  it('emits no zero-length source stitch', () => expect(fixture.canonicalCompilation.summary.zeroLengthStitchCommandCount).toBe(0));
  it('handles a one-point anchor without source stitches', () => expect(path.subpaths.filter(item => item.technique === 'anchor').every(anchor => sourceCommands.every(item => item.subpathId !== anchor.id))).toBe(true));
  it('makes every subpath start reachable', () => expect(fixture.canonicalCompilation.summary.physicalPointReachabilityCoveragePercent).toBe(100));
  it('preserves physical subpath order', () => { const seen = [...new Set(fixture.canonicalCompilation.commands.filter(item => item.objectId === path.objectId && item.subpathId).map(item => item.subpathId))]; const expected = path.subpaths.map(item => item.id).filter(id => seen.includes(id)); expect(seen).toEqual(expected); });
  it('rejects compilation when current position misses subpath start', () => { const object = fixture.threadedObjectMaterialization.objects[0]; const result = compilePhysicalSubpathToCanonicalCommands({ object, physicalPath: path, subpath: top, currentPosition: { x: 999, y: 999 }, activeThreadId: object.threadId, executionStep: fixture.sequencePlan.executionSteps[0], threadBlock: fixture.sequencePlan.threadBlocks[0], config: fixture.canonicalCompilation.config }); expect(result.valid).toBe(false); expect(result.errors[0].code).toBe('PHYSICAL_SUBPATH_START_NOT_REACHED'); });
  it('is deterministic', () => expect(createContinuousSubpathCommandFixture().canonicalCompilation).toEqual(fixture.canonicalCompilation));
});
