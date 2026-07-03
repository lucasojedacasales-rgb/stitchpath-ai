/**
 * referenceLearningState.js — Reference Learning Engine v2 (FASE 8)
 * ─────────────────────────────────────────────────────────────────────────────
 * Persistencia del aprendizaje en localStorage. Guarda el conocimiento extraído
 * (resumen, reglas, perfiles, estadísticas globales, presets recomendados) para
 * que sobreviva a recargas de la app. NO guarda las secuencias de comandos
 * completas (demasiado grandes); solo el conocimiento minado.
 */

const STORAGE_KEY = 'referenceLearningState_v2';

export function saveLearningState(state) {
  if (!state) return;
  try {
    // Conservar solo el conocimiento, no las secuencias de comandos completas.
    const compact = {
      corpusSummary: state.corpusSummary || null,
      learnedRules: state.learnedRules || [],
      learnedProfiles: (state.learnedProfiles || []).map(stripLarge),
      globalProfessionalStats: state.globalProfessionalStats || null,
      recommendedMotorPresets: (state.recommendedMotorPresets || []).map(stripLarge),
      totalFiles: state.totalFiles || 0,
      validFiles: state.validFiles || 0,
      failedFiles: state.failedFiles || [],
      blockCounts: state.blockCounts || null,
      dacSummary: state.dacSummary || null,
      generatedAt: state.generatedAt || new Date().toISOString(),
      corpusVersion: state.corpusVersion || 2,
      uploadedFileNames: state.uploadedFileNames || [],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
  } catch (e) {
    console.warn('[referenceLearningState] save failed:', e.message);
  }
}

export function loadLearningState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[referenceLearningState] load failed:', e.message);
    return null;
  }
}

export function clearLearningState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('[referenceLearningState] clear failed:', e.message);
  }
}

export function hasLearningState() {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

function stripLarge(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const { commandSequence, technicalBlocks, metrics, fileAnalyses, ...rest } = obj;
  return rest;
}