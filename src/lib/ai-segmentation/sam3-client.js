/**
 * SAM 3 Client - Detección semántica de objetos
 * Versión Browser-only (sin dependencias de Node.js)
 */

class SAM3Client {
  constructor(apiKey = null) {
    this.apiKey = apiKey;
    this.apiUrl = 'https://api.segment-anything.com/v1';
    this.useLocalFallback = !apiKey;
  }

  async detectObjects(imageBase64, concepts = null) {
    if (this.useLocalFallback) {
      console.log('[SAM3] Usando fallback local');
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
      console.warn('[SAM3] Fallback por error:', error.message);
      return this._localSegmentation(imageBase64, concepts);
    }
  }

  async _localSegmentation(imageBase64, concepts) {
    const imageData = await this._base64ToImageData(imageBase64);
    const { width, height, data } = imageData;

    const edges = this._detectEdges(data, width, height);
    const regions = this._findConnectedRegions(edges, data, width, height);
    const classifiedRegions = this._classifyRegionsByShape(regions, concepts);

    return classifiedRegions;
  }

  async _base64ToImageData(base64) {
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

  _detectEdges(pixels, width, height) {
    const edges = new Uint8Array(width * height);
    const threshold = 30;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        const gx = (
          Math.abs(pixels[idx] - pixels[idx + 4]) +
          Math.abs(pixels[idx + 1] - pixels[idx + 5]) +
          Math.abs(pixels[idx + 2] - pixels[idx + 6])
        ) / 3;
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

  _findConnectedRegions(edges, pixels, width, height) {
    const visited = new Uint8Array(width * height);
    const regions = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (edges[idx] === 0 && !visited[idx]) {
          const region = this._floodFill(x, y, edges, visited, width, height);
          if (region.pixels.length > 100) regions.push(region);
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
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);

      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }

    return { pixels, bbox: [minX, minY, maxX, maxY], width: maxX - minX, height: maxY - minY };
  }

  _classifyRegionsByShape(regions, concepts) {
    const sorted = regions.sort((a, b) => b.pixels.length - a.pixels.length);
    const labels = concepts || ['body', 'head', 'eye', 'nose', 'mouth', 'ear'];

    return sorted.map((region, i) => {
      const label = labels[Math.min(i, labels.length - 1)] || `region_${i}`;
      const aspectRatio = region.width / Math.max(region.height, 1);
      const area = region.pixels.length;

      const mask = new Uint8Array(region.width * region.height);
      region.pixels.forEach(p => {
        const mx = p.x - region.bbox[0];
        const my = p.y - region.bbox[1];
        mask[my * region.width + mx] = 1;
      });

      return {
        label,
        mask: Array.from(mask),
        bbox: region.bbox,
        confidence: 0.6 + (i === 0 ? 0.3 : 0),
        metrics: { area, width: region.width, height: region.height, aspectRatio: parseFloat(aspectRatio.toFixed(2)) }
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

export { SAM3Client };
