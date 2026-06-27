
/**
 * AI Segmentation Engine - Orquestador principal
 * Versión Browser (ES Modules)
 * Flujo: Imagen → SAM3 → ShapeAnalyzer → StitchClassifier → Resultado
 */

import { SAM3Client } from './sam3-client.js';
import { ShapeAnalyzer } from './shape-analyzer.js';
import { StitchClassifier } from './stitch-classifier.js';

class AISegmentationEngine {
  constructor(config = {}) {
    this.sam3 = new SAM3Client(config.sam3ApiKey);
    this.shapeAnalyzer = new ShapeAnalyzer();
    this.stitchClassifier = new StitchClassifier();
  }

  async analyze(imageBase64, options = {}) {
    const startTime = Date.now();

    try {
      console.log('[AI-Seg] Paso 1: Detección de objetos...');
      const rawRegions = await this.sam3.detectObjects(imageBase64, options.concepts || null);

      if (!rawRegions || rawRegions.length === 0) {
        throw new Error('No se detectaron regiones en la imagen');
      }

      const imgDimensions = this._estimateImageDimensions(rawRegions);

      console.log(`[AI-Seg] Paso 2: Análisis de forma (${rawRegions.length} regiones)...`);
      const analyzedRegions = this.shapeAnalyzer.analyzeRegions(rawRegions, imgDimensions.width, imgDimensions.height);

      console.log('[AI-Seg] Paso 3: Clasificación de stitches...');
      const classifiedRegions = this.stitchClassifier.classifyRegions(analyzedRegions);

      const globalStrategy = this._generateGlobalStrategy(classifiedRegions);
      const warnings = this._generateWarnings(classifiedRegions);
      const colorEstimate = this._estimateColors(classifiedRegions);

      return {
        success: true,
        processingTimeMs: Date.now() - startTime,
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

  _estimateImageDimensions(regions) {
    let maxX = 0, maxY = 0;
    regions.forEach(r => {
      if (r.bbox) { maxX = Math.max(maxX, r.bbox[2]); maxY = Math.max(maxY, r.bbox[3]); }
    });
    return { width: maxX || 800, height: maxY || 600 };
  }

  _generateGlobalStrategy(regions) {
    const stitches = regions.map(r => r.stitch);
    const uniqueStitches = [...new Set(stitches)];
    const executionOrder = ['APPLIQUE', 'TATAMI_FILL', 'ZIGZAG', 'SATIN', 'CONTOUR', 'RUNNING'];
    const ordered = uniqueStitches.sort((a, b) => executionOrder.indexOf(a) - executionOrder.indexOf(b));

    return {
      primaryStitches: ordered,
      recommendedOrder: ordered,
      complexity: regions.length > 5 ? 'high' : regions.length > 3 ? 'medium' : 'low',
      estimatedTime: this._estimateTime(regions)
    };
  }

  _generateWarnings(regions) {
    const warnings = [];
    regions.forEach(r => {
      if (r.stitch === 'SATIN' && r.metrics.area > 15000) {
        warnings.push({
          type: 'warning', region: r.label,
          message: `Región "${r.label}" muy grande (${r.metrics.area}px²) para Satén. Considerar dividir en pasadas.`,
          suggestion: 'Usar splitThreshold=2 o cambiar a Tatami Fill'
        });
      }
      if (r.metrics.curvature > 0.9) {
        warnings.push({
          type: 'info', region: r.label,
          message: `Alta curvatura en "${r.label}" (${r.metrics.curvature.toFixed(2)}).`,
          suggestion: 'Verificar que el satén no se pliegue en los bordes'
        });
      }
      if (r.metrics.area < 200) {
        warnings.push({
          type: 'warning', region: r.label,
          message: `Región "${r.label}" muy pequeña (${r.metrics.area}px²).`,
          suggestion: 'Considerar agrupar con región adyacente o usar Running stitch'
        });
      }
      if (r.confidence < 0.6) {
        warnings.push({
          type: 'info', region: r.label,
          message: `Baja confianza (${(r.confidence * 100).toFixed(0)}%) en clasificación de "${r.label}".`,
          suggestion: 'Revisar manualmente la asignación de stitch'
        });
      }
    });
    return warnings;
  }

  _estimateColors(regions) {
    const baseColors = regions.length;
    const variations = regions.filter(r => r.stitch === 'SATIN' && r.metrics.area > 5000).length;
    return Math.min(baseColors + variations, 15);
  }

  _countStitches(regions) {
    const counts = {};
    regions.forEach(r => { counts[r.stitch] = (counts[r.stitch] || 0) + 1; });
    return counts;
  }

  _avgConfidence(regions) {
    if (regions.length === 0) return 0;
    return parseFloat((regions.reduce((acc, r) => acc + r.confidence, 0) / regions.length).toFixed(2));
  }

  _estimateTime(regions) {
    const totalStitches = regions.reduce((acc, r) => {
      const area = r.metrics.area;
      const density = r.stitchParams?.density || 0.5;
      return acc + (area * density);
    }, 0);
    const minutes = Math.ceil(totalStitches / 1000);
    return { minutes, formatted: `${Math.floor(minutes / 60)}h ${minutes % 60}m` };
  }
}

export { AISegmentationEngine };
