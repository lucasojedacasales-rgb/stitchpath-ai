/**
 * engineBoundaryManifest.js — Hatch Lab (P0)
 * ─────────────────────────────────────────────────────────────────────────────
 * DECLARATIVE ONLY. This module imports nothing and executes no productive
 * code. It records which paths of the repository were verified by reading the
 * real source, and which paths the Hatch Lab must never touch or depend on.
 *
 * It is documentation-as-data: linters, reviewers and future lab phases can
 * read it, but nothing in the productive app reads it.
 */

export const MANIFEST_VERSION = '1.0.0';

/** Pipeline stages verified by reading src/lib/pipeline/runner.js. */
export const baseEngineVerified = [
  { path: 'src/lib/pipeline/runner.js', role: 'orchestrator', mutatesRegions: false, verified: true },
  { path: 'src/lib/pipeline/stages/imageAnalysisStage.js', stageId: 'image_analysis', mutatesRegions: false, verified: true },
  { path: 'src/lib/pipeline/stages/imageEnhancementStage.js', stageId: 'image_enhancement', mutatesRegions: false, verified: true },
  { path: 'src/lib/pipeline/stages/contourEngineStage.js', stageId: 'contour_engine', mutatesRegions: false, verified: true },
  { path: 'src/lib/pipeline/stages/semanticSegmentationStage.js', stageId: 'semantic_segmentation', mutatesRegions: false, verified: true },
  { path: 'src/lib/pipeline/stages/vectorEngineStage.js', stageId: 'vector_engine', mutatesRegions: false, verified: true },
  { path: 'src/lib/pipeline/stages/regionBuilderStage.js', stageId: 'region_builder', mutatesRegions: true, verified: true },
  { path: 'src/lib/cartoonSegmentationCleanup.js', stageId: 'quality_phase_1_input_segmentation_cleanup', mutatesRegions: true, verified: true },
  { path: 'src/lib/pipeline/stages/stitchPlannerStage.js', stageId: 'stitch_planner', mutatesRegions: false, verified: true },
  { path: 'src/lib/pipeline/stages/stitchOptimizerStage.js', stageId: 'stitch_optimizer', mutatesRegions: true, verified: true },
];

/** Stages that replace or reorder ctx.regions — any future rule must re-run what follows. */
export const regionMutatingStageIds = [
  'region_builder',
  'quality_phase_1_input_segmentation_cleanup',
  'stitch_optimizer',
];

export const baseApplication = [
  'src/pages/Editor.jsx',
  'src/App.jsx',
  'src/components/editor/**',
  'src/lib/regionBuilder.js',
  'src/lib/adaptiveEngine.js',
  'src/lib/contourEngine.js',
  'src/lib/stitchPlanner.js',
];

/**
 * Reference-learning area of the base application.
 * NOT confirmed to be the externally developed Engine V2. Excluded as a
 * precaution: the Hatch Lab must not import, read, reuse or modify it.
 */
export const excludedReferenceLearning = {
  paths: [
    'src/lib/referenceLearning/**',
    'src/components/referenceLearning/**',
    'src/pages/ReferenceLearning.jsx',
  ],
  classification: 'reference-learning module of the base application',
  relationToEngineV2: 'not confirmed',
  reason: 'excluded as a precaution',
  hatchLabMayDependOnIt: false,
};

/**
 * Externally developed Engine V2 (Codex). Not located in this repository as of
 * this manifest version. Never modify, wherever it lives.
 */
export const possibleExternalEngineV2 = {
  presentInThisRepository: 'unknown',
  paths: [],
  policy: 'never modify, never import, never mirror',
};

export const productiveExport = [
  'src/lib/exportPipeline.js',
  'src/lib/dstEncoder.js',
  'src/lib/dsbEncoder.js',
  'src/lib/dstDirectExport.js',
  'src/lib/ce01Validator.js',
  'src/lib/ce01ProductionExport.js',
  'src/lib/ce01CommandSanitizer.js',
  'base44/functions/exportEmbroideryFile/**',
  'base44/functions/generateEmbroideryFile/**',
];

export const productivePersistence = [
  'base44/entities/**',
  'src/api/base44Client.js',
  'src/pages/Editor.jsx#saveProject',
];

export const unknownOrNeedsConfirmation = [
  { path: 'src/lib/vectorizationFusionEngine.js', reason: 'opt-in alternative vectorizer; relation to Engine V2 unverified' },
  { path: 'src/lib/universalAutoDigitizerPro.js', reason: 'flag-gated experimental path, not read during P0' },
  { path: 'src/workers/regression.worker.js', reason: 'existing regression harness; not inspected in depth' },
];

/** Hard rule set for every future Hatch Lab phase. */
export const labConstraints = {
  mayCreateOnly: ['src/lib/hatchLab/**', 'src/tests/hatchLab/**'],
  mayNotModify: [
    ...baseApplication,
    ...productiveExport,
    ...productivePersistence,
    ...excludedReferenceLearning.paths,
    'src/lib/pipeline/**',
  ],
  mayNotImport: [...excludedReferenceLearning.paths],
  defaultEnabled: false,
  removableWithoutSideEffects: true,
};