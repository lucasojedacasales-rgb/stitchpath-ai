/**
 * wilcomStyleComparator.js — Reference Embroidery Learning System
 * ─────────────────────────────────────────────────────────────────────────────
 * Compares a StitchPath AI-generated design (its final commands + metrics)
 * against the aggregate of professional reference files.
 *
 * Returns:
 *   - differences            : per-metric deltas
 *   - missingProfessionalFeatures : features present in references, absent in ours
 *   - overusedFeatures        : features we over-use vs references
 *   - recommendations         : plain-language actions to close the gap
 *   - similarityScore         : 0-100, how close we are to the reference profile
 *   - professionalGapScore    : 0-100, how much professional polish we lack
 *
 * Read-only diagnostic. Never modifies the motor or the design.
 */

import { aggregateBatchMetrics } from './referenceMetricsAnalyzer';
import { classifyStitchBlocks } from './stitchPatternClassifier';

/**
 * @param {Array} ourCommands — StitchPath AI final commands
 * @param {object} ourMetrics — from calculateUnifiedCommandMetrics or analyzeReferenceMetrics
 * @param {Array<object>} references — from referenceLibrary.listReferences()
 * @returns {object} comparison report
 */
export function compareAgainstReferences(ourCommands, ourMetrics, references) {
  if (!references || references.length === 0) {
    return {
      differences: [],
      missingProfessionalFeatures: [],
      overusedFeatures: [],
      recommendations: ['Importa archivos de referencia buenos para poder comparar.'],
      similarityScore: 0,
      professionalGapScore: 100,
    };
  }

  const refAgg = aggregateBatchMetrics(references.map(r => ({ metrics: r.metrics })));
  const ourBlocks = classifyStitchBlocks(ourCommands || []);
  const ourByType = countByType(ourBlocks);

  const differences = [];
  const missingProfessionalFeatures = [];
  const overusedFeatures = [];
  const recommendations = [];

  const metricsToCompare = [
    'stitchCount', 'colorCount', 'jumpCount', 'trimCount',
    'averageStitchLength', 'maxStitchLength', 'shortStitchCount',
    'longVisibleStitchCount', 'duplicateStitchCount', 'colorBlockCount',
    'estimatedDensity', 'visibleTravelScore', 'professionalScore',
  ];

  for (const k of metricsToCompare) {
    const refAvg = refAgg.avg[k] ?? 0;
    const ours = ourMetrics[k] ?? 0;
    if (!Number.isFinite(refAvg) || !Number.isFinite(ours)) continue;
    const delta = ours - refAvg;
    const rel = refAvg !== 0 ? delta / Math.abs(refAvg) : (ours !== 0 ? 1 : 0);
    if (Math.abs(rel) > 0.25 || (refAvg === 0 && ours > 0)) {
      differences.push({
        metric: k,
        reference: refAvg,
        ours,
        delta,
        relativeDelta: rel,
        severity: Math.abs(rel) > 1 ? 'high' : Math.abs(rel) > 0.5 ? 'medium' : 'low',
      });
    }
  }

  // Block-type presence
  const refBlockAvg = {
    fill_tatami: refAgg.avg.fillLikeBlocks || 0,
    satin_border: refAgg.avg.satinLikeBlocks || 0,
    running_outline: refAgg.avg.contourLikeBlocks || 0,
    underlay: refAgg.avg.possibleUnderlayBlocks || 0,
  };
  for (const [type, refAvg] of Object.entries(refBlockAvg)) {
    const ours = ourByType[type] || 0;
    if (refAvg >= 1 && ours === 0) {
      missingProfessionalFeatures.push({
        feature: type,
        reference: refAvg,
        ours: 0,
        recommendation: `Los archivos buenos usan ${type} (promedio ${refAvg.toFixed(1)} bloques). Nuestro diseño no tiene ninguno.`,
      });
    }
    if (ours > refAvg * 2 && refAvg > 0) {
      overusedFeatures.push({
        feature: type,
        reference: refAvg,
        ours,
        recommendation: `Uso excesivo de ${type}: ${ours} vs ${refAvg.toFixed(1)} en referencias.`,
      });
    }
  }

  // Specific recommendations
  if ((ourMetrics.longVisibleStitchCount || 0) > (refAgg.avg.longVisibleStitchCount || 0) + 2) {
    recommendations.push('Reducir puntadas largas visibles (>7mm): dividirlas en sub-puntadas.');
  }
  if ((ourMetrics.duplicateStitchCount || 0) > (refAgg.avg.duplicateStitchCount || 0) + 3) {
    recommendations.push('Eliminar puntadas duplicadas consecutivas en la sanitización final.');
  }
  if ((ourMetrics.visibleTravelScore || 0) > (refAgg.avg.visibleTravelScore || 0) + 0.02) {
    recommendations.push('Reducir travel visible: convertir saltos largos en jump+trim o enmascarar con rellenos.');
  }
  if ((ourByType.underlay || 0) === 0 && (refAgg.avg.possibleUnderlayBlocks || 0) >= 1) {
    recommendations.push('Añadir underlay antes de rellenos grandes (las referencias lo hacen).');
  }
  if ((ourByType.running_outline || 0) === 0 && (refAgg.avg.contourLikeBlocks || 0) >= 1) {
    recommendations.push('Añadir contornos exteriores (running/satin) después de los rellenos.');
  }
  if ((ourMetrics.colorCount || 0) > (refAgg.avg.colorCount || 0) + 1) {
    recommendations.push('Reducir número de colores: agrupar colores similares como en las referencias.');
  }
  if (recommendations.length === 0) {
    recommendations.push('El diseño está alineado con el perfil profesional de las referencias.');
  }

  // Similarity score: weighted inverse of normalized deltas
  let sim = 100;
  for (const d of differences) {
    sim -= Math.min(15, Math.abs(d.relativeDelta) * 20 * (d.severity === 'high' ? 1.5 : 1));
  }
  sim = Math.max(0, Math.min(100, Math.round(sim)));

  // Professional gap score: how far our professionalScore is from the reference average
  const refProf = refAgg.avg.professionalScore || 0;
  const ourProf = ourMetrics.professionalScore || 0;
  const professionalGapScore = Math.max(0, Math.min(100, Math.round(refProf - ourProf)));

  return {
    differences: differences.sort((a, b) => Math.abs(b.relativeDelta) - Math.abs(a.relativeDelta)),
    missingProfessionalFeatures,
    overusedFeatures,
    recommendations,
    similarityScore: sim,
    professionalGapScore,
    referenceProfile: refAgg,
    ourBlockProfile: ourByType,
  };
}

function countByType(blocks) {
  const c = { fill_tatami: 0, satin_border: 0, running_outline: 0, double_run_detail: 0,
    underlay: 0, travel_jump: 0, noise: 0, unknown: 0 };
  for (const b of blocks) c[b.blockType] = (c[b.blockType] || 0) + 1;
  return c;
}