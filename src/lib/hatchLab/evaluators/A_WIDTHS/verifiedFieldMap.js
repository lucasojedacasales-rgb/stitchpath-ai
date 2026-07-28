/**
 * verifiedFieldMap.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A)
 *
 * Field map obtained by READ-ONLY inspection of the base engine
 * (regionBuilder.js, adaptiveEngine.js, stitchIntelligence.js, stitchPlanner.js,
 * pipeline/types.js, pipeline/regionNormalize.js, pipeline/stages/*).
 * Nothing here is imported from productive code: these are declarations the
 * evaluator uses to read plain data objects it receives as arguments.
 */

/** Region fields verified in the real engine output (ctx.regions). */
export const VERIFIED_REGION_FIELDS = Object.freeze({
  id: { path: 'region.id', meaning: 'region identifier', unit: null, stage: 'regionNormalize / regionBuilder', stable: true, optional: false, variants: ['auto-generated r_xxxxxxx when absent'], limitations: 'not guaranteed unique across merged sources' },
  name: { path: 'region.name', meaning: 'auto or semantic name', unit: null, stage: 'regionBuilderStage', stable: false, optional: true, variants: ['autoName()', 'semantic label'], limitations: 'never a matching criterion' },
  path_points: { path: 'region.path_points', meaning: 'closed polygon of the fill object', unit: 'normalized 0–1 after regionNormalize', stage: 'contour_engine → region_builder', stable: true, optional: false, variants: ['mm or pixels before normalizeRegionForPipeline'], limitations: 'the space is NOT declared in the object itself' },
  contour_points: { path: 'region.contour_points', meaning: 'polyline of a contour object', unit: 'normalized 0–1', stage: 'contourSafeMode / outlineGenerator', stable: true, optional: true, variants: [], limitations: 'contour objects carry no path_points' },
  centroid: { path: 'region.centroid', meaning: 'centroid [cx, cy]', unit: 'normalized 0–1', stage: 'regionNormalize', stable: true, optional: true, variants: [], limitations: 'recomputed when out of range' },
  area_mm2: { path: 'region.area_mm2', meaning: 'polygon area', unit: 'mm²', stage: 'region_builder', stable: true, optional: true, variants: [], limitations: 'derived from design width/height' },
  perimeter_mm: { path: 'region.perimeter_mm', meaning: 'polygon perimeter', unit: 'mm', stage: 'region_builder', stable: true, optional: true, variants: [], limitations: null },
  stitch_type: { path: 'region.stitch_type', meaning: 'stitching technique', unit: null, stage: 'adaptiveEngine (EIE) or override', stable: true, optional: false, variants: ["'fill'", "'satin'", "'running_stitch'"], limitations: "'fill' means tatami-family fill but the engine never emits the literal 'tatami'" },
  density: { path: 'region.density', meaning: 'row spacing (fill) / column spacing (satin)', unit: 'mm (documented in pipeline/types.js:107 and regionBuilder.js:26)', stage: 'adaptiveEngine', stable: true, optional: true, variants: [], limitations: 'its equivalence with the Hatch "spacing" column is NOT verified' },
  stitch_length_mm: { path: 'region.stitch_length_mm', meaning: 'stitch length', unit: 'mm', stage: 'adaptiveEngine', stable: true, optional: true, variants: [], limitations: null },
  pull_compensation: { path: 'region.pull_compensation', meaning: 'pull compensation', unit: 'mm', stage: 'adaptiveEngine', stable: true, optional: true, variants: [], limitations: '0 is a valid value' },
  angle: { path: 'region.angle', meaning: 'stitch angle', unit: 'degrees [0,180)', stage: 'adaptiveEngine (= fill_angle)', stable: true, optional: true, variants: ['region.fill_angle'], limitations: '0 is a valid value' },
  fill_angle: { path: 'region.fill_angle', meaning: 'same value as region.angle', unit: 'degrees', stage: 'adaptiveEngine', stable: true, optional: true, variants: [], limitations: null },
  recommended_underlay: { path: 'region.recommended_underlay', meaning: '{ enabled, type, density_mm, angle_deg, rationale }', unit: 'mm / degrees', stage: 'adaptiveEngine ← eieUnderlay', stable: true, optional: true, variants: [], limitations: 'carries no underlay LENGTHS; a single combined type, never two' },
  underlay: { path: 'region.underlay', meaning: 'underlay enabled', unit: 'boolean', stage: 'region_builder', stable: true, optional: true, variants: ['boolean in VectorRegion'], limitations: 'true alone says nothing about the type' },
  priority: { path: 'region.priority', meaning: 'layer construction order', unit: '1–10', stage: 'adaptiveEngine', stable: true, optional: true, variants: ['region.layer_order'], limitations: null },
  travelOrder: { path: 'region.travelOrder', meaning: 'index in the travel sequence', unit: 'integer', stage: 'stitchIntelligence', stable: false, optional: true, variants: [], limitations: 'never a matching criterion' },
  stitch_count: { path: 'region.stitch_count', meaning: 'estimated stitches', unit: 'stitches', stage: 'region_builder', stable: true, optional: true, variants: [], limitations: 'estimate, not machine output' },
  color: { path: 'region.color', meaning: 'hex colour', unit: null, stage: 'regionNormalize', stable: true, optional: true, variants: ['region.hex'], limitations: 'never a matching criterion' },
  type: { path: 'region.type', meaning: "object role; literal 'contour' for contour objects", unit: null, stage: 'contourSafeMode / contourFromFill / outlineGenerator', stable: true, optional: true, variants: ["'contour'"], limitations: 'fill objects carry no type field' },
  region_class: { path: 'region.region_class', meaning: 'semantic class', unit: null, stage: 'contourSafeMode / classifier', stable: false, optional: true, variants: ["'outer_outline'", "'inner_outline'", "'fill'", "'detail_run'"], limitations: 'assigned by several modules with different vocabularies' },
  parentRegionId: { path: 'region.parentRegionId', meaning: 'fill a contour belongs to', unit: null, stage: 'contourFromFill', stable: true, optional: true, variants: [], limitations: 'only present on contour objects' },
  contour_width_mm: { path: 'region.contour_width_mm', meaning: 'contour width', unit: 'mm', stage: 'contourSafeMode', stable: true, optional: true, variants: [], limitations: null },
  visible: { path: 'region.visible', meaning: 'rendering flag', unit: 'boolean', stage: 'region_builder', stable: true, optional: true, variants: [], limitations: 'not a discard marker' },
});

/** Plan entries (ctx.plan.sequence, RegionPlan). */
export const VERIFIED_PLAN_FIELDS = Object.freeze({
  regionId: { path: 'plan.sequence[].regionId', meaning: 'links to region.id', unit: null, stable: true, optional: false },
  stitchType: { path: 'plan.sequence[].stitchType', meaning: 'technique chosen by the planner', unit: null, stable: true, optional: false, variants: ["'fill'", "'satin'", "'running_stitch'"] },
  optimalAngle: { path: 'plan.sequence[].optimalAngle', meaning: 'planned angle', unit: 'degrees', stable: true, optional: true },
  density: { path: 'plan.sequence[].density', meaning: 'row/column spacing', unit: 'mm', stable: true, optional: true },
  underlay: { path: 'plan.sequence[].underlay', meaning: '{ type, density, reason } or null', unit: 'mm', stable: true, optional: true, variants: ["'center_run'", "'edge_run'"] },
  layerOrder: { path: 'plan.sequence[].layerOrder', meaning: 'layer order', unit: 'integer', stable: true, optional: true },
  estimatedStitches: { path: 'plan.sequence[].estimatedStitches', meaning: 'estimated stitches', unit: 'stitches', stable: true, optional: true },
  areaMm2: { path: 'plan.sequence[].areaMm2', meaning: 'area', unit: 'mm²', stable: true, optional: true },
});

/**
 * Data the base engine does NOT expose — verified by exhaustive search over
 * src/lib and src/tests (excluding hatchLab) in P0.3A: zero occurrences.
 */
export const UNAVAILABLE_ENGINE_FIELDS = Object.freeze({
  spacingMode: 'No auto/manual spacing mode field exists (0 matches for spacing_mode / spacingMode).',
  spacingMm: 'No explicit spacing field exists; only `density` (mm), whose equivalence with the Hatch spacing column is unverified.',
  autoSplit: 'No automatic-split field exists (0 matches for auto_split / autoSplit).',
  underlayLengthMm: 'eieUnderlay returns type/density_mm/angle_deg only — never underlay lengths.',
  secondaryUnderlay: 'The engine emits a single combined underlay type (e.g. edge_walk_zigzag), never two separate entries.',
  coordinateSpace: 'No region or result declares its coordinate space; regionNormalize infers it heuristically inside the pipeline.',
});

/** Raw technique values actually found in the engine → evaluator vocabulary. */
export const TECHNIQUE_RAW_MAP = Object.freeze({
  satin: 'satin',
  fill: 'fill',
  running_stitch: 'running',
  tatami: 'tatami',
  triple_run: 'triple_running',
  triple_running: 'triple_running',
  contour: 'contour',
});

/** Raw underlay values actually found (eieUnderlay + stitchPlanner). */
export const UNDERLAY_RAW_MAP = Object.freeze({
  centre_walk: 'center_run',
  center_run: 'center_run',
  edge_walk: 'edge_run',
  edge_run: 'edge_run',
  zigzag: 'zigzag',
  zigzag_centre: 'zigzag',
  edge_walk_zigzag: 'edge_run_plus_zigzag',
  edge_run_plus_zigzag: 'edge_run_plus_zigzag',
  none: 'none',
});

/**
 * Raw underlay values with no equivalent in the A_WIDTHS vocabulary. They are
 * reported as `unknown` with an explicit reason instead of being forced.
 */
export const UNDERLAY_RAW_WITHOUT_EQUIVALENT = Object.freeze({
  full_coverage: 'full_coverage (full zigzag coverage) has no equivalent in the A_WIDTHS vocabulary.',
});

/** Markers that identify contour / auxiliary objects (never the main bar). */
export const CONTOUR_MARKERS = Object.freeze({
  typeValues: ['contour'],
  regionClassValues: ['outer_outline', 'inner_outline', 'contour'],
  parentField: 'parentRegionId',
});

export const KNOWN_REGION_KEYS = Object.freeze(
  Object.values(VERIFIED_REGION_FIELDS).map(d => d.path.replace(/^region\./, ''))
    .concat(['hex', 'layer_order', 'area_norm', 'perimeter_norm', 'contour', 'adaptive', 'quality_score', 'quality_issues', 'estimatedTime', 'estimatedThread', 'recommended_thread', 'stitch_confidence', 'stitch_rationale', 'orientation', 'convexity', 'concavity', 'mean_curvature', 'complexity', 'holes', 'skeleton_length_mm', 'mean_width_mm', 'max_width_mm', 'min_width_mm', 'is_auto_contour', '_metrics', 'object', 'object_group', 'geometry', 'curvature', 'stitch_notes', 'push_compensation', 'contour_stitch_count', 'underlay_data']),
);