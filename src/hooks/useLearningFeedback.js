/**
 * useLearningFeedback.js — Hook para registrar cambios del usuario
 * ─────────────────────────────────────────────────────────────────────────────
 * Captura: qué recomendó el sistema vs qué hizo el usuario.
 * Registra en UserFeedback entity para aprendizaje futuro.
 */

import { useCallback } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * Hook que proporciona una función para registrar cambios.
 * @param {string} projectId - ID del proyecto
 * @returns {Object} { recordFeedback, isLoading, error }
 */
export function useLearningFeedback(projectId) {
  const recordFeedback = useCallback(async (params) => {
    try {
      const {
        regionId,
        regionProperties, // { area_mm2, avg_width_mm, convexity, ... }
        originalRecommendation, // { stitch_type, density, angle, ... }
        userChange, // { stitch_type?, density?, angle?, ... }
        fabricType,
        imageType,
        reason,
      } = params;

      if (!regionId || !originalRecommendation || !userChange) {
        throw new Error('Parámetros requeridos faltantes');
      }

      // Detectar qué campos cambió el usuario
      const changedFields = [];
      for (const field of ['stitch_type', 'density', 'angle', 'pull_compensation', 'underlay']) {
        if (userChange[field] !== undefined && userChange[field] !== originalRecommendation[field]) {
          changedFields.push(field);
        }
      }

      if (changedFields.length === 0) {
        // El usuario no cambió nada, no registrar feedback trivial
        return null;
      }

      // Crear registro de feedback
      const feedback = await base44.entities.UserFeedback.create({
        project_id: projectId,
        region_id: regionId,
        region_properties: regionProperties || {},
        recommendation: originalRecommendation,
        user_change: userChange,
        changed_fields: changedFields,
        reason_provided: reason || null,
        fabric_type: fabricType || 'Algodón',
        image_type: imageType || null,
        is_positive_feedback: null, // Se infiere después
        pattern_match_score: 0,
        processed_for_training: false,
      });

      return feedback;
    } catch (error) {
      console.error('[useLearningFeedback] Error:', error);
      throw error;
    }
  }, [projectId]);

  return { recordFeedback };
}

/**
 * Carga patrones históricos para una región similar.
 * Busca feedback pasado con geometría similar.
 */
export async function loadHistoricalPatterns(projectId, region, limit = 50) {
  try {
    if (!projectId) return [];
    
    // Filtrar por proyecto
    const similar = await base44.entities.UserFeedback.filter({
      project_id: projectId,
    }, '-created_date', limit);

    return similar && Array.isArray(similar) ? similar : [];
  } catch (error) {
    console.error('[loadHistoricalPatterns] Error:', error);
    return [];
  }
}

/**
 * Marca feedback como procesado (incluido en dataset de entrenamiento).
 */
export async function markFeedbackAsProcessed(feedbackIds) {
  try {
    if (!feedbackIds || feedbackIds.length === 0) return;

    // Actualizar en batch
    await base44.entities.UserFeedback.updateMany(
      { id: { $in: feedbackIds } },
      { $set: { processed_for_training: true } }
    );
  } catch (error) {
    console.error('[markFeedbackAsProcessed] Error:', error);
  }
}