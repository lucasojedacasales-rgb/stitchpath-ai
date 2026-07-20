/**
 * SAM 3 Client - Detección semántica de objetos
 * Usa la API de Segment Anything Model 3 o alternativa
 * 
 * Fallback: Si no hay API de SAM 3 disponible, usa
 * un enfoque híbrido con Canvas + análisis de contornos
 */

class SAM3Client {
  constructor(apiKey = null) {
    this.apiKey = apiKey;
    this.apiUrl = 'https://api.segment-anything.com/v1'; // URL ejemplo
    this.useLocalFallback = !apiKey;
  }

  /**
   * Detecta objetos semánticos en una imagen
   * @param {string} imageBase64 - Imagen en base64
   * @param {Array<string>} concepts - Conceptos a buscar (opcional)
   * @returns {Promise<Array>} - Array de regiones detectadas
   */
  async detectObjects(imageBase64, concepts = null) {
    if (this.useLocalFallback) {
      console.log('[SAM3] Usando fallback local (sin API key)');
      return this._localSegmentation(imageBase64, concepts);
    }

    try {
      const response = await fetch(`${this.apiUrl}/segment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          image: imageBase64,
          prompt_type: 'semantic',
          concepts: concepts || ['nose', 'eye', 'body', 'mouth', 'ear', 'head'],
          return_masks: true,
          return_bboxes: true
        })
      });

      if (!response.ok) throw new Error(`SAM3 API error: ${response.status}`);
      
      const data = await response.json();
      return this._normalizeRegions(data.regions || []);
      
    } catch (error) {
      console.warn('[SAM3] Error en API, usando fallback:', error.message);
      return this._localSegmentation(imageBase64, concepts);
    }
  }

  /**
   * Fallback local: Segmentación por contornos + heurísticas
   * No es semántico real, pero funciona para prototipar
   */
  async _localSegmentation(imageBase64, concepts) {
    // Convertir base64 a ImageData
    const imageData = await this._base64ToImageData(imageBase64);
    const { width, height, data } = imageData;
    
    // Detección de contornos por diferencia de color (Canny simplificado)
    const edges = this._detectEdges(data, width, height);
    
    // Encontrar regiones conectadas
    const regions = this._findConnectedRegions(edges, data, width, height);
    
    // Clasificar regiones por forma/tamaño (simulación semántica)
    const classifiedRegions = this._classifyRegionsByShape(regions, concepts);
    
    return classifiedRegions;
  }

  /**
   * Convierte base64 a ImageData usando Canvas (Node.js compatible)
   */
  async _base64ToImageData(base64) {
    // En browser: usar canvas
    if (typeof document !== 'undefined') {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          resolve(ctx.getImageData(0, 0, img.width, img.height));
        };
        img.onerror = reject;
        img.src = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
      });
    }
    
    // En Node.js: usar sharp o similar (instalar: npm install sharp)
    try {
      const sharp = require('sharp');
      const buffer = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      const { data, info } = await sharp(buffer)
        .raw()
        .ensureAlpha()
        .toBuffer({ resolveWithObject: true });
      
      return {
        data: new Uint8ClampedArray(data),
        width: info.width,
        height: info.height
      };
    } catch (e) {
      throw new Error('Instala sharp para Node.js: npm install sharp');
    }
  }

  /**
   * Detección de bordes simplificada (Sobel)
   */
  _detectEdges(pixels, width, height) {
    const edges = new Uint8Array(width * height);
    const threshold = 30;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        
        // Gradiente horizontal
        const gx = (
          Math.abs(pixels[idx] - pixels[idx + 4]) +
          Math.abs(pixels[idx + 1] - pixels[idx + 5]) +
          Math.abs(pixels[idx + 2] - pixels[idx + 6])
        ) / 3;
        
        // Gradiente vertical
        const gy = (
          Math.abs(pixels[idx] - pixels[idx + width * 4]) +
          Math.abs(pixels[idx + 1] - pixels[idx + width * 4 + 1]) +
          Math.abs(pixels[idx + 2] - pixels[idx + width * 4 + 2])
        ) / 3;
        
        const gradient = Math.sqrt(gx * gx + gy * gy);
        edges[y * width + x] = gradient > threshold ? 255 : 0;
      }
    }
    
    return edges;
  }

  /**
   * Encuentra regiones conectadas usando flood fill
   */
  _findConnectedRegions(edges, pixels, width, height) {
    const visited = new Uint8Array(width * height);
    const regions = [];
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (edges[idx] === 0 && !visited[idx]) {
          const region = this._floodFill(x, y, edges, visited, width, height);
          if (region.pixels.length > 100) { // Filtrar ruido
            regions.push(region);
          }
        }
      }
    }
    
    return regions;
  }

  _floodFill(startX, startY, edges, visited, width, height) {
    const stack = [[startX, startY]];
    const pixels = [];
    let minX = startX, maxX = startX, minY = startY, maxY = startY;
    
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      const idx = y * width + x;
      
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      if (visited[idx]) continue;
      if (edges[idx] === 255) continue;
      
      visited[idx] = 1;
      pixels.push({ x, y, idx });
      
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    
    return {
      pixels,
      bbox: [minX, minY, maxX, maxY],
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * Clasifica regiones por forma para simular etiquetado semántico
   */
  _classifyRegionsByShape(regions, concepts) {
    const sorted = regions.sort((a, b) => b.pixels.length - a.pixels.length);
    const labels = concepts || ['body', 'head', 'eye', 'nose', 'mouth', 'ear'];
    
    return sorted.map((region, i) => {
      const label = labels[Math.min(i, labels.length - 1)] || `region_${i}`;
      const aspectRatio = region.width / Math.max(region.height, 1);
      const area = region.pixels.length;
      
      // Generar máscara como array binario
      const mask = new Uint8Array(region.width * region.height);
      region.pixels.forEach(p => {
        const mx = p.x - region.bbox[0];
        const my = p.y - region.bbox[1];
        mask[my * region.width + mx] = 1;
      });
      
      return {
        label,
        mask: Array.from(mask), // Convertir a array normal para JSON
        bbox: region.bbox,
        confidence: 0.6 + (i === 0 ? 0.3 : 0), // Mayor confianza en la región más grande
        metrics: {
          area,
          width: region.width,
          height: region.height,
          aspectRatio: parseFloat(aspectRatio.toFixed(2))
        }
      };
    });
  }

  _normalizeRegions(regions) {
    return regions.map(r => ({
      label: r.label || 'unknown',
      mask: r.mask || [],
      bbox: r.bbox || [0, 0, 0, 0],
      confidence: r.confidence || 0.5,
      metrics: r.metrics || {}
    }));
  }
}

module.exports = { SAM3Client };
