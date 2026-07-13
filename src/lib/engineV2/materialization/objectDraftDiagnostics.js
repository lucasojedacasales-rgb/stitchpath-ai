import { validateObjectDraftMaterialization } from './objectDraftValidation.js';

function distribution(items, field) {
  return Object.fromEntries([...new Set(items.map(item => item[field]))].sort().map(value => [value, items.filter(item => item[field] === value).length]));
}

export function createObjectDraftMaterializationDiagnostic({ regions = [], proposalPlan, materialization }) {
  const decisions = materialization?.decisions || [];
  const drafts = materialization?.drafts || [];
  const validation = validateObjectDraftMaterialization(materialization, proposalPlan, regions);
  const countAction = action => decisions.filter(item => item.action === action).length;
  const proposalMap = new Map((proposalPlan?.proposals || []).map(item => [item.id, item]));
  return {
    valid: Boolean(materialization?.valid && validation.valid),
    sourceRegionCount: regions.length,
    sourceProposalCount: proposalPlan?.proposals?.length || 0,
    decisionCount: decisions.length,
    proposalDispositionCoveragePercent: materialization?.summary?.proposalDispositionCoveragePercent ?? 0,
    silentProposalDropCount: materialization?.summary?.silentProposalDropCount ?? 0,
    acceptedCount: countAction('accept'), excludedCount: countAction('exclude'), deferredCount: countAction('defer'),
    rejectedCount: countAction('reject'), overriddenCount: countAction('override'), blockedCount: countAction('blocked'),
    materializedDraftCount: drafts.length,
    unmaterializedProposalCount: Math.max(0, (proposalPlan?.proposals?.length || 0) - drafts.length),
    pendingThreadAssignmentCount: drafts.filter(item => item.threadAssignmentStatus === 'pending').length,
    roleDistribution: distribution(drafts, 'role'),
    stitchTypeDistribution: distribution(drafts, 'stitchType'),
    dependencyCount: drafts.reduce((sum, item) => sum + item.dependencyIds.length, 0),
    dependencyCycleCount: validation.dependencyCycleCount,
    missingDependencyCount: validation.errors.filter(item => item.code === 'MISSING_DRAFT_DEPENDENCY' || item.code === 'REQUIRED_DEPENDENCY_NOT_MATERIALIZED').length,
    syntheticOutlineDraftCount: materialization?.summary?.syntheticOutlineDraftCount ?? 0,
    disconnectedRegionMergeCount: drafts.filter(item => Array.isArray(item.sourceRegionIds) && item.sourceRegionIds.length > 1).length,
    geometryMutationCount: drafts.filter(item => JSON.stringify(item.geometryMm) !== JSON.stringify(proposalMap.get(item.proposalId)?.geometryMm)).length,
    holeMutationCount: drafts.filter(item => JSON.stringify(item.holesMm) !== JSON.stringify(proposalMap.get(item.proposalId)?.holesMm)).length,
    visualColorMutationCount: drafts.filter(item => JSON.stringify(item.visualColor) !== JSON.stringify(proposalMap.get(item.proposalId)?.visualColor)).length,
    threadIdsAssigned: drafts.some(item => Object.hasOwn(item, 'threadId')),
    threadDefinitionsCreated: Object.hasOwn(materialization || {}, 'threadDefinitions') || Object.hasOwn(materialization || {}, 'threads'),
    threadBlocksCreated: Object.hasOwn(materialization || {}, 'threadBlocks'),
    stitchCoordinatesGenerated: drafts.some(item => Object.hasOwn(item, 'stitches') || Object.hasOwn(item, 'stitchCoordinates')),
    canonicalCommandsGenerated: Object.hasOwn(materialization || {}, 'commands') || Object.hasOwn(materialization || {}, 'canonicalCommands'),
    machineAdaptationApplied: Object.hasOwn(materialization || {}, 'machineProfile'),
    inputMutationsDetected: materialization?.metadata?.inputMutationsDetected === true,
    errors: [...(materialization?.errors || []), ...validation.errors],
    warnings: [...(materialization?.warnings || []), ...validation.warnings],
  };
}
