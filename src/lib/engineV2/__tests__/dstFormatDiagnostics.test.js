import { beforeAll, describe, expect, it } from 'vitest';
import { createDSTFormatDiagnostic } from '../formatAdaptation/dstFormatDiagnostics.js';
import { createGenericMascotDSTFixture } from '../fixtures/genericMascotDSTFixture.js';

describe('Phase 12B DST diagnostics', () => {
  let fixture; let diagnostic;
  beforeAll(() => { fixture = createGenericMascotDSTFixture(); diagnostic = createDSTFormatDiagnostic({ machineAdaptedStream: fixture.machineAdaptedStream, exportResult: fixture.dstExport }); });
  it('is valid', () => expect(diagnostic.valid).toBe(true));
  it('reports 1550 sources', () => expect(diagnostic.sourceMachineCommandCount).toBe(1550));
  it('reports complete source coverage', () => expect(diagnostic.sourceCommandDispositionCoveragePercent).toBe(100));
  it('reports no silent source drops', () => expect(diagnostic.silentSourceCommandDropCount).toBe(0));
  it('reports bounded adapter deltas', () => expect(diagnostic.maximumAdapterDeltaUnits).toBeLessThanOrEqual(121));
  it('reports one zero jump', () => expect(diagnostic.zeroDeltaJumpCount).toBe(1));
  it('reports one zero-output jump', () => expect(diagnostic.zeroJumpNoOutputCount).toBe(1));
  it('reports 51 trim records', () => expect(diagnostic.trimBinaryRecordCount).toBe(51));
  it('reports four STOP records', () => expect(diagnostic.binarySTOPRecordCount).toBe(4));
  it('reports one END', () => expect(diagnostic.binaryENDRecordCount).toBe(1));
  it('reports EOF', () => expect(diagnostic.finalEOFPresent).toBe(true));
  it('reports deterministic roundtrip', () => { expect(diagnostic.parserRoundtripPassed).toBe(true); expect(diagnostic.deterministicBytesVerified).toBe(true); });
  it('reports no forbidden invocation', () => { expect(diagnostic.DSBInvoked).toBe(false); expect(diagnostic.Base44Invoked).toBe(false); });
  it('reports existing DST encoder invocation', () => expect(diagnostic.DSTEncoderInvoked).toBe(true));
  it('reports generated binary', () => expect(diagnostic.binaryOutputGenerated).toBe(true));
});

