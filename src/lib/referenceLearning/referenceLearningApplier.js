/**
 * referenceLearningApplier.js — Reference Learning Engine v2 (FASE 5-7)
 * ─────────────────────────────────────────────────────────────────────────────
 * Orquesta la aplicación del aprendizaje al Professional Mode:
 *   1. selecciona el mejor perfil para el diseño actual
 *   2. construye el preset aprendido
 *   3. mapea el preset a config keys (learned*) + activa professionalMode
 *   4. compara el diseño antes/después
 *   5. genera el informe REFERENCE_LEARNING_APPLIED_REPORT.md
 *
 * NO toca encoders, CE01, detector universal ni la regresión.
 */

import { selectBestLearnedProfileForCurrentDesign } from './referenceDesignSelector';
import { buildProfessionalPresetFromLearnedProfile } from './learnedPresetBuilder';
import { compareCurrentDesignToLearnedCorpus } from './referenceDesignComparator';
import { generateReferenceLearningAppliedReport } from './referenceAppliedReportGenerator';

/**
 * @param {object} ctx
 * @param {Array} ctx.currentCommands
 * @param {Array} ctx.currentRegions
 * @param {Array<object>} ctx.learnedProfiles
 * @param {Array<object>} ctx.learnedRules
 * @param {object} ctx.corpusSummary
 * @param {string} ctx.designName
 * @returns {object} application result
 */
export function applyLearnedProfileToProfessionalMode(ctx) {
  const { currentCommands, currentRegions, learnedProfiles, learnedRules, corpusSummary, designName } = ctx;

  // FASE 2 — seleccionar perfil
  const selection = selectBestLearnedProfileForCurrentDesign(currentRegions, currentCommands, learnedProfiles);
  if (!selection.selectedProfile) {
    return { error: 'No hay perfiles aprendidos para este diseño', selection, preset: null, comparison: null, report: null };
  }

  // FASE 4 — construir preset aprendido
  const preset = buildProfessionalPresetFromLearnedProfile(selection.selectedProfile, learnedRules);
  if (!preset) {
    return { error: 'No se pudo construir el preset', selection, preset: null, comparison: null, report: null };
  }

  // FASE 3 — comparar diseño actual contra corpus (antes de aplicar)
  const beforeComparison = compareCurrentDesignToLearnedCorpus(
    currentCommands, currentRegions, selection.selectedProfile, learnedRules, corpusSummary
  );

  // Mapear preset → config patch (learned* keys que consume applyProfessionalPipeline)
  const configPatch = presetToConfigPatch(preset);

  // FASE 5/7 — generar informe de aplicación
  const report = generateReferenceLearningAppliedReport({
    designName: designName || 'Diseño actual',
    selection,
    preset,
    configPatch,
    beforeComparison,
    corpusSummary,
    learnedRules,
  });

  return {
    selection,
    selectedProfile: selection.selectedProfile,
    preset,
    configPatch,
    beforeComparison,
    report,
  };
}

/**
 * Mapea el preset aprendido a las config keys que applyProfessionalPipeline lee.
 * Estas keys viajan en project.config y son aplicadas SOLO cuando professionalMode=true.
 */
export function presetToConfigPatch(preset) {
  if (!preset) return {};
  return {
    professionalMode: true,
    learnedFillDensityMm: preset.fillRowSpacingMm,
    learnedFillAngleDeg: preset.fillAngleDeg,
    learnedSatinColumnSpacingMm: preset.satinColumnSpacingMm,
    learnedSatinWidthMm: preset.satinWidthMm,
    learnedPullCompensationMm: preset.pullCompensationMm,
    learnedMaxVisibleStitchMm: preset.maxVisibleStitchMm,
    learnedMaxColorCount: preset.maxColorCount,
    // nuevas keys para travel + ángulo vecino
    learnedConvertTravelAboveMmToJump: preset.convertTravelAboveMmToJump,
    learnedTrimBeforeTravelMm: preset.trimBeforeTravelMm,
    learnedNeighborAngleVariationDeg: preset.neighborAngleVariationDeg,
    learnedContourAfterFill: preset.contourAfterFill,
    learnedUnderlayEnabled: preset.underlayEnabled,
    learnedReduceSimilarColors: preset.reduceSimilarColors,
    learnedUseSatinForOuterContours: preset.useSatinForOuterContours,
    learnedDetailsLast: preset.detailsLast,
    learnedProfileId: preset.sourceProfileId,
    learnedPresetSource: 'reference_learning_engine_v2',
  };
}