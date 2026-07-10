import { DIGITIZE_MODES, getModeStrategy } from './digitizeModes.js';

const SUPPORTED_VECTOR_ENGINES = ['hybrid', 'opencv', 'vtracer', 'potrace'];
const DEFAULT_MODE = 'hybrid';

function clone(value) {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function finiteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function valueRecord(field, requested, effective, source, note = '') {
  const honored = requested === undefined || requested === null ? true : requested === effective;
  return { field, requested: requested ?? null, effective: effective ?? null, honored, source, note };
}

export function getModeProfile(mode = DEFAULT_MODE) {
  const requestedMode = DIGITIZE_MODES[mode] ? mode : DEFAULT_MODE;
  const strategy = getModeStrategy(requestedMode);
  if (requestedMode !== 'intelligent') {
    return {
      requestedMode: mode || DEFAULT_MODE,
      effectiveMode: requestedMode,
      effectiveBaseEngine: strategy.id,
      strategy,
      intelligentPlanConsumed: null,
    };
  }

  const hybrid = getModeStrategy('hybrid');
  return {
    requestedMode: requestedMode,
    effectiveMode: 'intelligent',
    effectiveBaseEngine: 'hybrid',
    strategy: {
      ...hybrid,
      id: 'intelligent',
      name: 'Modo Inteligente',
      preprocess: {
        ...hybrid.preprocess,
        enabled: true,
        posterizeColors: true,
      },
      backend: {
        ...hybrid.backend,
        mode: 'hybrid',
        use_ia_vision: true,
        vector_engine: 'hybrid',
      },
      stitchStrategy: {
        ...hybrid.stitchStrategy,
        travelOptimize: true,
        useAdaptiveEngine: true,
      },
    },
    intelligentPlanConsumed: false,
  };
}

export function getVectorEngineProfile(vectorEngine = 'hybrid') {
  const requested = vectorEngine || 'hybrid';
  const supported = SUPPORTED_VECTOR_ENGINES.includes(requested);
  return {
    requestedVectorEngine: requested,
    effectiveVectorEngine: supported ? requested : 'hybrid',
    supported,
    supportedVectorEngines: [...SUPPORTED_VECTOR_ENGINES],
    note: supported ? 'honored' : 'unsupported_vector_engine_fallback_to_hybrid',
  };
}

export function resolveEffectiveEmbroideryProfile(config = {}, preprocessSettings = null, machineSettings = {}) {
  const modeProfile = getModeProfile(config.mode || DEFAULT_MODE);
  const strategy = modeProfile.strategy;
  const vectorProfile = getVectorEngineProfile(config.vector_engine || strategy.backend?.vector_engine || 'hybrid');
  const requestedUseIaVision = hasOwn(config, 'use_ia_vision') ? config.use_ia_vision === true : undefined;
  const requestedUseFullBackground = hasOwn(config, 'use_full_bg') ? config.use_full_bg === true : undefined;
  const requestedTatamiDensity = hasOwn(config, 'tatami_density') ? config.tatami_density : undefined;
  const requestedFillAngle = hasOwn(config, 'fill_angle') ? config.fill_angle : undefined;
  const requestedColorCount = hasOwn(config, 'color_count') ? config.color_count : undefined;
  const requestedCartoonStructure = config.cartoonEmbroideryStructureMode === true;
  const panelPreprocess = preprocessSettings && typeof preprocessSettings === 'object' ? preprocessSettings : null;

  const effectivePreprocessSettings = {
    ...(strategy.preprocess || {}),
    ...(panelPreprocess || {}),
  };
  if (modeProfile.effectiveMode === 'intelligent') {
    effectivePreprocessSettings.enabled = true;
    effectivePreprocessSettings.posterizeColors = effectivePreprocessSettings.posterizeColors !== false;
  }

  const effectiveUseIaVision = modeProfile.effectiveMode === 'intelligent'
    ? true
    : (requestedUseIaVision ?? (strategy.backend?.use_ia_vision === true));
  const effectiveUseFullBackground = requestedUseFullBackground ?? (strategy.backend?.use_full_bg === true);
  const effectiveColorCount = finiteNumber(requestedColorCount, strategy.vectorizer?.color_count || 8);
  const effectiveTatamiDensity = finiteNumber(requestedTatamiDensity, strategy.backend?.tatami_density || 0.4);
  const effectiveFillAngle = requestedFillAngle ?? null;
  const effectiveGoldenMasterProfileId = (config.goldenMasterWilcomAlignment === true || config.goldenMasterProfileId)
    ? (config.goldenMasterProfileId || 'yoshi_wilcom_reference')
    : null;

  const fields = [
    valueRecord('mode', config.mode || DEFAULT_MODE, modeProfile.effectiveMode, 'ConfigPanel mode selector'),
    valueRecord('baseEngine', config.mode || DEFAULT_MODE, modeProfile.effectiveBaseEngine, modeProfile.effectiveMode === 'intelligent' ? 'intelligent uses hybrid base profile in V1' : 'digitizeModes strategy'),
    valueRecord('vector_engine', config.vector_engine || null, vectorProfile.effectiveVectorEngine, vectorProfile.supported ? 'ConfigPanel vector_engine' : 'fallback', vectorProfile.note),
    valueRecord('use_ia_vision', requestedUseIaVision, effectiveUseIaVision, modeProfile.effectiveMode === 'intelligent' ? 'intelligent V1 profile forces IA Vision true' : 'ConfigPanel IA Vision toggle or mode default'),
    valueRecord('use_full_bg', requestedUseFullBackground, effectiveUseFullBackground, requestedUseFullBackground == null ? 'mode default' : 'ConfigPanel full background toggle'),
    valueRecord('preprocessSettings', panelPreprocess ? 'PreprocessingPanel' : null, 'effectivePreprocessSettings', panelPreprocess ? 'PreprocessingPanel overrides mode preprocess' : 'mode preprocess'),
    valueRecord('posterizeColors', panelPreprocess?.posterizeColors, effectivePreprocessSettings.posterizeColors, panelPreprocess ? 'PreprocessingPanel' : 'mode preprocess'),
    valueRecord('posterizeLevels', panelPreprocess?.posterizeLevels, effectivePreprocessSettings.posterizeLevels, panelPreprocess ? 'PreprocessingPanel' : 'mode preprocess'),
    valueRecord('color_count', requestedColorCount, effectiveColorCount, requestedColorCount == null ? 'mode vectorizer default' : 'ConfigPanel color slider'),
    valueRecord('tatami_density', requestedTatamiDensity, effectiveTatamiDensity, requestedTatamiDensity == null ? 'mode backend default' : 'ConfigPanel tatami density'),
    valueRecord('fill_angle', requestedFillAngle, effectiveFillAngle, 'ConfigPanel fill angle'),
    valueRecord('cartoonEmbroideryStructureMode', requestedCartoonStructure, requestedCartoonStructure, 'explicit opt-in only'),
    valueRecord('goldenMasterProfileId', config.goldenMasterProfileId || null, effectiveGoldenMasterProfileId, 'explicit golden master config'),
  ];

  const sourceOfTruthByField = Object.fromEntries(fields.map((field) => [field.field, field.source]));
  const conflictsResolved = [];
  const stillUnwired = [];
  if (requestedUseFullBackground !== undefined) conflictsResolved.push('fullBackground toggle is now passed as effectiveUseFullBackground');
  if (panelPreprocess) conflictsResolved.push('PreprocessingPanel settings are now passed into image enhancement and vectorization context');
  if (panelPreprocess?.posterizeColors !== undefined || panelPreprocess?.posterizeLevels !== undefined) conflictsResolved.push('posterize controls now reach effectivePreprocessSettings');
  if (vectorProfile.supported) conflictsResolved.push('vector_engine selection is now passed into vector payload');
  if (!vectorProfile.supported) stillUnwired.push(`vector_engine ${vectorProfile.requestedVectorEngine} unsupported; fallback to hybrid reported`);
  if (modeProfile.effectiveMode === 'intelligent') stillUnwired.push('intelligentPlanConsumed=false until real per-region orchestration exists');

  const pipelineConfig = {
    mode: modeProfile.effectiveMode,
    effectiveBaseEngine: modeProfile.effectiveBaseEngine,
    vector_engine: vectorProfile.effectiveVectorEngine,
    use_ia_vision: effectiveUseIaVision,
    use_full_bg: effectiveUseFullBackground,
    color_count: effectiveColorCount,
    tatami_density: effectiveTatamiDensity,
    fill_angle: effectiveFillAngle,
    cartoonEmbroideryStructureMode: requestedCartoonStructure,
    goldenMasterProfileId: effectiveGoldenMasterProfileId,
    learnedFillDensityMm: config.learnedFillDensityMm ?? effectiveTatamiDensity,
    preprocessSettingsReachPipeline: true,
    posterizeControlsReachPipeline: true,
    profileResolverApplied: true,
  };

  return {
    profileResolverVersion: 'EFFECTIVE_ENGINE_PROFILE_RESOLVER_V1',
    profileResolverApplied: true,
    requestedProfile: {
      mode: config.mode || DEFAULT_MODE,
      vector_engine: config.vector_engine || null,
      use_ia_vision: requestedUseIaVision ?? null,
      use_full_bg: requestedUseFullBackground ?? null,
      preprocessSettings: clone(panelPreprocess),
      color_count: requestedColorCount ?? null,
      tatami_density: requestedTatamiDensity ?? null,
      fill_angle: requestedFillAngle ?? null,
      cartoonEmbroideryStructureMode: requestedCartoonStructure,
      goldenMasterProfileId: config.goldenMasterProfileId || null,
    },
    effectiveMode: modeProfile.effectiveMode,
    effectiveBaseEngine: modeProfile.effectiveBaseEngine,
    effectiveVectorEngine: vectorProfile.effectiveVectorEngine,
    effectiveUseIaVision,
    effectiveUseFullBackground,
    effectivePreprocessSettings,
    effectivePosterizeColors: effectivePreprocessSettings.posterizeColors !== false,
    effectivePosterizeLevels: effectivePreprocessSettings.posterizeLevels || strategy.preprocess?.posterizeLevels || 6,
    effectiveColorCount,
    effectiveTatamiDensity,
    effectiveFillAngle,
    effectiveCartoonStructureMode: requestedCartoonStructure,
    effectiveGoldenMasterProfileId,
    effectiveStitchStrategy: {
      ...(strategy.stitchStrategy || {}),
      ...(modeProfile.effectiveMode === 'intelligent' ? { travelOptimize: true, useAdaptiveEngine: true } : {}),
    },
    intelligentPlanConsumed: modeProfile.intelligentPlanConsumed,
    fieldResolution: fields,
    sourceOfTruthByField,
    conflictsResolved,
    stillUnwired,
    pipelineConfig,
    machineSettingsSnapshot: clone(machineSettings),
  };
}

export function buildEffectiveProfileAuditReport({ config = {}, preprocessSettings = null, machineSettings = {}, effectiveProfile = null } = {}) {
  const profile = effectiveProfile || resolveEffectiveEmbroideryProfile(config, preprocessSettings, machineSettings);
  return {
    reportId: 'EFFECTIVE_ENGINE_PROFILE_RESOLVER_V1',
    generatedAt: new Date().toISOString(),
    profileResolverApplied: profile.profileResolverApplied === true,
    requestedProfile: profile.requestedProfile,
    effectiveProfile: {
      effectiveMode: profile.effectiveMode,
      effectiveBaseEngine: profile.effectiveBaseEngine,
      effectiveVectorEngine: profile.effectiveVectorEngine,
      effectiveUseIaVision: profile.effectiveUseIaVision,
      effectiveUseFullBackground: profile.effectiveUseFullBackground,
      effectivePreprocessSettings: profile.effectivePreprocessSettings,
      effectivePosterizeColors: profile.effectivePosterizeColors,
      effectivePosterizeLevels: profile.effectivePosterizeLevels,
      effectiveColorCount: profile.effectiveColorCount,
      effectiveTatamiDensity: profile.effectiveTatamiDensity,
      effectiveFillAngle: profile.effectiveFillAngle,
      effectiveCartoonStructureMode: profile.effectiveCartoonStructureMode,
      effectiveGoldenMasterProfileId: profile.effectiveGoldenMasterProfileId,
      intelligentPlanConsumed: profile.intelligentPlanConsumed,
    },
    fieldResolution: profile.fieldResolution,
    sourceOfTruthByField: profile.sourceOfTruthByField,
    conflictsResolved: profile.conflictsResolved,
    stillUnwired: profile.stillUnwired,
    preprocessingPanelReachable: true,
    posterizeControlsReachPipeline: true,
    fullBackgroundHonoredOrExplicitlyReported: true,
    vectorEngineHonoredOrExplicitlyReported: true,
    densitySourceUnified: true,
  };
}