const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function dependencyCycleCount(objects) {
  const byId = new Map(objects.map(item => [item.id, item]));
  const visiting = new Set();
  const visited = new Set();
  let count = 0;
  const visit = id => {
    if (visiting.has(id)) { count += 1; return; }
    if (visited.has(id)) return;
    visiting.add(id);
    (byId.get(id)?.dependencyIds || []).filter(dependency => byId.has(dependency)).forEach(visit);
    visiting.delete(id);
    visited.add(id);
  };
  objects.forEach(item => visit(item.id));
  return count;
}

export function createThreadResolutionDiagnostic({ regions = [], objectDraftMaterialization, threadedObjectMaterialization }) {
  const drafts = objectDraftMaterialization?.drafts || [];
  const result = threadedObjectMaterialization || {};
  const assignments = result.assignments || [];
  const objects = result.objects || [];
  const threads = result.threads || [];
  const draftMap = new Map(drafts.map(item => [item.id, item]));
  const regionIds = new Set(regions.map(item => item.id));
  const threadIds = new Set(threads.map(item => item.id));
  const usedThreadIds = new Set(objects.map(item => item.threadId));
  const normalizedColors = new Set(assignments.map(item => item.normalizedVisualColor).filter(Boolean));
  const mutationCount = field => objects.filter(object => {
    const draft = draftMap.get(object.source?.draftId);
    return draft && !same(object[field], draft[field === 'geometry' ? 'geometryMm' : field === 'holes' ? 'holesMm' : field]);
  }).length;
  const pendingThreadAssignmentCount = objects.filter(item => item.parameters?.deferred?.threadAssignment !== false).length;
  return {
    valid: result.valid === true,
    sourceDraftCount: drafts.length,
    assignmentCount: assignments.length,
    draftThreadAssignmentCoveragePercent: result.summary?.draftThreadAssignmentCoveragePercent ?? (drafts.length ? assignments.length / drafts.length * 100 : 100),
    silentDraftDropCount: result.summary?.silentDraftDropCount ?? Math.max(0, drafts.length - assignments.length),
    assignedDraftCount: assignments.filter(item => item.status === 'assigned').length,
    blockedDraftCount: assignments.filter(item => item.status === 'blocked').length,
    finalObjectCount: objects.length,
    threadDefinitionCount: threads.length,
    exactArtworkThreadCount: result.summary?.exactArtworkThreadCount ?? 0,
    catalogThreadCount: result.summary?.catalogThreadCount ?? 0,
    uniqueArtworkColorCount: normalizedColors.size,
    sharedIdenticalColorCount: result.summary?.sharedIdenticalColorCount ?? 0,
    paletteConsolidationCount: result.summary?.paletteConsolidationCount ?? 0,
    exactMatchCount: result.summary?.exactMatchCount ?? 0,
    approximateMatchCount: result.summary?.approximateMatchCount ?? 0,
    invalidArtworkColorCount: result.summary?.invalidArtworkColorCount ?? 0,
    noCatalogMatchCount: result.summary?.noCatalogMatchCount ?? 0,
    outOfToleranceCount: result.summary?.outOfToleranceCount ?? 0,
    pendingThreadAssignmentCount,
    missingThreadIdCount: objects.filter(item => !item.threadId).length,
    unknownThreadIdCount: objects.filter(item => item.threadId && !threadIds.has(item.threadId)).length,
    unusedThreadDefinitionCount: threads.filter(item => !usedThreadIds.has(item.id)).length,
    dependencyCount: objects.reduce((sum, item) => sum + (item.dependencyIds?.length || 0), 0),
    dependencyCycleCount: dependencyCycleCount(objects),
    geometryMutationCount: mutationCount('geometry'),
    holeMutationCount: mutationCount('holes'),
    visualColorMutationCount: mutationCount('visualColor'),
    roleMutationCount: mutationCount('role'),
    stitchTypeMutationCount: mutationCount('stitchType'),
    layerMutationCount: mutationCount('layer'),
    threadBlocksCreated: Array.isArray(result.threadBlocks) ? result.threadBlocks.length : 0,
    stitchCoordinatesGenerated: objects.some(item => Object.hasOwn(item, 'stitches') || Object.hasOwn(item, 'stitchCoordinates')),
    canonicalCommandsGenerated: Array.isArray(result.commands) || Array.isArray(result.canonicalCommands),
    globalSequencingApplied: result.metadata?.globalSequencingApplied === true,
    travelOptimizationApplied: result.metadata?.travelOptimizationApplied === true,
    machineAdaptationApplied: result.metadata?.machineAdaptationApplied === true,
    encodingApplied: result.metadata?.encodingApplied === true,
    inputMutationsDetected: result.metadata?.inputMutationsDetected === true,
    unknownRegionReferenceCount: objects.filter(item => !regionIds.has(item.regionId)).length,
    errors: [...(result.errors || [])],
    warnings: [...(result.warnings || [])],
  };
}
