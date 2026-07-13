import { describe, expect, it } from 'vitest';
import { createEntryExitCandidateV2 } from '../technical/technicalPlanningModel.js';
import { enumerateValidEntryExitPairs, selectEntryExitPairForTransition, sequencePointDistance } from '../sequencing/candidatePairSelector.js';
import { resolveSequencePlanningConfig } from '../sequencing/sequencePlanningConfig.js';
import { createCandidateTravelFixture } from '../fixtures/candidateTravelFixture.js';
import { createSequenceTechnicalFixture, createSyntheticTechnicalObject } from '../fixtures/simpleSequenceFixture.js';

const fixture = createCandidateTravelFixture();
const object = fixture.objects[0];
const specification = fixture.technicalPlan.byObjectId[object.id];
const config = resolveSequencePlanningConfig();

describe('Phase 8 entry/exit pair selection', () => {
  it('enumerates valid Phase 7 pairs', () => expect(enumerateValidEntryExitPairs({ object, specification, config }).length).toBeGreaterThan(0));
  it('returns deterministic pair order', () => expect(enumerateValidEntryExitPairs({ object, specification, config }).map(item => item.id)).toEqual(enumerateValidEntryExitPairs({ object, specification, config }).map(item => item.id)));
  it('uses only source entry candidates', () => { const ids = new Set(specification.entryCandidates.map(item => item.id)); expect(enumerateValidEntryExitPairs({ object, specification, config }).every(pair => ids.has(pair.entryCandidate.id))).toBe(true); });
  it('uses only source exit candidates', () => { const ids = new Set(specification.exitCandidates.map(item => item.id)); expect(enumerateValidEntryExitPairs({ object, specification, config }).every(pair => ids.has(pair.exitCandidate.id))).toBe(true); });
  it('does not invent a center candidate', () => expect(enumerateValidEntryExitPairs({ object, specification, config }).some(pair => pair.entryCandidate.sourceType === 'invented_center')).toBe(false));
  it('caps entry candidates', () => expect(new Set(enumerateValidEntryExitPairs({ object, specification, config: resolveSequencePlanningConfig({ maximumEntryCandidatesPerObject: 1 }) }).map(pair => pair.entryCandidate.id)).size).toBe(1));
  it('caps exit candidates', () => expect(new Set(enumerateValidEntryExitPairs({ object, specification, config: resolveSequencePlanningConfig({ maximumExitCandidatesPerObject: 1 }) }).map(pair => pair.exitCandidate.id)).size).toBe(1));
  it('rejects candidates for another object', () => { const altered = { ...specification, entryCandidates: [createEntryExitCandidateV2({ id: 'foreign', objectId: 'object:foreign', kind: 'entry', point: { x: 0, y: 0 }, sourceType: 'boundary_vertex', valid: true })] }; expect(enumerateValidEntryExitPairs({ object, specification: altered, config })).toEqual([]); });
  it('rejects wrong candidate kinds', () => { const altered = { ...specification, entryCandidates: [createEntryExitCandidateV2({ id: 'wrong', objectId: object.id, kind: 'exit', point: { x: 0, y: 0 }, sourceType: 'boundary_vertex', valid: true })] }; expect(enumerateValidEntryExitPairs({ object, specification: altered, config })).toEqual([]); });
  it('rejects non-finite candidates', () => { const altered = { ...specification, entryCandidates: [createEntryExitCandidateV2({ id: 'nan', objectId: object.id, kind: 'entry', point: { x: NaN, y: 0 }, sourceType: 'boundary_vertex', valid: true })] }; expect(enumerateValidEntryExitPairs({ object, specification: altered, config })).toEqual([]); });
  it('rejects candidates marked invalid, including hole candidates', () => { const altered = { ...specification, entryCandidates: [createEntryExitCandidateV2({ id: 'hole', objectId: object.id, kind: 'entry', point: { x: 5, y: 5 }, sourceType: 'interior_point', valid: false, rejectionReasons: ['INSIDE_HOLE'] })] }; expect(enumerateValidEntryExitPairs({ object, specification: altered, config })).toEqual([]); });
  it('removes duplicate candidate IDs', () => { const duplicate = specification.entryCandidates[0]; const altered = { ...specification, entryCandidates: [duplicate, duplicate] }; expect(new Set(enumerateValidEntryExitPairs({ object, specification: altered, config }).map(pair => pair.entryCandidate.id)).size).toBe(1); });
  it('selects nearest incoming entry', () => { const pair = selectEntryExitPairForTransition({ previousExitPoint: { x: 100, y: 0 }, object, specification, config }); const minimum = Math.min(...specification.entryCandidates.filter(item => item.valid).map(item => sequencePointDistance({ x: 100, y: 0 }, item.point))); expect(sequencePointDistance({ x: 100, y: 0 }, pair.entryCandidate.point)).toBe(minimum); });
  it('computes Euclidean distance', () => expect(sequencePointDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5));
  it('returns null distance for invalid points', () => expect(sequencePointDistance(null, { x: 1, y: 1 })).toBeNull());
  it('returns no pairs without a specification', () => expect(enumerateValidEntryExitPairs({ object, specification: null, config })).toEqual([]));
  it('prefers distinct genuine endpoints for open running paths', () => { const running = createSyntheticTechnicalObject('open-running-pair', { stitchType: 'running', role: 'internal_detail', technicalIntent: { geometryType: 'open_path', lineIntent: true }, technicalGeometryIntent: 'open_path', geometry: [{ x: 0, y: 0 }, { x: 5, y: 2 }, { x: 10, y: 0 }] }); const source = createSequenceTechnicalFixture([running]); const pairs = enumerateValidEntryExitPairs({ object: running, specification: source.technicalPlan.byObjectId[running.id], config }); expect(pairs.every(pair => pair.entryCandidate.point.x !== pair.exitCandidate.point.x || pair.entryCandidate.point.y !== pair.exitCandidate.point.y)).toBe(true); });
  it('does not create a physical stitch path', () => expect(enumerateValidEntryExitPairs({ object, specification, config })[0]).not.toHaveProperty('stitches'));
});
