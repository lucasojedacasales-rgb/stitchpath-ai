import { getRegionAncestors } from '../topology/regionGraph.js';

function allRejectedErrors(ingestionResult) {
  return (ingestionResult?.rejected || []).flatMap(item => item.errors || []);
}

function countCode(errors, code) {
  return errors.filter(item => item.code === code).length;
}

export function createRegionIngestionDiagnostic(ingestionResult, graph = ingestionResult?.graph) {
  const rejectionErrors = allRejectedErrors(ingestionResult);
  const graphErrors = ingestionResult?.graphValidation?.errors || [];
  const errors = [...rejectionErrors.filter(item => item.code !== 'HIDDEN_REGION_SKIPPED'), ...graphErrors].map(item => ({ ...item }));
  const warnings = [
    ...(ingestionResult?.warnings || []),
    ...rejectionErrors.filter(item => item.code === 'HIDDEN_REGION_SKIPPED'),
    ...(ingestionResult?.graphValidation?.warnings || []),
  ].map(item => ({ ...item }));
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const regions = Array.isArray(ingestionResult?.regions) ? ingestionResult.regions : [];
  const componentByColor = new Map();
  regions.forEach(region => {
    const color = JSON.stringify(region.visualColor);
    const components = componentByColor.get(color) || new Set();
    const componentId = graph?.nodes?.[region.id]?.disconnectedComponentId;
    if (componentId) components.add(componentId);
    componentByColor.set(color, components);
  });
  let disconnectedSameColorRegionCount = 0;
  componentByColor.forEach((components, color) => {
    if (components.size > 1) disconnectedSameColorRegionCount += regions.filter(region => JSON.stringify(region.visualColor) === color).length;
  });
  const nestingDepths = (graph?.regionIds || []).map(regionId => getRegionAncestors(graph, regionId).length);
  return {
    valid: errors.length === 0,
    sourceRegionCount: ingestionResult?.sourceCount || 0,
    acceptedRegionCount: ingestionResult?.acceptedCount || 0,
    rejectedRegionCount: ingestionResult?.rejectedCount || 0,
    duplicateIdCount: countCode(rejectionErrors, 'DUPLICATE_REGION_ID'),
    missingIdCount: countCode(rejectionErrors, 'MISSING_REGION_ID'),
    invalidGeometryCount: rejectionErrors.filter(item => [
      'MISSING_GEOMETRY',
      'TOO_FEW_UNIQUE_POINTS',
      'DEGENERATE_POLYGON',
      'INVALID_POLYGON',
      'NON_FINITE_COORDINATE',
      'SELF_INTERSECTION',
      'COORDINATE_OUT_OF_RANGE',
    ].includes(item.code)).length,
    selfIntersectionCount: countCode(rejectionErrors, 'SELF_INTERSECTION'),
    outOfRangeCoordinateCount: countCode(rejectionErrors, 'COORDINATE_OUT_OF_RANGE'),
    rootRegionCount: graph?.rootIds?.length || 0,
    nestedRegionCount: (graph?.regionIds || []).filter(regionId => graph.nodes?.[regionId]?.parentId).length,
    maximumNestingDepth: nestingDepths.length ? Math.max(...nestingDepths) : 0,
    containmentEdgeCount: edges.filter(edge => edge.relation === 'contains').length,
    overlapEdgeCount: edges.filter(edge => edge.relation === 'overlaps').length,
    touchingEdgeCount: edges.filter(edge => edge.relation === 'touches').length,
    disconnectedComponentCount: graph?.componentIds?.length || 0,
    disconnectedSameColorRegionCount,
    explicitHoleCount: regions.reduce((sum, region) => sum + (Array.isArray(region.holes) ? region.holes.length : 0), 0),
    inferredHoleCount: 0,
    equalGeometryCandidateCount: graph?.metadata?.equalGeometryCandidates?.length || 0,
    mutationsDetected: ingestionResult?.mutationsDetected === true,
    errors,
    warnings,
  };
}
