/**
 * learningEngine.js — Sistema de aprendizaje de bordado
 * ─────────────────────────────────────────────────────────────────────────────
 * Analiza cambios del usuario vs recomendaciones del sistema.
 * Aprende patrones para mejorar futuras decisiones.
 *
 * Arquitectura escalable para entrenar con miles de diseños.
 */

// ─── Pattern Matching ──────────────────────────────────────────────────────────

/**
 * Computa similitud geométrica entre dos regiones [0-1].
 * Usa distancia euclidiana normalizada en espacio de métricas.
 */
export function computeGeometricSimilarity(props1, props2) {
  if (!props1 || !props2) return 0;
  
  const dims = [
    { key: 'area_mm2', weight: 0.25, scale: 1000 },
    { key: 'avg_width_mm', weight: 0.20, scale: 20 },
    { key: 'convexity', weight: 0.15, scale: 1 },
    { key: 'curvature', weight: 0.15, scale: 2 },
    { key: 'complexity_score', weight: 0.15, scale: 1 },
    { key: 'inertia_ratio', weight: 0.10, scale: 5 },
  ];

  let totalWeight = 0, totalDist = 0;
  for (const { key, weight, scale } of dims) {
    const v1 = (props1[key] || 0) / scale;
    const v2 = (props2[key] || 0) / scale;
    const dist = Math.abs(v1 - v2);
    totalDist += weight * Math.min(1, dist);
    totalWeight += weight;
  }

  return Math.max(0, 1 - (totalWeight > 0 ? totalDist / totalWeight : 0));
}

/**
 * Computa similitud contextual: fabric type, image type, etc.
 */
export function computeContextualSimilarity(ctx1, ctx2) {
  if (!ctx1 || !ctx2) return 0.5;
  
  let score = 1;
  if (ctx1.fabric_type !== ctx2.fabric_type) score *= 0.8;
  if (ctx1.image_type !== ctx2.image_type) score *= 0.9;
  if (ctx1.color_hex !== ctx2.color_hex) score *= 0.95; // small penalty for color diff
  
  return score;
}

/**
 * Similitud total: combinación ponderada de geométrica + contextual.
 */
export function computeTotalSimilarity(props1, props2, ctx1, ctx2) {
  const geom = computeGeometricSimilarity(props1, props2);
  const ctx = computeContextualSimilarity(ctx1, ctx2);
  return 0.7 * geom + 0.3 * ctx;
}

// ─── Pattern Extraction ────────────────────────────────────────────────────────

/**
 * Extrae un "pattern" de un feedback: qué cambios hace el usuario ante qué métricas.
 * @param {Object} feedback - registro de UserFeedback
 * @returns {Object} patrón normalizado
 */
export function extractPattern(feedback) {
  if (!feedback || !feedback.user_change) return null;

  const rec = feedback.recommendation || {};
  const change = feedback.user_change;
  const props = feedback.region_properties || {};

  return {
    // Característica de entrada: métricas de la región
    input: {
      area_mm2: props.area_mm2 || 0,
      avg_width_mm: props.avg_width_mm || 0,
      convexity: props.convexity || 0.5,
      curvature: props.curvature || 0,
      complexity_score: props.complexity_score || 0,
      inertia_ratio: props.inertia_ratio || 1,
      color_hex: props.color || '#888888',
      fabric_type: feedback.fabric_type || 'Algodón',
      image_type: feedback.image_type || 'unknown',
    },

    // Característica de salida: cambios que el usuario hizo
    output: {
      stitch_type: change.stitch_type || rec.stitch_type,
      density: change.density !== undefined ? change.density : rec.density,
      angle: change.angle !== undefined ? change.angle : rec.angle,
      pull_compensation: change.pull_compensation !== undefined ? change.pull_compensation : rec.pull_compensation,
      underlay: change.underlay !== undefined ? change.underlay : rec.underlay,
    },

    // Cambios específicos (delta)
    deltas: feedback.changed_fields || [],

    // Confianza
    confidence: rec.confidence || 0.5,

    // Timestamp para evolución temporal
    created_at: feedback.created_date || new Date().toISOString(),
  };
}

// ─── Pattern Analysis ─────────────────────────────────────────────────────────

/**
 * Analiza un conjunto de patrones para detectar reglas generales.
 * Retorna un mapa de "si [condiciones] entonces [cambio probable]"
 */
export function analyzePatterns(patterns) {
  if (!patterns || patterns.length === 0) return { rules: [] };

  // Agrupar por tipo de cambio más común
  const changeFreq = {};
  for (const p of patterns) {
    if (p.deltas.length === 0) continue;
    const key = p.deltas.sort().join('|');
    changeFreq[key] = (changeFreq[key] || 0) + 1;
  }

  // Detectar cambios más frecuentes
  const topChanges = Object.entries(changeFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([changes, freq]) => ({
      changes: changes.split('|'),
      frequency: freq,
      examples: patterns.filter(p => p.deltas.sort().join('|') === changes),
    }));

  // Para cada cambio frecuente, detectar qué condiciones lo preceden
  const rules = [];
  for (const changeGroup of topChanges) {
    if (changeGroup.frequency < 2) continue;

    const examples = changeGroup.examples;
    const inputs = examples.map(p => p.input);

    // Calcular valores centrales de las métricas
    const centroids = {};
    const metrics = ['area_mm2', 'avg_width_mm', 'convexity', 'curvature', 'complexity_score', 'inertia_ratio'];
    for (const m of metrics) {
      const values = inputs.map(i => i[m]);
      centroids[m] = values.reduce((a, b) => a + b, 0) / values.length;
    }

    // Detectar el cambio de salida promedio
    const avgOutput = {};
    for (const field of ['stitch_type', 'density', 'angle', 'pull_compensation', 'underlay']) {
      const vals = examples.map(p => p.output[field]);
      if (field === 'stitch_type') {
        const freq = {};
        for (const v of vals) freq[v] = (freq[v] || 0) + 1;
        avgOutput[field] = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0];
      } else if (typeof vals[0] === 'number') {
        avgOutput[field] = vals.reduce((a, b) => a + b, 0) / vals.length;
      } else {
        avgOutput[field] = vals[0];
      }
    }

    rules.push({
      changes: changeGroup.changes,
      frequency: changeGroup.frequency,
      condition_centroids: centroids,
      suggested_output: avgOutput,
      confidence: Math.min(1, changeGroup.frequency / patterns.length),
      examples_count: examples.length,
    });
  }

  return { rules, total_patterns: patterns.length };
}

// ─── Recommendation Improvement ────────────────────────────────────────────────

/**
 * Mejora una recomendación basada en patrones históricos similares.
 * Busca feedback previo con geometría similar y aplica lo que el usuario prefería.
 *
 * @param {Object} region - región actual con propiedades geométricas
 * @param {Object} currentRec - recomendación actual del motor adaptativo
 * @param {Array} historicalPatterns - patrones extraídos de feedback histórico
 * @param {Object} context - { fabric_type, image_type, ... }
 * @returns {Object} recomendación mejorada + confianza
 */
export function improveRecommendationFromHistory(region, currentRec, historicalPatterns, context) {
  if (!historicalPatterns || historicalPatterns.length === 0) {
    return {
      ...currentRec,
      improved: false,
      learning_confidence: 0,
      reason: 'Sin historial de aprendizaje',
    };
  }

  // Encontrar patrones similares
  const similarities = historicalPatterns.map(p => ({
    pattern: p,
    similarity: computeTotalSimilarity(region, p.input, context, {
      fabric_type: p.input.fabric_type,
      image_type: p.input.image_type,
      color_hex: p.input.color_hex,
    }),
  }))
    .filter(s => s.similarity > 0.6)
    .sort((a, b) => b.similarity - a.similarity);

  if (similarities.length === 0) {
    return {
      ...currentRec,
      improved: false,
      learning_confidence: 0,
      reason: 'No hay patrones similares en el historial',
    };
  }

  // Ponderación: patrones más similares tienen más peso
  let weightedOutput = {
    density: 0,
    angle: 0,
    pull_compensation: 0,
  };
  let totalWeight = 0;

  for (const { pattern, similarity } of similarities.slice(0, 10)) {
    const weight = similarity * (pattern.confidence || 0.5);

    // Actualizar campos ponderados
    if (pattern.output.stitch_type && !weightedOutput.stitch_type) {
      weightedOutput.stitch_type = pattern.output.stitch_type;
    }
    
    if (pattern.output.density !== undefined && typeof pattern.output.density === 'number') {
      weightedOutput.density = weightedOutput.density + pattern.output.density * weight;
    }
    
    if (pattern.output.angle !== undefined && typeof pattern.output.angle === 'number') {
      weightedOutput.angle = weightedOutput.angle + pattern.output.angle * weight;
    }
    
    if (pattern.output.pull_compensation !== undefined && typeof pattern.output.pull_compensation === 'number') {
      weightedOutput.pull_compensation = weightedOutput.pull_compensation + pattern.output.pull_compensation * weight;
    }
    
    if (pattern.output.underlay !== undefined) {
      weightedOutput.underlay = pattern.output.underlay;
    }

    totalWeight += weight;
  }

  // Normalizar pesos
  if (totalWeight > 0) {
    if (weightedOutput.density > 0) weightedOutput.density = +(weightedOutput.density / totalWeight).toFixed(2);
    if (weightedOutput.angle > 0) weightedOutput.angle = +(weightedOutput.angle / totalWeight).toFixed(0);
    if (weightedOutput.pull_compensation > 0) weightedOutput.pull_compensation = +(weightedOutput.pull_compensation / totalWeight).toFixed(3);
  }

  // Calcular confianza de mejora
  const avgSimilarity = similarities.slice(0, 10).reduce((s, x) => s + x.similarity, 0) / Math.min(10, similarities.length);
  const learningConfidence = Math.min(1, avgSimilarity * 0.9);

  return {
    ...currentRec,
    stitch_type: weightedOutput.stitch_type || currentRec.stitch_type,
    density: weightedOutput.density ?? currentRec.density,
    angle: weightedOutput.angle ?? currentRec.angle,
    pull_compensation: weightedOutput.pull_compensation ?? currentRec.pull_compensation,
    underlay: weightedOutput.underlay !== undefined ? weightedOutput.underlay : currentRec.underlay,
    improved: similarities.length > 0,
    learning_confidence: +learningConfidence.toFixed(2),
    reason: `Basado en ${similarities.length} patron(es) histórico(s) similares`,
    similar_patterns_count: similarities.length,
  };
}

// ─── Training Data Serialization ───────────────────────────────────────────────

/**
 * Serializa feedback para usar como dataset de entrenamiento externo (ej. TensorFlow, scikit-learn).
 * Formato abierto: JSONL o CSV.
 */
export function serializeForTraining(feedbackList) {
  const records = [];
  for (const fb of feedbackList) {
    const p = extractPattern(fb);
    if (!p) continue;

    records.push({
      // Entrada (features)
      area_mm2: p.input.area_mm2,
      avg_width_mm: p.input.avg_width_mm,
      convexity: p.input.convexity,
      curvature: p.input.curvature,
      complexity_score: p.input.complexity_score,
      inertia_ratio: p.input.inertia_ratio,
      fabric_type: p.input.fabric_type,
      image_type: p.input.image_type,

      // Salida (targets)
      stitch_type: p.output.stitch_type,
      density: p.output.density,
      angle: p.output.angle,
      pull_compensation: p.output.pull_compensation,
      underlay: p.output.underlay ? 1 : 0,

      // Metadata
      original_confidence: fb.recommendation?.confidence || 0.5,
      user_confidence: 1, // el usuario eligió esto, confianza alta
      changed_fields: fb.changed_fields?.join(',') || '',
      timestamp: fb.created_date,
    });
  }
  return records;
}

/**
 * Genera CSV para exportar a herramientas de ML externas.
 */
export function generateTrainingCSV(feedbackList) {
  const records = serializeForTraining(feedbackList);
  if (records.length === 0) return '';

  const header = Object.keys(records[0]).join(',');
  const rows = records.map(r => Object.values(r).map(v => {
    if (typeof v === 'string' && v.includes(',')) return `"${v}"`;
    return v;
  }).join(','));

  return [header, ...rows].join('\n');
}

/**
 * Exporta como JSONL (una línea por registro) para streaming big data.
 */
export function generateTrainingJSONL(feedbackList) {
  const records = serializeForTraining(feedbackList);
  return records.map(r => JSON.stringify(r)).join('\n');
}