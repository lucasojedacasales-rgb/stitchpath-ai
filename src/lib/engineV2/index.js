export {
  ALLOWED_COMMAND_TYPES,
  ALLOWED_EMBROIDERY_ROLES,
  ALLOWED_STITCH_TYPES,
  createCanonicalCommandV2,
  createEmbroideryObjectV2,
  createEngineDocumentV2,
  createRegionV2,
  createThreadBlockV2,
  createThreadDefinitionV2,
} from './model.js';

export {
  isEngineV2Enabled,
  resolveEngineV2Config,
} from './engineV2Config.js';

export {
  validateCanonicalCommandV2,
  validateEmbroideryObjectV2,
  validateEngineDocumentV2,
  validateRegionV2,
  validateThreadBlockV2,
  validateThreadDefinitionV2,
} from './modelValidation.js';

export { createEngineV2FoundationDiagnostic } from './diagnostics.js';

export {
  DEFAULT_GEOMETRY_TOLERANCES,
  canonicalizeHoles,
  canonicalizePolygon,
  isPointInPolygon,
  polygonArea,
  polygonBounds,
  polygonCentroid,
  polygonContainsPolygon,
  polygonSignedArea,
  polygonsOverlap,
  polygonsTouch,
} from './ingestion/geometryCanonicalization.js';

export { adaptV1RegionToRegionV2, adaptV1RegionsToRegionV2 } from './ingestion/v1RegionAdapter.js';
export { ingestRegionsV2, ingestV1RegionsToRegionGraphV2 } from './ingestion/regionIngestion.js';
export { createRegionIngestionDiagnostic } from './ingestion/ingestionDiagnostics.js';

export {
  buildRegionGraphV2,
  getConnectedComponent,
  getRegionAncestors,
  getRegionDescendants,
} from './topology/regionGraph.js';

export { validateRegionGraphV2 } from './topology/regionGraphValidation.js';
export {
  REGION_RELATIONS,
  analyzeAllRegionRelations,
  analyzeRegionRelation,
  polygonsHaveEqualGeometry,
} from './topology/regionRelations.js';
