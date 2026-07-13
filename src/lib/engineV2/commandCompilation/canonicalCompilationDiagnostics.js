import { distanceBetweenPoints } from '../stitchGeneration/stitchGeometry.js';
import { validateCanonicalCommandCompilationV2 } from './canonicalCompilationValidation.js';

function pathLengths(commands) {
  let current = null; let initialSeen = false; const result = { commandTravelLengthMm: 0, physicalSourceStitchLengthMm: 0, connectorStitchLengthMm: 0, jumpLengthMm: 0 };
  commands.forEach(command => {
    if (command.type !== 'stitch' && command.type !== 'jump') return;
    if (command.reasonCode === 'INITIAL_POSITIONING' && !initialSeen) { current = command; initialSeen = true; return; }
    if (current) {
      const length = distanceBetweenPoints(current, command); result.commandTravelLengthMm += length;
      if (command.type === 'jump') result.jumpLengthMm += length;
      if (command.reasonCode === 'PHYSICAL_SOURCE_STITCH') result.physicalSourceStitchLengthMm += length;
      if (command.reasonCode === 'SAFE_SUBPATH_CONNECTOR') result.connectorStitchLengthMm += length;
    }
    current = command;
  });
  return result;
}

function bounds(commands) {
  const points = commands.filter(item => ['stitch', 'jump'].includes(item.type) && Number.isFinite(item.x) && Number.isFinite(item.y));
  if (!points.length) return null;
  const xs = points.map(item => item.x); const ys = points.map(item => item.y); const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function createCanonicalCompilationDiagnostic({ regions = [], threadedObjectMaterialization, technicalPlan, sequencePlan, physicalPlan, canonicalCompilation }) {
  void regions; const summary = canonicalCompilation?.summary || {}; const metadata = canonicalCompilation?.metadata || {}; const commands = canonicalCompilation?.commands || [];
  const validation = validateCanonicalCommandCompilationV2(canonicalCompilation, threadedObjectMaterialization, technicalPlan, sequencePlan, physicalPlan);
  const typeDistribution = Object.fromEntries(['stitch', 'jump', 'trim', 'colorChange', 'end'].map(type => [type, commands.filter(item => item.type === type).length]));
  const classificationDistribution = Object.fromEntries(['safe_connector_stitch', 'jump_with_trim', 'jump_without_trim', 'zero_distance_continuation'].map(type => [type, (canonicalCompilation?.discontinuityClassifications || []).filter(item => item.classification === type).length]));
  const zeroLength = commands.filter((command, index) => command.type === 'stitch' && index > 0 && (() => { const prior = [...commands.slice(0, index)].reverse().find(item => item.type === 'stitch' || item.type === 'jump'); return prior && distanceBetweenPoints(prior, command) <= canonicalCompilation.config.comparisonToleranceMm; })()).length;
  const zeroJumps = commands.filter((command, index) => command.type === 'jump' && command.reasonCode !== 'INITIAL_POSITIONING' && (() => { const prior = [...commands.slice(0, index)].reverse().find(item => item.type === 'stitch' || item.type === 'jump'); return prior && distanceBetweenPoints(prior, command) <= canonicalCompilation.config.comparisonToleranceMm; })()).length;
  const adjacent = type => commands.slice(1).filter((item, index) => item.type === type && commands[index].type === type).length; const endIndex = commands.findIndex(item => item.type === 'end');
  return Object.freeze({
    valid: canonicalCompilation?.valid === true && validation.valid, sourceScheduledObjectCount: summary.sourceScheduledObjectCount ?? 0,
    compiledObjectCount: summary.compiledObjectCount ?? 0, canonicalDispositionCoveragePercent: summary.canonicalDispositionCoveragePercent ?? 0, silentScheduledObjectDropCount: summary.silentScheduledObjectDropCount ?? 0,
    commandCount: commands.length, commandTypeDistribution: typeDistribution, physicalStitchMovementCount: summary.physicalStitchMovementCount ?? 0,
    physicalSourceStitchCommandCount: summary.physicalSourceStitchCommandCount ?? 0, connectorStitchCommandCount: summary.connectorStitchCommandCount ?? 0, physicalStitchMovementCoveragePercent: summary.physicalStitchMovementCoveragePercent ?? 0,
    physicalPointCount: summary.physicalPointCount ?? 0, reachablePhysicalPointCount: summary.reachablePhysicalPointCount ?? 0, physicalPointReachabilityCoveragePercent: summary.physicalPointReachabilityCoveragePercent ?? 0,
    physicalDiscontinuityCount: summary.physicalDiscontinuityCount ?? 0, classifiedDiscontinuityCount: summary.classifiedDiscontinuityCount ?? 0, discontinuityClassificationDistribution: classificationDistribution, discontinuityClassificationCoveragePercent: summary.discontinuityClassificationCoveragePercent ?? 0,
    sourceThreadBlockCount: summary.sourceThreadBlockCount ?? 0, compiledThreadBlockCount: summary.compiledThreadBlockCount ?? 0, threadBlockCompilationCoveragePercent: summary.threadBlockCompilationCoveragePercent ?? 0,
    jumpCommandCount: typeDistribution.jump, trimCommandCount: typeDistribution.trim, colorChangeCommandCount: typeDistribution.colorChange, endCommandCount: typeDistribution.end,
    zeroLengthStitchCommandCount: zeroLength, zeroDistanceJumpCommandCount: zeroJumps, adjacentDuplicateTrimCount: adjacent('trim'), adjacentDuplicateColorChangeCount: adjacent('colorChange'), commandsAfterEndCount: endIndex < 0 ? 0 : commands.length - endIndex - 1,
    coordinateBounds: bounds(commands), ...pathLengths(commands),
    selectedCandidateMutationsDetected: (metadata.selectedCandidateIdentityMutationCount ?? 0) > 0, objectMutationsDetected: (metadata.objectMutationCount ?? 0) > 0,
    technicalSpecificationMutationsDetected: (metadata.technicalSpecificationMutationCount ?? 0) > 0, sequencePlanMutationsDetected: (metadata.sequencePlanMutationCount ?? 0) > 0,
    physicalPlanMutationsDetected: (metadata.physicalPlanMutationCount ?? 0) > 0, threadBlockMutationsDetected: (metadata.threadBlockMutationCount ?? 0) > 0,
    commandCoordinateMutationCount: summary.commandCoordinateMutationCount ?? 0, machineCoordinateTransformCount: summary.machineCoordinateTransformCount ?? 0, movementSplitCount: summary.movementSplitCount ?? 0,
    canonicalCommandsGenerated: metadata.canonicalCommandsGenerated === true, machineAdaptationApplied: metadata.machineAdaptationAdded === true, encodingApplied: metadata.encodingAdded === true,
    errors: Object.freeze([...(canonicalCompilation?.errors || []), ...validation.errors]), warnings: Object.freeze([...(canonicalCompilation?.warnings || []), ...validation.warnings]),
  });
}
