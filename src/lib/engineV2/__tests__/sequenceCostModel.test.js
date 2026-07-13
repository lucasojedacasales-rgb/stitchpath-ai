import { describe, expect, it } from 'vitest';
import { compareSequenceCosts, createSequenceCost, formatSequenceStableSignature, SEQUENCE_TRAVEL_COMPARISON_TOLERANCE } from '../sequencing/sequenceCostModel.js';

const cost = overrides => createSequenceCost({ dependencyViolationCount: 0, unscheduledSchedulableObjectCount: 0, threadChangeCount: 0, threadRevisitCount: 0, estimatedTravelMm: 0, stableSignature: 'a', ...overrides });

describe('Phase 8 lexicographic cost model', () => {
  it('uses 1e-9 travel tolerance', () => expect(SEQUENCE_TRAVEL_COMPARISON_TOLERANCE).toBe(1e-9));
  it('prioritizes dependency validity over every other metric', () => expect(compareSequenceCosts(cost({ dependencyViolationCount: 1 }), cost({ threadChangeCount: 99, estimatedTravelMm: 999 }))).toBeGreaterThan(0));
  it('prioritizes coverage after dependencies', () => expect(compareSequenceCosts(cost({ unscheduledSchedulableObjectCount: 1 }), cost({ threadChangeCount: 20 }))).toBeGreaterThan(0));
  it('prioritizes thread changes before revisits', () => expect(compareSequenceCosts(cost({ threadChangeCount: 1 }), cost({ threadRevisitCount: 50 }))).toBeGreaterThan(0));
  it('prioritizes thread revisits before travel', () => expect(compareSequenceCosts(cost({ threadRevisitCount: 1 }), cost({ estimatedTravelMm: 500 }))).toBeGreaterThan(0));
  it('uses travel after block metrics', () => expect(compareSequenceCosts(cost({ estimatedTravelMm: 2 }), cost({ estimatedTravelMm: 3 }))).toBeLessThan(0));
  it('uses stable signatures for exact ties', () => expect(compareSequenceCosts(cost({ stableSignature: 'a' }), cost({ stableSignature: 'b' }))).toBeLessThan(0));
  it('treats travel within tolerance as tied', () => expect(compareSequenceCosts(cost({ estimatedTravelMm: 1, stableSignature: 'a' }), cost({ estimatedTravelMm: 1 + 5e-10, stableSignature: 'b' }))).toBeLessThan(0));
  it('does not use a weighted score field', () => expect(createSequenceCost({ weightedScore: -999 })).not.toHaveProperty('weightedScore'));
  it('defaults dependency violations to zero', () => expect(createSequenceCost().dependencyViolationCount).toBe(0));
  it('defaults omitted coverage to zero', () => expect(createSequenceCost().unscheduledSchedulableObjectCount).toBe(0));
  it('preserves fractional travel', () => expect(cost({ estimatedTravelMm: 1.25 }).estimatedTravelMm).toBe(1.25));
  it('formats object and candidate IDs into a signature', () => expect(formatSequenceStableSignature({ executionSteps: [{ objectId: 'object:a', entryCandidateId: 'entry:a', exitCandidateId: 'exit:a' }] })).toBe('object:a[entry:a>exit:a]'));
  it('formats pair-backed internal states', () => expect(formatSequenceStableSignature({ executionSteps: [{ objectId: 'object:a', pair: { entryCandidate: { id: 'e' }, exitCandidate: { id: 'x' } } }] })).toBe('object:a[e>x]'));
  it('returns zero for identical costs', () => expect(compareSequenceCosts(cost({}), cost({}))).toBe(0));
  it('is antisymmetric', () => { const a = cost({ estimatedTravelMm: 1 }); const b = cost({ estimatedTravelMm: 2 }); expect(compareSequenceCosts(a, b)).toBe(-compareSequenceCosts(b, a)); });
});
