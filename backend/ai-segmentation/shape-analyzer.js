/**
 * Shape Analyzer - Calcula métricas de forma para cada región
 * Determina: curvatura, compacidad, elongación, proximidad al borde
 */

class ShapeAnalyzer {
  constructor() {
    this.PIXEL_THRESHOLD = 50; // Mínimo de píxeles para considerar región válida
  }

  /**
   * Analiza todas las regiones detectadas
   * @param {Array} regions - Regiones del SAM3Client
   * @param {number} imageWidth - Ancho total de la imagen
   * @param {number} imageHeight - Alto total de la imagen
   * @returns {Array} - Regiones con métricas calculadas
   */
  analyzeRegions(regions, imageWidth, imageHeight) {
    return regions
      .filter(r => this._getMaskArea(r.mask) >= this.PIXEL_THRESHOLD)
      .map(region => {
        const mask = this._parseMask(region.mask, region.bbox);
        const metrics = this._calculateMetrics(mask, region.bbox, imageWidth, imageHeight);
        
        return {
          ...region,
          metrics: {
            ...region.metrics,
            ...metrics
          }
        };
      });
  }

  /**
   * Calcula métricas completas de forma
   */
  _calculateMetrics(mask, bbox, imgWidth, imgHeight) {
    const [minX, minY, maxX, maxY] = bbox;
    const width = maxX - minX;
    const height = maxY - minY;
    const area = this._getMaskArea(mask);
    
    // Perímetro (contorno de la máscara)
    const perimeter = this._calculatePerimeter(mask, width, height);
    
    // Curvatura: ratio de perímetro² / (4π × área)
    // 1 = círculo perfecto, >1 = más irregular
    const circularity = (perimeter * perimeter) / (4 * Math.PI * Math.max(area, 1));
    const curvature = this._normalizeCurvature(circularity);
    
    // Compacidad: área / área del bounding box
    const bboxArea = width * height;
    const compactness = area / Math.max(bboxArea, 1);
    
    // Relación de aspecto
    const aspectRatio = width / Math.max(height, 1);
    
    // Elongación: (longitud eje mayor) / (longitud eje menor)
    const elongation = this._calculateElongation(mask, width, height);
    
    // Distancia al borde de la imagen
    const distanceToEdge = Math.min(minX, minY, imgWidth - maxX, imgHeight - maxY);
    const relativeDistance = distanceToEdge / Math.max(Math.min(imgWidth, imgHeight) / 2, 1);
    
    // Convexidad: área / área del convex hull
    const convexity = this._calculateConvexity(mask, width, height);
    
    // Simetría (eje horizontal vs vertical)
    const symmetry = this._calculateSymmetry(mask, width, height);
    
    // Densidad de bordes (cuánto detalle tiene el contorno)
    const edgeDensity = perimeter / Math.max(area, 1);
    
    return {
      area,
      perimeter: Math.round(perimeter),
      width,
      height,
      aspectRatio: parseFloat(aspectRatio.toFixed(2)),
      elongation: parseFloat(elongation.toFixed(2)),
      curvature: parseFloat(curvature.toFixed(2)),
      compactness: parseFloat(compactness.toFixed(2)),
      convexity: parseFloat(convexity.toFixed(2)),
      symmetry: parseFloat(symmetry.toFixed(2)),
      distanceToEdge: Math.round(distanceToEdge),
      relativeDistance: parseFloat(relativeDistance.toFixed(2)),
      edgeDensity: parseFloat(edgeDensity.toFixed(4))
    };
  }

  /**
   * Normaliza curvatura a escala 0-1
   * 1 = muy curvo/redondeado, 0 = angular/recto
   */
  _normalizeCurvature(circularity) {
    // circularity: 1 = círculo, ∞ = línea
    // Mapear: 1→1.0, 2→0.8, 5→0.5, 10→0.2, 20→0.1
    if (circularity <= 1) return 1.0;
    if (circularity >= 20) return 0.0;
    
    return Math.max(0, Math.min(1, 1 - (Math.log(circularity) / Math.log(20))));
  }

  /**
   * Calcula perímetro de la máscara (algoritmo de contorno)
   */
  _calculatePerimeter(mask, width, height) {
    let perimeter = 0;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (mask[y * width + x]) {
          // Contar vecinos vacíos
          const neighbors = [
            [x-1, y], [x+1, y], [x, y-1], [x, y+1]
          ];
          const emptyNeighbors = neighbors.filter(([nx, ny]) => {
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) return true;
            return !mask[ny * width + nx];
          }).length;
          
          if (emptyNeighbors > 0) perimeter += emptyNeighbors / 2;
        }
      }
    }
    
    return perimeter;
  }

  /**
   * Calcula elongación usando momentos de inercia
   */
  _calculateElongation(mask, width, height) {
    // Centro de masa
    let cx = 0, cy = 0, count = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (mask[y * width + x]) {
          cx += x;
          cy += y;
          count++;
        }
      }
    }
    cx /= count;
    cy /= count;
    
    // Momentos de inercia
    let mu20 = 0, mu02 = 0, mu11 = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (mask[y * width + x]) {
          const dx = x - cx;
          const dy = y - cy;
          mu20 += dx * dx;
          mu02 += dy * dy;
          mu11 += dx * dy;
        }
      }
    }
    
    // Autovalores de la matriz de inercia
    const trace = mu20 + mu02;
    const det = mu20 * mu02 - mu11 * mu11;
    const lambda1 = (trace + Math.sqrt(trace * trace - 4 * det)) / 2;
    const lambda2 = (trace - Math.sqrt(trace * trace - 4 * det)) / 2;
    
    return Math.sqrt(lambda1 / Math.max(lambda2, 0.001));
  }

  /**
   * Calcula convexidad simplificada
   */
  _calculateConvexity(mask, width, height) {
    const area = this._getMaskArea(mask);
    // Aproximación: área del bounding box como upper bound del convex hull
    const bboxArea = width * height;
    return area / Math.max(bboxArea * 0.8, 1); // 0.8 = factor de aproximación
  }

  /**
   * Calcula simetría horizontal
   */
  _calculateSymmetry(mask, width, height) {
    let matches = 0, total = 0;
    const midY = Math.floor(height / 2);
    
    for (let y = 0; y < midY; y++) {
      for (let x = 0; x < width; x++) {
        const top = mask[y * width + x];
        const bottom = mask[(height - 1 - y) * width + x];
        if (top || bottom) {
          total++;
          if (top === bottom) matches++;
        }
      }
    }
    
    return total > 0 ? matches / total : 0.5;
  }

  /**
   * Obtiene área de una máscara
   */
  _getMaskArea(mask) {
    if (Array.isArray(mask)) {
      return mask.filter(p => p > 0).length;
    }
    return 0;
  }

  /**
   * Parsea máscara del formato de SAM al formato interno
   */
  _parseMask(maskData, bbox) {
    if (!maskData || maskData.length === 0) {
      const [minX, minY, maxX, maxY] = bbox;
      return new Uint8Array((maxX - minX) * (maxY - minY)).fill(1);
    }
    return new Uint8Array(maskData);
  }
}

module.exports = { ShapeAnalyzer };
