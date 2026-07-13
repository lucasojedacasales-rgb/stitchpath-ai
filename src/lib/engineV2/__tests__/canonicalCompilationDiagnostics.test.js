import { beforeAll, describe, expect, it } from 'vitest';
import { createCanonicalCompilationDiagnostic } from '../commandCompilation/canonicalCompilationDiagnostics.js';
import { createGenericMascotCommandFixture } from '../fixtures/genericMascotCommandFixture.js';

let fixture; let diagnostic;
beforeAll(() => { fixture = createGenericMascotCommandFixture(); diagnostic = createCanonicalCompilationDiagnostic({ ...fixture, canonicalCompilation: fixture.canonicalCompilation }); });

describe('Phase 10 canonical compilation diagnostics', () => {
  it('reports a valid canonical stream', () => expect(diagnostic.valid).toBe(true));
  it('reports seven compiled objects', () => expect(diagnostic.compiledObjectCount).toBe(7));
  it('reports complete disposition coverage', () => expect(diagnostic.canonicalDispositionCoveragePercent).toBe(100));
  it('reports no silent object drops', () => expect(diagnostic.silentScheduledObjectDropCount).toBe(0));
  it('reports all command types', () => expect(diagnostic.commandTypeDistribution).toEqual(expect.objectContaining({ stitch: 1510, jump: 18, trim: 17, colorChange: 4, end: 1 })));
  it('reports every physical source stitch', () => expect(diagnostic.physicalSourceStitchCommandCount).toBe(diagnostic.physicalStitchMovementCount));
  it('reports connector stitches separately', () => expect(diagnostic.connectorStitchCommandCount).toBe(140));
  it('reports full physical movement coverage', () => expect(diagnostic.physicalStitchMovementCoveragePercent).toBe(100));
  it('reports full physical point reachability', () => expect(diagnostic.physicalPointReachabilityCoveragePercent).toBe(100));
  it('reports full discontinuity coverage', () => expect(diagnostic.discontinuityClassificationCoveragePercent).toBe(100));
  it('reports classification distribution', () => expect(diagnostic.discontinuityClassificationDistribution).toEqual({ safe_connector_stitch: 140, jump_with_trim: 11, jump_without_trim: 0, zero_distance_continuation: 8 }));
  it('reports full thread-block coverage', () => expect(diagnostic.threadBlockCompilationCoveragePercent).toBe(100));
  it('reports no zero-length stitches', () => expect(diagnostic.zeroLengthStitchCommandCount).toBe(0));
  it('reports no zero-distance jumps', () => expect(diagnostic.zeroDistanceJumpCommandCount).toBe(0));
  it('reports no duplicate adjacent trims', () => expect(diagnostic.adjacentDuplicateTrimCount).toBe(0));
  it('reports no duplicate adjacent color changes', () => expect(diagnostic.adjacentDuplicateColorChangeCount).toBe(0));
  it('reports no commands after end', () => expect(diagnostic.commandsAfterEndCount).toBe(0));
  it('reports absolute coordinate bounds', () => expect(diagnostic.coordinateBounds).toEqual(expect.objectContaining({ width: 30, height: 35 })));
  it('reports physical source length', () => expect(diagnostic.physicalSourceStitchLengthMm).toBeCloseTo(fixture.physicalPlan.summary.totalGeneratedStitchLengthMm));
  it('reports positive connector and jump lengths', () => { expect(diagnostic.connectorStitchLengthMm).toBeGreaterThan(0); expect(diagnostic.jumpLengthMm).toBeGreaterThan(0); });
  it('reports no input mutations', () => expect([diagnostic.selectedCandidateMutationsDetected, diagnostic.objectMutationsDetected, diagnostic.technicalSpecificationMutationsDetected, diagnostic.sequencePlanMutationsDetected, diagnostic.physicalPlanMutationsDetected, diagnostic.threadBlockMutationsDetected]).toEqual([false, false, false, false, false, false]));
  it('reports canonical commands without machine or encoding', () => expect([diagnostic.canonicalCommandsGenerated, diagnostic.machineAdaptationApplied, diagnostic.encodingApplied]).toEqual([true, false, false]));
  it('is deterministic', () => expect(createCanonicalCompilationDiagnostic({ ...fixture, canonicalCompilation: fixture.canonicalCompilation })).toEqual(diagnostic));
});
