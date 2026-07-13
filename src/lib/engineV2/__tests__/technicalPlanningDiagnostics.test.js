import { describe, expect, it } from 'vitest';
import { buildTechnicalEmbroideryPlan, createTechnicalPlanningDiagnostic } from '../index.js';
import { createGenericMascotTechnicalFixture } from '../fixtures/genericMascotTechnicalFixture.js';

function diagnostic() { const fixture = createGenericMascotTechnicalFixture(); const technicalPlan = buildTechnicalEmbroideryPlan({ regions: fixture.regions, threadedObjectMaterialization: fixture.threadedObjectMaterialization }); return createTechnicalPlanningDiagnostic({ regions: fixture.regions, threadedObjectMaterialization: fixture.threadedObjectMaterialization, technicalPlan }); }

describe('Phase 7 technical planning diagnostics', () => {
  it('reports a valid plan', () => expect(diagnostic().valid).toBe(true));
  it('reports 100 percent coverage', () => expect(diagnostic().technicalDispositionCoveragePercent).toBe(100));
  it('reports no silent drops', () => expect(diagnostic().silentFinalObjectDropCount).toBe(0));
  it('matches specification and source counts', () => { const value = diagnostic(); expect(value.technicalSpecificationCount).toBe(value.sourceFinalObjectCount); });
  it('reports all mascot specifications planned', () => expect(diagnostic()).toMatchObject({ plannedCount: 7, manualRequiredCount: 0, blockedCount: 0 }));
  it('reports stitch-type distribution', () => expect(diagnostic().stitchTypeDistribution).toEqual({ running: 4, satin: 1, tatami: 2 }));
  it('reports the material profile distribution', () => expect(diagnostic().materialProfileDistribution.generic_medium_woven).toBe(7));
  it('reports generator readiness', () => expect(diagnostic().generatorReadyDistribution).toEqual({ 'running:ready': 4, 'satin:ready': 1, 'tatami:ready': 2 }));
  it('reports underlay distribution', () => expect(diagnostic().underlayPlanDistribution['edge_run+tatami_lattice']).toBe(2));
  it('reports fill-angle strategies', () => expect(diagnostic().fillAngleStrategyDistribution.not_applicable).toBe(4));
  it('reports pull-compensation strategies', () => expect(diagnostic().pullCompensationStrategyDistribution.axis_aware).toBe(3));
  it('reports entry and exit candidates', () => { const value = diagnostic(); expect(value.entryCandidateCount).toBeGreaterThan(0); expect(value.exitCandidateCount).toBe(value.entryCandidateCount); });
  it('reports no duplicate specifications or cycles', () => expect(diagnostic()).toMatchObject({ duplicateTechnicalSpecificationCount: 0, dependencyCycleCount: 0 }));
  it.each(['geometryMutationCount', 'holeMutationCount', 'visualColorMutationCount', 'threadIdMutationCount', 'roleMutationCount', 'stitchTypeMutationCount', 'layerMutationCount', 'dependencyMutationCount'])('reports zero %s', field => expect(diagnostic()[field]).toBe(0));
  it('reports no object mutation', () => expect(diagnostic().objectMutationsDetected).toBe(false));
  it('reports no thread blocks', () => expect(diagnostic().threadBlocksCreated).toBe(0));
  it.each(['physicalStitchesGenerated', 'physicalUnderlayGenerated', 'finalEntryExitPairSelected', 'globalSequencingApplied', 'travelOptimizationApplied', 'canonicalCommandsGenerated', 'machineAdaptationApplied', 'encodingApplied'])('reports %s false', field => expect(diagnostic()[field]).toBe(false));
});
