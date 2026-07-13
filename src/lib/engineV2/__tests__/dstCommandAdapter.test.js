import { describe, expect, it } from 'vitest';
import { adaptMachineCommandStreamToDST } from '../formatAdaptation/dstCommandAdapter.js';
import { createDSTBoundaryMovementFixture } from '../fixtures/dstBoundaryMovementFixture.js';
import { createDSTBlockingFixture } from '../fixtures/dstBlockingFixture.js';
import { createDSTColorSequenceFixture } from '../fixtures/dstColorSequenceFixture.js';
import { createDSTLongJumpFixture } from '../fixtures/dstLongJumpFixture.js';
import { createDSTTrimExpansionFixture } from '../fixtures/dstTrimExpansionFixture.js';
import { createDSTZeroMovementFixture } from '../fixtures/dstZeroMovementFixture.js';

describe('Phase 12B DST command adapter', () => {
  it.each(Array.from({ length: 30 }, (_, index) => index - 15).filter(Boolean))('adapts bounded stitch delta %i', delta => {
    const adaptation = adaptMachineCommandStreamToDST(createDSTBoundaryMovementFixture({ type: 'stitch', dxUnits: delta, dyUnits: -delta }));
    expect(adaptation.valid).toBe(true); expect(adaptation.encoderCommands[0]).toMatchObject({ type: 'stitch', x: delta / 10, y: -delta / 10, color: 'thread:synthetic:one' });
  });
  it.each(['stitch', 'jump'])('preserves movement type %s', type => expect(adaptMachineCommandStreamToDST(createDSTBoundaryMovementFixture({ type })).encoderCommands[0].type).toBe(type));
  it('splits 350-unit jump before encoder', () => { const result = adaptMachineCommandStreamToDST(createDSTLongJumpFixture()); expect(result.encoderCommands.filter(command => command.type === 'jump')).toHaveLength(3); expect(result.summary.maximumAdapterDeltaUnits).toBeLessThanOrEqual(121); });
  it('preserves exact split endpoint', () => expect(adaptMachineCommandStreamToDST(createDSTLongJumpFixture()).encoderCommands.filter(command => command.type === 'jump').at(-1).x).toBe(35));
  it('encodes zero stitch penetration', () => { const result = adaptMachineCommandStreamToDST(createDSTZeroMovementFixture('stitch')); expect(result.dispositions[0]).toMatchObject({ status: 'adapted', reasonCode: 'ENCODED_ZERO_DELTA_PENETRATION' }); expect(result.summary.encodedZeroDeltaPenetrationCount).toBe(1); });
  it('blocks zero stitch under block policy', () => expect(adaptMachineCommandStreamToDST(createDSTZeroMovementFixture('stitch'), { zeroDeltaStitchPolicy: 'block' }).valid).toBe(false));
  it('gives zero jump explicit no-output lineage', () => { const result = adaptMachineCommandStreamToDST(createDSTZeroMovementFixture('jump')); expect(result.dispositions[0]).toMatchObject({ status: 'zero_output', reasonCode: 'ZERO_DISTANCE_JUMP_NO_BINARY_RECORD', dstCommandCount: 0 }); });
  it('blocks zero jump under block policy', () => expect(adaptMachineCommandStreamToDST(createDSTZeroMovementFixture('jump'), { zeroDeltaJumpPolicy: 'block' }).valid).toBe(false));
  it.each([1, 2, 5, 17])('preserves %i trim commands without pre-expansion', trimCount => { const result = adaptMachineCommandStreamToDST(createDSTTrimExpansionFixture(trimCount)); expect(result.encoderCommands.filter(command => command.type === 'trim')).toHaveLength(trimCount); expect(result.summary.expectedTrimBinaryRecordCount).toBe(trimCount * 3); });
  it('blocks trim under block policy', () => expect(adaptMachineCommandStreamToDST(createDSTTrimExpansionFixture(), { trimPolicy: 'block' }).valid).toBe(false));
  it('preserves four color changes', () => expect(adaptMachineCommandStreamToDST(createDSTColorSequenceFixture()).summary.adapterColorChangeCount).toBe(4));
  it('uses five implicit/explicit thread blocks', () => expect(adaptMachineCommandStreamToDST(createDSTColorSequenceFixture()).headerMetadata.expectedThreadBlockCount).toBe(5));
  it.each(['invalid_resolution', 'missing_end', 'duplicate_end', 'command_after_end', 'inconsistent_delta', 'unknown_thread'])('transactionally blocks %s', kind => { const result = adaptMachineCommandStreamToDST(createDSTBlockingFixture(kind)); expect(result.valid).toBe(false); expect(result.encoderCommands).toHaveLength(0); expect(result.dispositions.every(item => item.status === 'blocked')).toBe(true); });
  it('does not mutate source', () => { const source = createDSTLongJumpFixture(); const before = JSON.stringify(source); adaptMachineCommandStreamToDST(source); expect(JSON.stringify(source)).toBe(before); });
  it('covers every source command', () => { const source = createDSTColorSequenceFixture(); const result = adaptMachineCommandStreamToDST(source); expect(result.dispositions).toHaveLength(source.commands.length); expect(result.summary.sourceCommandDispositionCoveragePercent).toBe(100); });
});

