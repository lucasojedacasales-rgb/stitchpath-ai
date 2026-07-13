function distribution(items, selector) {
  const result = {};
  items.forEach(item => { const key = selector(item) ?? 'unknown'; result[key] = (result[key] || 0) + 1; });
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

export function createTechnicalPlanningDiagnostic({ regions = [], threadedObjectMaterialization, technicalPlan }) {
  void regions;
  const objects = threadedObjectMaterialization?.objects || []; const specifications = technicalPlan?.specifications || []; const summary = technicalPlan?.summary || {};
  const sourceIds = new Set(objects.map(item => item.id)); const covered = new Set(specifications.filter(item => sourceIds.has(item.objectId)).map(item => item.objectId));
  return {
    valid: technicalPlan?.valid === true,
    sourceFinalObjectCount: objects.length,
    technicalSpecificationCount: specifications.length,
    technicalDispositionCoveragePercent: objects.length ? covered.size / objects.length * 100 : 100,
    silentFinalObjectDropCount: objects.length - covered.size,
    plannedCount: specifications.filter(item => item.status === 'planned').length,
    manualRequiredCount: specifications.filter(item => item.status === 'manual_required').length,
    blockedCount: specifications.filter(item => item.status === 'blocked').length,
    roleDistribution: distribution(specifications, item => item.role),
    stitchTypeDistribution: distribution(specifications, item => item.stitchType),
    materialProfileDistribution: distribution(specifications, item => item.materialProfileId),
    generatorReadyDistribution: distribution(specifications, item => `${item.generatorReadiness.generator}:${item.generatorReadiness.ready ? 'ready' : 'not_ready'}`),
    generatorNotReadyCount: specifications.filter(item => !item.generatorReadiness.ready).length,
    underlayPlanDistribution: distribution(specifications, item => item.underlayPlan.enabled ? item.underlayPlan.sequence.map(component => component.type).join('+') || 'enabled_empty' : 'disabled'),
    fillAngleStrategyDistribution: distribution(specifications, item => item.fillAnglePlan.strategy),
    pullCompensationStrategyDistribution: distribution(specifications, item => item.pullCompensationPlan.strategy),
    entryCandidateCount: specifications.reduce((sum, item) => sum + item.entryCandidates.length, 0),
    exitCandidateCount: specifications.reduce((sum, item) => sum + item.exitCandidates.length, 0),
    rejectedCandidateCount: specifications.reduce((sum, item) => sum + [...item.entryCandidates, ...item.exitCandidates].filter(candidate => !candidate.valid).length, 0),
    invalidGeometryCount: summary.invalidGeometryCount ?? 0,
    incompatibleStitchTypeCount: summary.incompatibleStitchTypeCount ?? 0,
    explicitHoleObjectCount: summary.explicitHoleObjectCount ?? 0,
    duplicateTechnicalSpecificationCount: summary.duplicateTechnicalSpecificationCount ?? 0,
    dependencyCycleCount: summary.dependencyCycleCount ?? 0,
    objectMutationsDetected: technicalPlan?.metadata?.objectMutationsDetected === true,
    geometryMutationCount: summary.geometryMutationCount ?? 0,
    holeMutationCount: summary.holeMutationCount ?? 0,
    visualColorMutationCount: summary.visualColorMutationCount ?? 0,
    threadIdMutationCount: summary.threadIdMutationCount ?? 0,
    roleMutationCount: summary.roleMutationCount ?? 0,
    stitchTypeMutationCount: summary.stitchTypeMutationCount ?? 0,
    layerMutationCount: summary.layerMutationCount ?? 0,
    dependencyMutationCount: summary.dependencyMutationCount ?? 0,
    threadBlocksCreated: technicalPlan?.metadata?.threadBlocksCreated ?? 0,
    physicalStitchesGenerated: technicalPlan?.metadata?.physicalStitchesGenerated === true,
    physicalUnderlayGenerated: technicalPlan?.metadata?.physicalUnderlayGenerated === true,
    finalEntryExitPairSelected: technicalPlan?.metadata?.finalEntryExitPairSelected === true,
    globalSequencingApplied: technicalPlan?.metadata?.globalSequencingApplied === true,
    travelOptimizationApplied: technicalPlan?.metadata?.travelOptimizationApplied === true,
    canonicalCommandsGenerated: technicalPlan?.metadata?.canonicalCommandsGenerated === true,
    machineAdaptationApplied: technicalPlan?.metadata?.machineAdaptationApplied === true,
    encodingApplied: technicalPlan?.metadata?.encodingApplied === true,
    errors: [...(technicalPlan?.errors || [])], warnings: [...(technicalPlan?.warnings || [])],
  };
}
