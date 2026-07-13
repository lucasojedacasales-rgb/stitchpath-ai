import { describe, expect, it } from 'vitest';
import { createGenericMascotSequenceFixture } from '../fixtures/genericMascotSequenceFixture.js';
import { buildGlobalSequencePlan } from '../sequencing/globalSequencePlanner.js';
import { createGlobalSequenceDiagnostic } from '../sequencing/sequencePlanningDiagnostics.js';

const fixture = createGenericMascotSequenceFixture();
const sequencePlan = buildGlobalSequencePlan({ regions: fixture.regions, threadedObjectMaterialization: fixture.threadedObjectMaterialization, technicalPlan: fixture.technicalPlan });
const diagnostic = createGlobalSequenceDiagnostic({ regions: fixture.regions, threadedObjectMaterialization: fixture.threadedObjectMaterialization, technicalPlan: fixture.technicalPlan, sequencePlan });

describe('Phase 8 sequence diagnostics', () => {
  it('reports a valid sequence', () => expect(diagnostic.valid).toBe(true));
  it('reports 100 percent disposition coverage', () => expect(diagnostic.sequenceDispositionCoveragePercent).toBe(100));
  it('reports no silent drops', () => expect(diagnostic.silentFinalObjectDropCount).toBe(0));
  it('reports all selected pairs valid', () => expect(diagnostic.validSelectedPairCount).toBe(diagnostic.selectedEntryExitPairCount));
  it('reports no invalid selected pairs', () => expect(diagnostic.invalidSelectedPairCount).toBe(0));
  it('reports five unique mascot threads', () => expect(diagnostic.uniqueThreadCount).toBe(5));
  it('reports zero dependency violations', () => expect(diagnostic.dependencyViolationCount).toBe(0));
  it('reports exact optimality', () => expect([diagnostic.algorithmUsed, diagnostic.optimalityGuaranteed]).toEqual(['exact', true]));
  it('reports explored search states', () => expect(diagnostic.expandedStates).toBeGreaterThan(0));
  it.each(['geometryMutationCount', 'holeMutationCount', 'visualColorMutationCount', 'threadIdMutationCount', 'roleMutationCount', 'stitchTypeMutationCount', 'layerMutationCount', 'dependencyMutationCount'])('reports zero %s', field => expect(diagnostic[field]).toBe(0));
  it.each(['physicalStitchesGenerated', 'physicalUnderlayGenerated', 'jumpCommandsGenerated', 'trimCommandsGenerated', 'colorChangeCommandsGenerated', 'canonicalCommandsGenerated', 'machineAdaptationApplied', 'encodingApplied'])('reports %s false', field => expect(diagnostic[field]).toBe(false));
  it('reports estimated rather than physical travel', () => expect(diagnostic.estimatedTravelMm).toBe(sequencePlan.summary.estimatedTravelMm));
  it('returns frozen diagnostics', () => expect(Object.isFrozen(diagnostic)).toBe(true));
});
