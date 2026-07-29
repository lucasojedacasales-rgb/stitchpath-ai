/**
 * measureLabSatinCommands.js — pure metrics + safety diagnostics over a list of
 * lab commands. Nothing is filtered, merged, split or repaired here.
 */

import { LENGTH_LIMITS } from './commandModelSchema.js';

export function measureLabSatinCommands(commands, limits = LENGTH_LIMITS) {
  const lengths = commands.map((c) => c.lengthMm);
  const finiteLengths = lengths.filter((l) => Number.isFinite(l));
  const cross = commands.filter((c) => c.segmentKind === 'cross_column').length;
  const advance = commands.filter((c) => c.segmentKind === 'advance_diagonal').length;

  const zeroLengthCommandCount = commands.filter((c) => c.zeroLength).length;
  const belowMinimumCommandCount = commands.filter((c) => c.belowMinimum).length;
  const aboveMaximumCommandCount = commands.filter((c) => c.aboveMaximum).length;
  const nonFiniteCommandCount = commands.filter((c) => !c.finite).length;

  return {
    commandCount: commands.length,
    crossColumnCommandCount: cross,
    advanceDiagonalCommandCount: advance,
    minimumStitchLengthMm: finiteLengths.length ? Math.min(...finiteLengths) : null,
    maximumStitchLengthMm: finiteLengths.length ? Math.max(...finiteLengths) : null,
    averageStitchLengthMm: finiteLengths.length ? finiteLengths.reduce((a, b) => a + b, 0) / finiteLengths.length : null,
    totalPathLengthMm: finiteLengths.reduce((a, b) => a + b, 0),
    zeroLengthCommandCount,
    belowMinimumCommandCount,
    aboveMaximumCommandCount,
    nonFiniteCommandCount,
    minStitchLengthLimitMm: limits.minStitchLengthMm,
    maxStitchLengthLimitMm: limits.maxStitchLengthMm,
    limitsProvenance: limits.provenance,
    limitsEnforcement: limits.enforcement,
  };
}

/**
 * Safety block. `splitRequired` and `shortStitchHandlingRequired` only REPORT
 * that a future policy would be needed; no policy is implemented in P1.F1.
 */
export function buildLabSatinSafety(metrics, commands) {
  const splitRequired = metrics.aboveMaximumCommandCount > 0;
  const shortStitchHandlingRequired = metrics.belowMinimumCommandCount > 0;
  return {
    splitRequired,
    shortStitchHandlingRequired,
    autoSplitImplemented: false,
    shortStitchFilteringImplemented: false,
    commandsRemoved: 0,
    commandsMerged: 0,
    commandsAdded: 0,
    segmentsNeedingFuturePolicy: commands
      .filter((c) => c.belowMinimum || c.aboveMaximum || c.zeroLength || !c.finite)
      .map((c) => ({
        commandIndex: c.commandIndex,
        segmentKind: c.segmentKind,
        lengthMm: c.lengthMm,
        belowMinimum: c.belowMinimum,
        aboveMaximum: c.aboveMaximum,
        zeroLength: c.zeroLength,
        finite: c.finite,
        futurePolicy: c.aboveMaximum ? 'split_policy' : (c.belowMinimum ? 'short_stitch_policy' : 'geometry_repair_policy'),
      })),
    modelComplete: metrics.zeroLengthCommandCount === 0
      && metrics.nonFiniteCommandCount === 0
      && metrics.aboveMaximumCommandCount === 0
      && metrics.belowMinimumCommandCount === 0,
  };
}