import { beforeAll, describe, expect, it } from 'vitest';
import { buildEngineV2DSTExport } from '../formatAdaptation/dstExportPipeline.js';
import { createDSTBlockingFixture } from '../fixtures/dstBlockingFixture.js';
import { createGenericMascotDSTFixture } from '../fixtures/genericMascotDSTFixture.js';

describe('Phase 12B disconnected DST export pipeline', () => {
  let fixture; let result;
  beforeAll(() => { fixture = createGenericMascotDSTFixture(); result = fixture.dstExport; });
  it('accepts generic mascot', () => expect(result.valid).toBe(true));
  it('keeps source stream immutable', () => expect(result.summary.sourceStreamMutationCount).toBe(0));
  it('maps all 1550 source commands', () => expect(result.adaptation.dispositions).toHaveLength(1550));
  it('adapts 1510 stitches', () => expect(result.summary.adapterStitchCommandCount).toBe(1510));
  it('accounts for all source jumps', () => expect(result.summary.sourceJumpCommandCount).toBe(18));
  it('uses explicit zero output once', () => expect(result.summary.zeroJumpNoOutputCount).toBe(1));
  it('preserves seventeen trim commands', () => expect(result.summary.adapterTrimCommandCount).toBe(17));
  it('preserves four color changes', () => expect(result.summary.adapterColorChangeCount).toBe(4));
  it('preserves one final END', () => expect(result.summary.adapterEndCommandCount).toBe(1));
  it('verifies exact endpoint', () => expect(result.summary.exactFinalEndpointVerified).toBe(true));
  it('has no silent binary lineage drop', () => expect(result.summary.silentBinaryLineageDropCount).toBe(0));
  it('returns immutable acceptance result', () => expect(Object.isFrozen(result.binary)).toBe(true));
  it('does not connect application', () => expect(result.metadata.applicationConnected).toBe(false));
  it('does not invoke DSB', () => expect(result.metadata.DSBEncoderInvoked).toBe(false));
  it('does not invoke Base44', () => expect(result.metadata.Base44Invoked).toBe(false));
  it('produces nonempty binary', () => expect(result.binary.byteLength).toBeGreaterThan(512));
  it.each(['invalid_resolution', 'missing_end', 'duplicate_end', 'command_after_end', 'inconsistent_delta', 'unknown_thread'])('rejects %s without binary invocation', kind => { const blocked = buildEngineV2DSTExport({ machineAdaptedStream: createDSTBlockingFixture(kind) }); expect(blocked.valid).toBe(false); expect(blocked.binary).toBeNull(); expect(blocked.metadata.DSTEncoderInvoked).toBe(false); });
  it('uses stable filename', () => expect(result.filename).toBe('GENERIC_MASCOT.dst'));
  it('uses octet-stream MIME', () => expect(result.mimeType).toBe('application/octet-stream'));
});
