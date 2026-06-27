
/**
 * Shape Analyzer - Métricas de forma para clasificación de stitches
 * Versión Browser (ES Modules)
 */

class ShapeAnalyzer {
  constructor() {
    this.PIXEL_THRESHOLD = 50;
  }

  analyzeRegions(regions, imageWidth, imageHeight) {
    return regions
      .filter(r => this._getMaskArea(r.mask) >= this.PIXEL_THRESHOLD)
      .map(region => {
        const mask = this._parseMask(region.mask, region.bbox);
        const metrics = this._calculateMetrics(mask, region.bbox, imageWidth, imageHeight);
        return { ...region, metrics: { ...region.metrics, ...metrics } };
      });
  }

  _calculateMetrics(mask, bbox, imgWidth, imgHeight) {
    const [minX, minY, maxX, maxY] = bbox;
    const width = maxX - minX;
    const height = maxY - minY;
    const area = this._getMaskArea(mask);

    const perimeter = this._calculatePerimeter(mask, width, height);
    const circularity = (perimeter * perimeter) / (4 * Math.PI * Math.max(area, 1));
    const curvature = this._normalizeCurvature(circularity);
    const bboxArea = width * height;
    const compactness = area / Math.max(bboxArea, 1);
    const aspectRatio = width / Math.max(height, 1);
    const elongation = this._calculateElongation(mask, width, height);
    const distanceToEdge = Math.min(minX, minY, imgWidth - maxX, imgHeight - maxY);
    const relativeDistance = distanceToEdge / Math.max(Math.min(imgWidth, imgHeight) / 2, 1);
    const convexity = this._calculateConvexity(mask, width, height);
    const symmetry = this._calculateSymmetry(mask, width, height);
    const edgeDensity = perimeter / Math.max(area, 1);

    return {
      area, perimeter: Math.round(perimeter),
      width, height,
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

  _normalizeCurvature(circularity) {
    if (circularity <= 1) return 1.0;
    if (circularity >= 20) return 0.0;
    return Math.max(0, Math.min(1, 1 - (Math.log(circularity) / Math.log(20))));
  }

  _calculatePerimeter(mask, width, height) {
    let perimeter = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (mask[y * width + x]) {
          const neighbors = [[x-1,y],[x+1,y],[x,y-1],[x,y+1]];
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

  _calculateElongation(mask, width, height) {
    let cx = 0, cy = 0, count = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (mask[y * width + x]) { cx += x; cy += y; count++; }
      }
    }
    cx /= count; cy /= count;

    let mu20 = 0, mu02 = 0, mu11 = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (mask[y * width + x]) {
          const dx = x - cx, dy = y - cy;
          mu20 += dx * dx; mu02 += dy * dy; mu11 += dx * dy;
        }
      }
    }

    const trace = mu20 + mu02;
    const det = mu20 * mu02 - mu11 * mu11;
    const lambda1 = (trace + Math.sqrt(trace * trace - 4 * det)) / 2;
    const lambda2 = (trace - Math.sqrt(trace * trace - 4 * det)) / 2;
    return Math.sqrt(lambda1 / Math.max(lambda2, 0.001));
  }

  _calculateConvexity(mask, width, height) {
    const area = this._getMaskArea(mask);
    const bboxArea = width * height;
    return area / Math.max(bboxArea * 0.8, 1);
  }

  _calculateSymmetry(mask, width, height) {
    let matches = 0, total = 0;
    const midY = Math.floor(height / 2);
    for (let y = 0; y < midY; y++) {
      for (let x = 0; x < width; x++) {
        const top = mask[y * width + x];
        const bottom = mask[(height - 1 - y) * width + x];
        if (top || bottom) { total++; if (top === bottom) matches++; }
      }
    }
    return total > 0 ? matches / total : 0.5;
  }

  _getMaskArea(mask) {
    if (Array.isArray(mask)) return mask.filter(p => p > 0).length;
    return 0;
  }

  _parseMask(maskData, bbox) {
    if (!maskData || maskData.length === 0) {
      const [minX, minY, maxX, maxY] = bbox;
      return new Uint8Array((maxX - minX) * (maxY - minY)).fill(1);
    }
    return new Uint8Array(maskData);
  }
}

export { ShapeAnalyzer };
