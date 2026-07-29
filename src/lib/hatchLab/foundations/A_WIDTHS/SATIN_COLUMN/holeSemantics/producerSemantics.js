/**
 * producerSemantics.js — P1.F0.2 verified provenance of the productive `holes`
 * field. Read-only documentation of source code that was inspected, never
 * imported, never executed. No productive module is imported from here.
 *
 * Verified by direct source inspection of src/lib/regionBuilder.js (read-only):
 *
 *   function estimateHoles(region, allRegions) {         // ~line 205
 *     if (!allRegions?.length) return 0;
 *     const [cx, cy] = region.centroid || [0.5, 0.5];
 *     const myArea   = region.area_mm2 || 1;
 *     let holes = 0;
 *     for (const other of allRegions) {
 *       if (other.id === region.id || !other.centroid) continue;
 *       const [ox, oy] = other.centroid;
 *       const dist = Math.hypot(ox - cx, oy - cy);
 *       if ((other.area_mm2 || 0) < myArea * 0.12 && dist < 0.15) holes++;
 *     }
 *     return holes;
 *   }
 *
 * The value therefore counts SIBLING REGIONS that are small and centroid-near.
 * It never reads the region's own path_points, no contour hierarchy, no raster
 * mask, no ring topology, no Euler number, no child contours. It cannot express
 * an interior ring and it stores no hole boundary anywhere.
 */

export const HOLE_FIELD_PRODUCER = {
  field: 'holes',
  producerFile: 'src/lib/regionBuilder.js',
  producerFunction: 'estimateHoles',
  producerLines: '203-217',
  calledFrom: 'enrichRegion (src/lib/regionBuilder.js ~line 347) via enrichAllRegions',
  stage: 'region_builder (pipeline stage 6 of PIPELINE_STAGES)',
  valueType: 'number',
  inputUsed: 'sibling regions of the same design: other.id, other.centroid (normalized), other.area_mm2, plus own area_mm2 and centroid',
  formula: 'count(other !== self && other.centroid && other.area_mm2 < 0.12 × self.area_mm2 && hypot(Δcentroid) < 0.15)',
  computedOver: 'sibling_region_metadata',
  computedOverIsTopology: false,
  notComputedOver: ['raster image', 'binary mask', 'contour hierarchy', 'own polygon', 'own path_points', 'connected components', 'interior rings', 'child contours'],
  persistence: 'recomputed on every enrichRegion call and written into the enriched region; no earlier stage produces or preserves a different holes value',
  overwrites: true,
  meaning: 'nearby_small_sibling_region_count',
  meaningPlainText: 'number of OTHER regions in the same design whose area is under 12 % of this region and whose normalized centroid is closer than 0.15 — an inter-region proximity heuristic',
  representsInteriorHoles: false,
  meaningKnown: true,
  meaningConfidence: 'proven_by_source_inspection',
  holeGeometryFields: [],
  holeGeometryPreserved: false,
  consumers: [
    { file: 'src/lib/regionBuilder.js', line: 312, use: 'computeQuality: quality_score penalty of 8 points per unit and an advisory issue string' },
    { file: 'src/lib/stitchIntelligence.js', line: 461, use: 'eiePriority: forces priority 10 for running_stitch when > 0' },
    { file: 'src/components/editor/RegionInspector.jsx', line: 87, use: 'display only ("Agujeros")' },
    { file: 'src/components/editor/IntelligencePanel.jsx', line: 115, use: 'copies the scalar into its geo payload' },
    { file: 'src/lib/hatchLab/bench/extractMetrics.js', lines: '136-148', use: 'sums it into the explicitHoleCount benchmark metric' },
  ],
  consumersUsingHoleGeometry: [],
  searchedAliases: ['holes', 'hole', 'holeCount', 'hole_count', 'explicitHoleCount', 'interiorRing', 'innerContour', 'contourHierarchy', 'hierarchy', 'euler', 'eulerNumber', 'connectedComponents', 'findContours', 'childContours'],
  aliasesFoundInProductiveCode: ['holes', 'explicitHoleCount (hatchLab bench metric only)', 'connectedComponents (unrelated: rawDarkStrokeTest mask components)'],
  warnings: [
    'the field name "holes" does not describe what the producer computes',
    'no productive module stores hole boundaries, so no consumer can sew or knock out an interior ring',
  ],
};

export default HOLE_FIELD_PRODUCER;