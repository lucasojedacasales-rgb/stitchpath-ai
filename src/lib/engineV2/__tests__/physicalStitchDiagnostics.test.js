import { beforeAll, describe, expect, it } from 'vitest';
import { createGenericMascotPhysicalFixture } from '../fixtures/genericMascotPhysicalFixture.js';
import { createPhysicalStitchDiagnostic } from '../stitchGeneration/physicalStitchDiagnostics.js';

let fixture;
let diagnostic;
beforeAll(() => { fixture = createGenericMascotPhysicalFixture(); diagnostic = createPhysicalStitchDiagnostic(fixture); });

describe('Phase 9 physical stitch diagnostics', () => {
  it('reports a valid generic physical plan', () => expect(diagnostic.valid).toBe(true));
  it('reports seven source objects', () => expect(diagnostic.sourceScheduledObjectCount).toBe(7));
  it('reports full physical disposition coverage', () => expect(diagnostic.physicalDispositionCoveragePercent).toBe(100));
  it('reports no silent drops', () => expect(diagnostic.silentScheduledObjectDropCount).toBe(0));
  it('reports generator distribution', () => expect(diagnostic.generatorDistribution).toEqual({ running: 4, tatami: 2, satin: 1 }));
  it('reports physical stitches', () => expect(diagnostic.physicalStitchCount).toBeGreaterThan(0));
  it('reports top and underlay stitch counts', () => expect(diagnostic.topStitchCount + diagnostic.underlayStitchCount).toBe(diagnostic.physicalStitchCount));
  it('reports a positive stitch-length distribution', () => { expect(diagnostic.stitchLengthDistribution.minimumMm).toBeGreaterThan(0); expect(diagnostic.stitchLengthDistribution.maximumMm).toBeGreaterThanOrEqual(diagnostic.stitchLengthDistribution.minimumMm); });
  it('reports no hole-crossing stitches', () => expect(diagnostic.holeCrossingSegmentCount).toBe(0));
  it('reports no invalid outside points', () => expect(diagnostic.invalidOutsidePointCount).toBe(0));
  it('reports selected anchors unchanged', () => expect([diagnostic.entryAnchorMismatchCount, diagnostic.exitAnchorMismatchCount, diagnostic.selectedCandidateIdentityMutationCount]).toEqual([0, 0, 0]));
  it('reports no input mutations', () => expect([diagnostic.objectMutationsDetected, diagnostic.technicalSpecificationMutationsDetected, diagnostic.sequencePlanMutationsDetected, diagnostic.threadBlockMutationsDetected]).toEqual([false, false, false, false]));
  it('reports physical top and underlay generation', () => expect([diagnostic.physicalStitchesGenerated, diagnostic.physicalUnderlayGenerated]).toEqual([true, true]));
  it('reports no command generation', () => expect([diagnostic.canonicalCommandsGenerated, diagnostic.jumpCommandsGenerated, diagnostic.trimCommandsGenerated, diagnostic.colorChangeCommandsGenerated, diagnostic.endCommandsGenerated]).toEqual([false, false, false, false, false]));
  it('reports no machine adaptation or encoding', () => expect([diagnostic.machineAdaptationApplied, diagnostic.encodingApplied]).toEqual([false, false]));
  it('is deterministic', () => expect(createPhysicalStitchDiagnostic(createGenericMascotPhysicalFixture())).toEqual(diagnostic));
});
