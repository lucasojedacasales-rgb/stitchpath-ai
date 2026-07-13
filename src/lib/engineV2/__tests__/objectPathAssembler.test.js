import { beforeAll, describe, expect, it } from 'vitest';
import { createPathDiscontinuityFixture } from '../fixtures/pathDiscontinuityFixture.js';
import { createRunningPhysicalFixture } from '../fixtures/runningPhysicalFixture.js';

let fixture;
let path;
beforeAll(() => { fixture = createRunningPhysicalFixture(); path = fixture.physicalPlan.objectPaths[0]; });

describe('Phase 9 object path assembly', () => {
  it('creates an entry anchor subpath', () => expect(path.subpaths[0]).toEqual(expect.objectContaining({ phase: 'entry_anchor', technique: 'anchor' })));
  it('creates an exit anchor subpath', () => expect(path.subpaths.at(-1)).toEqual(expect.objectContaining({ phase: 'exit_anchor', technique: 'anchor' })));
  it('makes the first point equal the selected entry', () => expect(path.firstPhysicalPoint).toEqual(expect.objectContaining(path.selectedEntryPoint)));
  it('makes the last point equal the selected exit', () => expect(path.lastPhysicalPoint).toEqual(expect.objectContaining(path.selectedExitPoint)));
  it('preserves selected candidate IDs', () => { const selected = fixture.sequencePlan.selectedEntryExitPairs[0]; expect([path.entryCandidateId, path.exitCandidateId]).toEqual([selected.entryCandidateId, selected.exitCandidateId]); });
  it('creates one transition per adjacent subpath pair', () => expect(path.subpathTransitions).toHaveLength(path.subpaths.length - 1));
  it('uses deterministic transition IDs', () => expect(path.subpathTransitions.every(item => item.id === `physical-gap:${path.objectId}:${item.fromSubpathId}:${item.toSubpathId}`)).toBe(true));
  it('keeps transition distances finite', () => expect(path.subpathTransitions.every(item => Number.isFinite(item.distanceMm))).toBe(true));
  it('does not count transitions as physical stitches', () => expect(path.physicalStitchCount).toBe(path.subpaths.reduce((sum, item) => sum + item.stitchCount, 0)));
  it('does not add automatic connectors', () => expect(path.source.automaticConnectorsAdded).toBe(false));
  it('does not classify transitions as commands', () => expect(path.subpathTransitions.every(item => !Object.hasOwn(item, 'commandType') && !Object.hasOwn(item, 'jump') && !Object.hasOwn(item, 'trim'))).toBe(true));
  it('marks unsafe hole-crossing transitions', () => expect(createPathDiscontinuityFixture().physicalPlan.objectPaths[0].subpathTransitions.some(item => item.crossesHole)).toBe(true));
  it('keeps unsafe transitions discontinuous', () => expect(createPathDiscontinuityFixture().physicalPlan.objectPaths[0].subpathTransitions.filter(item => item.crossesHole).every(item => item.continuousStitchAllowed === false)).toBe(true));
  it('keeps contiguous subpath indexes', () => expect(path.subpaths.map(item => item.subpathIndex)).toEqual(path.subpaths.map((_, index) => index)));
});
