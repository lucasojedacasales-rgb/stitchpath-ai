import { describe, expect, it } from 'vitest';
import { analyzeSemanticRegionRoles, buildEmbroideryObjectProposalPlan, createObjectPlanningDiagnostic, ingestV1RegionsToRegionGraphV2 } from '../index.js';
import { createEmbroideryPlanningFixture } from '../fixtures/embroideryPlanningFixture.js';

function diagnostic() {
  const ingestion = ingestV1RegionsToRegionGraphV2(createEmbroideryPlanningFixture(), { coordinateSpace: 'normalized' });
  const semanticResult = analyzeSemanticRegionRoles(ingestion.regions, ingestion.graph);
  const plan = buildEmbroideryObjectProposalPlan({ regions: ingestion.regions, graph: ingestion.graph, semanticResult });
  return createObjectPlanningDiagnostic({ regions: ingestion.regions, graph: ingestion.graph, semanticResult, plan });
}

describe('Phase 4 object planning diagnostics', () => {
  it('reports complete decision coverage', () => expect(diagnostic().decisionCoveragePercent).toBe(100));
  it('reports no silent region drops', () => expect(diagnostic().silentRegionDropCount).toBe(0));
  it('reports no synthetic outline proposals', () => expect(diagnostic().syntheticOutlineProposalCount).toBe(0));
  it('reports no dependency cycles', () => expect(diagnostic().dependencyCycleCount).toBe(0));
  it('reports no input mutation', () => expect(diagnostic().inputMutationsDetected).toBe(false));
  it('reports no assigned thread IDs', () => expect(diagnostic().threadIdsAssigned).toBe(false));
  it('reports no generated stitch coordinates', () => expect(diagnostic().stitchCoordinatesGenerated).toBe(false));
  it('reports no canonical commands', () => expect(diagnostic().canonicalCommandsGenerated).toBe(false));
  it('reports no machine adaptation', () => expect(diagnostic().machineAdaptationApplied).toBe(false));
  it('matches source and decision record counts', () => expect(diagnostic().decisionRecordCount).toBe(diagnostic().sourceRegionCount));
});
