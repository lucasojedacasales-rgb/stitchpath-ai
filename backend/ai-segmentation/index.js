/**
 * AI Segmentation Engine - Orquestador principal
 * 
 * Flujo: Imagen → SAM3 → ShapeAnalyzer → StitchClassifier → Resultado
 */

const { SAM3Client } = require('./sam3-client');
const { ShapeAnalyzer } = require('./shape-analyzer');
const { StitchClassifier } = require('./stitch-classifier');

class AISegmentationEngine {
  constructor(config = {}) {
    this.sam3 = new SAM3Client(config.sam3ApiKey);
    this.shapeAnalyzer = new ShapeAnalyzer();
    this.stitchClassifier = new StitchClassifier();
  }

  /**
   * Analiza una imagen completa y devuelve regiones con stitches asignados
   * 
   * @param {string} imageBase64 - Imagen en base64
   * @param {Object} options - Opciones de análisis
   * @returns {Promise<Object>} - Resultado completo del análisis
   */
  async analyze(imageBase64, options = {}) {
    const startTime = Date.now();
    
    try {
      // 1. Detectar objetos/regiones
      console.log('[AI-Seg] Paso 1: Detección de objetos...');
      const rawRegions = await this.sam3.detectObjects(
        imageBase64, 
        options.concepts || null
      );
      
      if (!rawRegions || rawRegions.length === 0) {
        throw new Error('No se detectaron regiones en la imagen');
      }

      // Obtener dimensiones de la imagen (del primer bbox o estimado)
      const imgDimensions = this._estimateImageDimensions(rawRegions);

      // 2. Analizar forma de cada región
      console.log(`[AI-Seg] Paso 2: Análisis de forma (${rawRegions.length} regiones)...`);
      const analyzedRegions = this.shapeAnalyzer.analyzeRegions(
        rawRegions,
        imgDimensions.width,
        imgDimensions.height
      );

      // 3. Clasificar stitch para cada región
      console.log('[AI-Seg] Paso 3: Clasificación de stitches...');
      const classifiedRegions = this.stitchClassifier.classifyRegions(analyzedRegions);

      // 4. Generar estrategia global
      const globalStrategy = this._generateGlobalStrategy(classifiedRegions);

      // 5. Generar advertencias
      const warnings = this._generateWarnings(classifiedRegions);

      // 6. Estimar colores (basado en regiones, no píxeles)
      const colorEstimate = this._estimateColors(classifiedRegions);

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        processingTimeMs: processingTime,
        imageDimensions: imgDimensions,
        globalStrategy,
        colorEstimate,
        warnings,
        regions: classifiedRegions.map(r => ({
          id: `region_${Math.random().toString(36).substr(2, 9)}`,
          label: r.label,
          bbox: r.bbox,
          confidence: r.confidence,
          stitch: r.stitch,
          stitchConfidence: r.confidence,
          reason: r.reason,
          stitchParams: r.stitchParams,
          metrics: r.metrics,
          allScores: r.allScores
        })),
        summary: {
          totalRegions: classifiedRegions.length,
          stitchesByType: this._countStitches(classifiedRegions),
          avgConfidence: this._avgConfidence(classifiedRegions)
        }
      };

    } catch (error) {
      console.error('[AI-Seg] Error:', error);
      return {
        success: false,
        error: error.message,
        processingTimeMs: Date.now() - startTime,
        regions: []
      };
    }
  }

  /**
   * Estima dimensiones de la imagen a partir de los bboxes de las regiones
   */
  _estimateImageDimensions(regions) {
    let maxX = 0, maxY = 0;
    regions.forEach(r => {
      if (r.bbox) {
        maxX = Math.max(maxX, r.bbox[2]);
        maxY = Math.max(maxY, r.bbox[3]);
      }
    });
    return { width: maxX || 800, height: maxY || 600 };
  }

  /**
   * Genera estrategia global de bordado
   */
  _generateGlobalStrategy(regions) {
    const stitches = regions.map(r => r.stitch);
    const uniqueStitches = [...new Set(stitches)];
    
    // Orden de ejecución recomendado
    const executionOrder = ['APPLIQUE', 'TATAMI_FILL', 'ZIGZAG', 'SATIN', 'CONTOUR', 'RUNNING'];
    const ordered = uniqueStitches.sort((a, b) => {
      return executionOrder.indexOf(a) - executionOrder.indexOf(b);
    });

    return {
      primaryStitches: ordered,
      recommendedOrder: ordered,
      complexity: regions.length > 5 ? 'high' : regions.length > 3 ? 'medium' : 'low',
      estimatedTime: this._estimateTime(regions)
    };
  }

  /**
   * Genera advertencias basadas en el análisis
   */
  _generateWarnings(regions) {
    const warnings = [];

    regions.forEach(r => {
      // Advertencia: región muy grande con satén
      if (r.stitch === 'SATIN' && r.metrics.area > 15000) {
        warnings.push({
          type: 'warning',
          region: r.label,
          message: `Región "${r.label}" es muy grande (${r.metrics.area}px²) para Satén. Considerar dividir en pasadas.`,
          suggestion: 'Usar splitThreshold=2 o cambiar a Tatami Fill'
        });
      }

      // Advertencia: curvatura extrema
      if (r.metrics.curvature > 0.9) {
        warnings.push({
          type: 'info',
          region: r.label,
          message: `Alta curvatura en "${r.label}" (${r.metrics.curvature.toFixed(2)}).`,
          suggestion: 'Verificar que el satén no se pliegue en los bordes'
        });
      }

      // Advertencia: región muy pequeña
      if (r.metrics.area < 200) {
        warnings.push({
          type: 'warning',
          region: r.label,
          message: `Región "${r.label}" muy pequeña (${r.metrics.area}px²).`,
          suggestion: 'Considerar agrupar con región adyacente o usar Running stitch'
        });
      }

      // Advertencia: baja confianza en la clasificación
      if (r.confidence < 0.6) {
        warnings.push({
          type: 'info',
          region: r.label,
          message: `Baja confianza (${(r.confidence * 100).toFixed(0)}%) en clasificación de "${r.label}".`,
          suggestion: 'Revisar manualmente la asignación de stitch'
        });
      }
    });

    return warnings;
  }

  /**
   * Estima número de colores basado en regiones
   */
  _estimateColors(regions) {
    // Agrupar por proximidad de color (simulado - en producción usaría análisis real)
    // Por ahora: 1 color por región principal, con posibles variaciones
    const baseColors = regions.length;
    const variations = regions.filter(r => 
      r.stitch === 'SATIN' && r.metrics.area > 5000
    ).length; // Grandes regiones de satén pueden tener degradados
    
    return Math.min(baseColors + variations, 15);
  }

  /**
   * Cuenta stitches por tipo
   */
  _countStitches(regions) {
    const counts = {};
    regions.forEach(r => {
      counts[r.stitch] = (counts[r.stitch] || 0) + 1;
    });
    return counts;
  }

  /**
   * Calcula confianza promedio
   */
  _avgConfidence(regions) {
    if (regions.length === 0) return 0;
    const sum = regions.reduce((acc, r) => acc + r.confidence, 0);
    return parseFloat((sum / regions.length).toFixed(2));
  }

  /**
   * Estima tiempo de bordado (muy aproximado)
   */
  _estimateTime(regions) {
    // ~1000 puntadas por minuto en máquina estándar
    const totalStitches = regions.reduce((acc, r) => {
      const area = r.metrics.area;
      const density = r.stitchParams?.density || 0.5;
      return acc + (area * density);
    }, 0);
    
    const minutes = Math.ceil(totalStitches / 1000);
    return { minutes, formatted: `${Math.floor(minutes / 60)}h ${minutes % 60}m` };
  }
}

module.exports = { AISegmentationEngine };
