/**
 * Stitch Classifier - Asigna tipo de stitch basado en métricas de forma
 * 
 * Reglas heurísticas v1.0 (evolucionar a ML más adelante)
 * 
 * STITCH TYPES:
 * - SATIN: Curvatura alta, compacto, área mediana (nariz, ojo)
 * - TATAMI_FILL: Área grande, baja curvatura, relleno uniforme (cuerpo)
 * - RUNNING: Elongado, pequeño, detalles de contorno
 * - CONTOUR: Cerca del borde, delgado, define límites
 * - ZIGZAG: Área mediana, curvatura media, textura
 * - APPLIQUE: Área muy grande, poca curvatura, base sólida
 */

class StitchClassifier {
  constructor() {
    this.STITCH_TYPES = {
      SATIN: 'SATIN',
      TATAMI_FILL: 'TATAMI_FILL',
      RUNNING: 'RUNNING',
      CONTOUR: 'CONTOUR',
      ZIGZAG: 'ZIGZAG',
      APPLIQUE: 'APPLIQUE'
    };
  }

  /**
   * Clasifica todas las regiones
   * @param {Array} regions - Regiones con métricas del ShapeAnalyzer
   * @returns {Array} - Regiones con stitch asignado
   */
  classifyRegions(regions) {
    return regions.map(region => {
      const classification = this._classifySingleRegion(region.metrics, region.label);
      
      return {
        ...region,
        stitch: classification.stitch,
        confidence: classification.confidence,
        reason: classification.reason,
        stitchParams: classification.params
      };
    });
  }

  /**
   * Clasifica una sola región basada en sus métricas
   */
  _classifySingleRegion(m, label) {
    // Scores para cada tipo de stitch
    const scores = {
      [this.STITCH_TYPES.SATIN]: 0,
      [this.STITCH_TYPES.TATAMI_FILL]: 0,
      [this.STITCH_TYPES.RUNNING]: 0,
      [this.STITCH_TYPES.CONTOUR]: 0,
      [this.STITCH_TYPES.ZIGZAG]: 0,
      [this.STITCH_TYPES.APPLIQUE]: 0
    };

    // ===== REGLAS DE CLASIFICACIÓN =====

    // 1. SATÍN: Curvatura alta + compacto + área mediana
    if (m.curvature > 0.5 && m.compactness > 0.3) {
      scores.SATIN += m.curvature * 0.4 + m.compactness * 0.3;
      if (m.area > 500 && m.area < 20000) scores.SATIN += 0.2;
      if (m.convexity > 0.6) scores.SATIN += 0.1;
    }

    // 2. TATAMI FILL: Área grande + baja curvatura
    if (m.area > 8000) {
      scores.TATAMI_FILL += 0.3;
      if (m.curvature < 0.4) scores.TATAMI_FILL += 0.3;
      if (m.aspectRatio < 2.5) scores.TATAMI_FILL += 0.2;
      if (m.compactness > 0.4) scores.TATAMI_FILL += 0.1;
    }

    // 3. RUNNING: Elongado + pequeño
    if (m.elongation > 2.5 || m.aspectRatio > 3) {
      scores.RUNNING += 0.3;
      if (m.area < 3000) scores.RUNNING += 0.3;
      if (m.edgeDensity > 0.05) scores.RUNNING += 0.2;
    }

    // 4. CONTOUR: Cerca del borde + delgado
    if (m.relativeDistance < 0.15 && m.area < 2000) {
      scores.CONTOUR += 0.4;
      if (m.edgeDensity > 0.08) scores.CONTOUR += 0.2;
    }

    // 5. ZIGZAG: Área mediana + curvatura media
    if (m.area > 2000 && m.area < 15000 && m.curvature > 0.3 && m.curvature < 0.7) {
      scores.ZIGZAG += 0.3;
      if (m.symmetry < 0.7) scores.ZIGZAG += 0.2; // Asimétrico
    }

    // 6. APPLIQUE: Área muy grande + base sólida
    if (m.area > 30000) {
      scores.APPLIQUE += 0.5;
      if (m.compactness > 0.5) scores.APPLIQUE += 0.2;
    }

    // ===== AJUSTES POR ETIQUETA SEMÁNTICA =====
    const semanticBoost = this._semanticBoost(label, scores);
    Object.keys(semanticBoost).forEach(key => {
      scores[key] += semanticBoost[key];
    });

    // Encontrar el mejor score
    let bestStitch = this.STITCH_TYPES.TATAMI_FILL;
    let bestScore = -1;
    
    Object.entries(scores).forEach(([stitch, score]) => {
      if (score > bestScore) {
        bestScore = score;
        bestStitch = stitch;
      }
    });

    // Calcular confianza (0-1)
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidence = totalScore > 0 ? bestScore / totalScore : 0.5;
    
    // Generar parámetros específicos del stitch
    const params = this._generateStitchParams(bestStitch, m);

    return {
      stitch: bestStitch,
      confidence: parseFloat(confidence.toFixed(2)),
      reason: this._generateReason(bestStitch, m, scores),
      params,
      allScores: Object.fromEntries(
        Object.entries(scores).map(([k, v]) => [k, parseFloat(v.toFixed(2))])
      )
    };
  }

  /**
   * Boost semántico basado en etiqueta del objeto
   */
  _semanticBoost(label, currentScores) {
    const boosts = {};
    
    const semanticRules = {
      'nose': { SATIN: 0.3, TATAMI_FILL: -0.1 },
      'eye': { SATIN: 0.4, CONTOUR: 0.2 },
      'mouth': { SATIN: 0.2, RUNNING: 0.1 },
      'body': { TATAMI_FILL: 0.3, APPLIQUE: 0.1 },
      'head': { TATAMI_FILL: 0.2, SATIN: 0.1 },
      'ear': { SATIN: 0.2, CONTOUR: 0.1 },
      'pupil': { SATIN: 0.5 },
      'iris': { SATIN: 0.3, ZIGZAG: 0.1 },
      'highlight': { SATIN: 0.4 },
      'outline': { CONTOUR: 0.5, RUNNING: 0.2 }
    };

    const rule = semanticRules[label?.toLowerCase()];
    if (rule) {
      Object.assign(boosts, rule);
    }

    return boosts;
  }

  /**
   * Genera parámetros específicos para cada tipo de stitch
   */
  _generateStitchParams(stitch, metrics) {
    const baseParams = {
      density: 0.4,        // Densidad de puntadas (0-1)
      stitchLength: 2.5,   // Longitud de puntada en mm
      pullCompensation: 0.1 // Compensación de tensión
    };

    switch (stitch) {
      case 'SATIN':
        return {
          ...baseParams,
          density: Math.min(0.8, 0.4 + metrics.curvature * 0.3),
          stitchLength: Math.max(1.5, 3.5 - metrics.curvature),
          angle: this._calculateSatinAngle(metrics),
          splitThreshold: metrics.area > 10000 ? 2 : 1, // Dividir en pasadas si es grande
          pullCompensation: metrics.curvature > 0.7 ? 0.15 : 0.1
        };

      case 'TATAMI_FILL':
        return {
          ...baseParams,
          density: 0.5,
          stitchLength: 3.0,
          angle: 45, // Ángulo estándar para tatami
          pattern: 'standard', // standard, ripple, random
          gap: 0.3, // Espacio entre líneas
          underlay: true
        };

      case 'RUNNING':
        return {
          ...baseParams,
          density: 0.3,
          stitchLength: Math.min(2.0, Math.max(1.0, metrics.elongation * 0.5)),
          tripleStitch: metrics.elongation > 4, // Triple para líneas largas
          cornerStrategy: metrics.curvature > 0.5 ? 'rounded' : 'sharp'
        };

      case 'CONTOUR':
        return {
          ...baseParams,
          density: 0.6,
          stitchLength: 1.5,
          width: Math.max(1, Math.min(3, metrics.area / metrics.perimeter)),
          underlay: true,
          overlap: 0.2
        };

      case 'ZIGZAG':
        return {
          ...baseParams,
          density: 0.5,
          stitchLength: 2.0,
          amplitude: Math.min(2, metrics.area / 5000),
          frequency: 3
        };

      case 'APPLIQUE':
        return {
          ...baseParams,
          density: 0.3,
          stitchLength: 3.0,
          tackDown: true,
          borderStitch: 'SATIN',
          borderWidth: 2.0
        };

      default:
        return baseParams;
    }
  }

  /**
   * Calcula ángulo óptimo para satén basado en la forma
   */
  _calculateSatinAngle(metrics) {
    // Ángulo perpendicular a la dirección de elongación
    if (metrics.elongation > 1.5) {
      return metrics.aspectRatio > 1 ? 90 : 0;
    }
    // Para formas redondeadas, usar ángulo que maximice cobertura
    return 45;
  }

  /**
   * Genera texto explicativo de la decisión
   */
  _generateReason(stitch, metrics, allScores) {
    const reasons = {
      SATIN: `Curvatura alta (${metrics.curvature.toFixed(2)}), forma compacta (${metrics.compactness.toFixed(2)}), área mediana (${metrics.area}px²)`,
      TATAMI_FILL: `Área grande (${metrics.area}px²), baja curvatura (${metrics.curvature.toFixed(2)}), relleno uniforme`,
      RUNNING: `Forma elongada (ratio ${metrics.aspectRatio.toFixed(2)}), pequeño (${metrics.area}px²), detalle de contorno`,
      CONTOUR: `Cerca del borde (dist ${metrics.distanceToEdge}px), delgado, define límites`,
      ZIGZAG: `Área mediana (${metrics.area}px²), curvatura intermedia (${metrics.curvature.toFixed(2)}), textura`,
      APPLIQUE: `Área muy grande (${metrics.area}px²), base sólida, poca curvatura`
    };

    return reasons[stitch] || 'Clasificación por defecto';
  }
}

module.exports = { StitchClassifier };
