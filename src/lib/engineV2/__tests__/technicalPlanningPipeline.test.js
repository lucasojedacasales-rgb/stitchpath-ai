import { describe, expect, it } from 'vitest';
import { buildTechnicalEmbroideryPlan } from '../index.js';
import { createGenericMascotTechnicalFixture } from '../fixtures/genericMascotTechnicalFixture.js';
import { createTechnicalBlockingFixture } from '../fixtures/technicalBlockingFixture.js';

const build = (fixture, config = {}) => buildTechnicalEmbroideryPlan({ regions: fixture.regions, threadedObjectMaterialization: fixture.threadedObjectMaterialization, config });

describe('Phase 7 technical planning pipeline', () => {
  it('builds a valid generic mascot plan', () => expect(build(createGenericMascotTechnicalFixture()).valid).toBe(true));
  it('creates one specification per final object', () => { const fixture = createGenericMascotTechnicalFixture(); expect(build(fixture).specifications).toHaveLength(fixture.objects.length); });
  it('reports complete technical coverage', () => expect(build(createGenericMascotTechnicalFixture()).summary.technicalDispositionCoveragePercent).toBe(100));
  it('reports no silent final-object drops', () => expect(build(createGenericMascotTechnicalFixture()).summary.silentFinalObjectDropCount).toBe(0));
  it('creates deterministic output independent of object array order', () => { const fixture = createGenericMascotTechnicalFixture(); const forward = build(fixture); const reversedFixture = { ...fixture, threadedObjectMaterialization: { ...fixture.threadedObjectMaterialization, objects: [...fixture.objects].reverse() } }; expect(build(reversedFixture).specifications).toEqual(forward.specifications); });
  it('preserves structural execution layers exactly', () => { const fixture = createGenericMascotTechnicalFixture(); expect(build(fixture).executionLayers).toEqual(fixture.threadedObjectMaterialization.executionLayers); });
  it('preserves object thread IDs', () => { const fixture = createGenericMascotTechnicalFixture(); const plan = build(fixture); plan.specifications.forEach(item => expect(item.threadId).toBe(fixture.objects.find(object => object.id === item.objectId).threadId)); });
  it.each(['role', 'stitchType'])('preserves object %s', field => { const fixture = createGenericMascotTechnicalFixture(); const plan = build(fixture); plan.specifications.forEach(item => expect(item[field]).toBe(fixture.objects.find(object => object.id === item.objectId)[field])); });
  it('does not mutate objects, regions, or config', () => { const fixture = createGenericMascotTechnicalFixture(); const before = structuredClone(fixture); const plan = build(fixture); expect(fixture).toEqual(before); expect(plan.metadata.inputMutationsDetected).toBe(false); });
  it('creates explicit blocked and manual dispositions', () => { const plan = build(createTechnicalBlockingFixture()); expect(plan.summary.blockedCount).toBe(1); expect(plan.summary.manualRequiredCount).toBe(2); });
  it('blocks all objects under invalid configuration without dropping them', () => { const fixture = createGenericMascotTechnicalFixture(); const plan = build(fixture, { generatePhysicalStitches: true }); expect(plan.specifications).toHaveLength(7); expect(plan.specifications.every(item => item.status === 'blocked')).toBe(true); });
  it('uses the requested internal material profile', () => { const plan = build(createGenericMascotTechnicalFixture(), { materialProfile: 'knit_stretch' }); expect(plan.materialProfile.id).toBe('knit_stretch'); expect(plan.specifications.every(item => item.materialProfileId === 'knit_stretch')).toBe(true); });
  it('plans tatami, satin, and running generators', () => expect(build(createGenericMascotTechnicalFixture()).summary).toMatchObject({ tatamiReadyCount: 2, satinReadyCount: 1, runningReadyCount: 4 }));
  it('plans underlay without physical underlay', () => { const plan = build(createGenericMascotTechnicalFixture()); expect(plan.summary.underlayPlannedCount).toBe(3); expect(plan.metadata.physicalUnderlayGenerated).toBe(false); });
  it('plans pull compensation without modifying geometry', () => expect(build(createGenericMascotTechnicalFixture()).summary.pullCompensationPlannedCount).toBe(3));
  it('plans fill angles without rows', () => { const plan = build(createGenericMascotTechnicalFixture()); expect(plan.summary.fillAnglePlannedCount).toBe(3); expect(JSON.stringify(plan.specifications)).not.toContain('tatamiRows'); });
  it('creates candidates without selecting final pairs', () => { const plan = build(createGenericMascotTechnicalFixture()); expect(plan.summary.entryCandidateCount).toBeGreaterThan(0); expect(plan.metadata.finalEntryExitPairSelected).toBe(false); });
  it.each([['threadBlocksCreated', 0], ['physicalStitchesGenerated', false], ['globalSequencingApplied', false], ['travelOptimizationApplied', false], ['canonicalCommandsGenerated', false], ['machineAdaptationApplied', false], ['encodingApplied', false]])('keeps metadata %s at %s', (field, expected) => expect(build(createGenericMascotTechnicalFixture()).metadata[field]).toBe(expected));
  it.each(['threadBlocks', 'commands', 'canonicalCommands'])('does not create top-level %s', field => expect(Object.hasOwn(build(createGenericMascotTechnicalFixture()), field)).toBe(false));
});
