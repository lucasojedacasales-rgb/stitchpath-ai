import { describe, expect, it } from 'vitest';
import { createThreadResolutionDiagnostic, materializeThreadedEmbroideryObjects } from '../index.js';
import { createFinalObjectMaterializationFixture } from '../fixtures/finalObjectMaterializationFixture.js';

function diagnostic() {
  const fixture = createFinalObjectMaterializationFixture();
  const threadedObjectMaterialization = materializeThreadedEmbroideryObjects({ regions: fixture.regions, objectDraftMaterialization: fixture.objectDraftMaterialization, threadResolutionConfig: fixture.config });
  return createThreadResolutionDiagnostic({ regions: fixture.regions, objectDraftMaterialization: fixture.objectDraftMaterialization, threadedObjectMaterialization });
}

describe('Phase 6 thread resolution diagnostics', () => {
  it('reports a valid synthetic materialization', () => expect(diagnostic().valid).toBe(true));
  it('reports 100 percent assignment coverage', () => expect(diagnostic().draftThreadAssignmentCoveragePercent).toBe(100));
  it('reports no silent draft drops', () => expect(diagnostic().silentDraftDropCount).toBe(0));
  it('reports no pending thread assignments', () => expect(diagnostic().pendingThreadAssignmentCount).toBe(0));
  it('reports no missing thread IDs', () => expect(diagnostic().missingThreadIdCount).toBe(0));
  it('reports no unknown thread IDs', () => expect(diagnostic().unknownThreadIdCount).toBe(0));
  it('reports no unused thread definitions', () => expect(diagnostic().unusedThreadDefinitionCount).toBe(0));
  it('reports no dependency cycles', () => expect(diagnostic().dependencyCycleCount).toBe(0));
  it.each(['geometryMutationCount', 'holeMutationCount', 'visualColorMutationCount', 'roleMutationCount', 'stitchTypeMutationCount', 'layerMutationCount'])('reports zero %s', field => expect(diagnostic()[field]).toBe(0));
  it('reports no thread blocks', () => expect(diagnostic().threadBlocksCreated).toBe(0));
  it('reports no stitch coordinates', () => expect(diagnostic().stitchCoordinatesGenerated).toBe(false));
  it('reports no canonical commands', () => expect(diagnostic().canonicalCommandsGenerated).toBe(false));
  it('reports no global sequencing', () => expect(diagnostic().globalSequencingApplied).toBe(false));
  it('reports no travel optimization', () => expect(diagnostic().travelOptimizationApplied).toBe(false));
  it('reports no machine adaptation', () => expect(diagnostic().machineAdaptationApplied).toBe(false));
  it('reports no encoding', () => expect(diagnostic().encodingApplied).toBe(false));
  it('reports no input mutation', () => expect(diagnostic().inputMutationsDetected).toBe(false));
  it('matches final object and assigned draft counts', () => { const value = diagnostic(); expect(value.finalObjectCount).toBe(value.assignedDraftCount); });
  it('reports exact artwork threads for the default fixture', () => { const value = diagnostic(); expect(value.exactArtworkThreadCount).toBe(value.threadDefinitionCount); expect(value.catalogThreadCount).toBe(0); });
  it('reports distinct artwork colors', () => expect(diagnostic().uniqueArtworkColorCount).toBeGreaterThan(1));
  it('reports preserved structural dependencies', () => expect(diagnostic().dependencyCount).toBeGreaterThan(0));
});
