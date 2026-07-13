import { createCanonicalCommandAdaptationSpanV2, createMachineAdaptedCommandStreamV2, createMachineAdaptedCommandV2 } from '../machineAdaptation/machineAdaptedCommandModel.js';
import { createMachineProfileV2, GENERIC_DST_MACHINE_PROFILE } from '../machineAdaptation/machineProfileModel.js';

export function createSyntheticDSBMachineStream(specs = [], options = {}) {
  const profile = createMachineProfileV2({
    ...GENERIC_DST_MACHINE_PROFILE, id: options.profileId || 'synthetic-dsb-format', coordinateResolutionMm: options.resolution ?? 0.1,
    initialMachinePositionUnits: options.initialMachinePositionUnits || { x: 0, y: 0 },
  });
  let x = profile.initialMachinePositionUnits.x; let y = profile.initialMachinePositionUnits.y;
  const commands = specs.map((spec, adaptedIndex) => {
    const dxUnits = spec.dxUnits ?? (spec.xUnits != null ? spec.xUnits - x : 0); const dyUnits = spec.dyUnits ?? (spec.yUnits != null ? spec.yUnits - y : 0);
    if (['stitch', 'jump'].includes(spec.type)) { x = spec.xUnits ?? x + dxUnits; y = spec.yUnits ?? y + dyUnits; }
    const commandX = spec.forceXUnits ?? x; const commandY = spec.forceYUnits ?? y;
    return createMachineAdaptedCommandV2({
      adaptedIndex, type: spec.type, xUnits: commandX, yUnits: commandY, dxUnits, dyUnits,
      xQuantizedMm: commandX * profile.coordinateResolutionMm, yQuantizedMm: commandY * profile.coordinateResolutionMm,
      threadId: spec.threadId === undefined ? 'thread:synthetic:one' : spec.threadId,
      objectId: spec.objectId || 'object:synthetic:one', regionId: spec.regionId || 'region:synthetic:one',
      sourceCanonicalCommandId: `canonical:synthetic-dsb:${String(adaptedIndex).padStart(4, '0')}`,
      sourceCanonicalCommandIndex: adaptedIndex, splitIndex: 0, splitCount: 1, quantizationErrorMm: 0,
      reasonCode: spec.reasonCode || 'SYNTHETIC_DSB_FIXTURE', source: { fixture: options.fixtureId || 'dsb-basic' },
    });
  });
  const spans = commands.map((command, index) => createCanonicalCommandAdaptationSpanV2({
    canonicalCommandId: command.sourceCanonicalCommandId, canonicalCommandIndex: index, status: 'adapted',
    firstAdaptedCommandIndex: index, lastAdaptedCommandIndex: index, adaptedCommandCount: 1, splitApplied: false,
    quantizationApplied: ['stitch', 'jump'].includes(command.type), source: { fixture: options.fixtureId || 'dsb-basic' },
  }));
  return createMachineAdaptedCommandStreamV2({
    machineProfile: profile, sourceCanonicalCommandCount: commands.length, spans, commands, valid: options.valid !== false,
    summary: { canonicalCommandAdaptationCoveragePercent: 100, silentCanonicalCommandDropCount: 0 },
    metadata: { canonicalCompilationMutationCount: 0, syntheticFixture: true },
  });
}

export function createDSBBasicFormatFixture(type = 'stitch') {
  return createSyntheticDSBMachineStream([{ type, dxUnits: 10, dyUnits: -5 }, { type: 'end' }], { fixtureId: `dsb-basic-${type}` });
}
