/**
 * FASE 1: PREPROCESADO
 * Eliminación de ruido, suavizado, detección de colores, fusión de regiones pequeñas
 */

export function preprocessImage(pixelArray, width, height, options = {}) {
  const {
    colorCount = 6,
    minRegionArea = 0.01,
    noiseKernel = 3,
    smoothIterations = 2
  } = options;

  // 1. Eliminar ruido (morphological opening)
  let processed = morphologicalDenoise(pixelArray, width, height, noiseKernel);

  // 2. Suavizar bordes (Gaussian blur)
  for (let i = 0; i < smoothIterations; i++) {
    processed = gaussianBlur(processed, width, height);
  }

  // 3. Cuantizar a colores dominantes
  const palette = quantizeColors(processed, width, height, colorCount);
  const quantized = assignToPalette(processed, palette, width, height);

  // 4. Calcular área total y umbral mínimo
  const totalPixels = width * height;
  const minArea = totalPixels * minRegionArea;

  // 5. Fusionar regiones pequeñas con vecinos más cercanos
  const merged = mergeSmallRegions(quantized, palette, width, height, minArea);

  return {
    pixels: merged,
    palette,
    width,
    height
  };
}

function morphologicalDenoise(pixelArray, width, height, kernel = 3) {
  const radius = Math.floor(kernel / 2);
  const result = new Uint8ClampedArray(pixelArray);

  // Erosión
  for (let iter = 0; iter < 1; iter++) {
    const temp = new Uint8ClampedArray(pixelArray.length);
    for (let i = 0; i < pixelArray.length; i += 4) {
      const idx = i / 4;
      const x = idx % width;
      const y = Math.floor(idx / width);
      let minAlpha = 255;

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = (ny * width + nx) * 4;
            minAlpha = Math.min(minAlpha, pixelArray[nIdx + 3]);
          }
        }
      }

      temp[i + 3] = minAlpha;
      temp[i] = pixelArray[i];
      temp[i + 1] = pixelArray[i + 1];
      temp[i + 2] = pixelArray[i + 2];
    }
    for (let i = 0; i < pixelArray.length; i++) {
      result[i] = temp[i];
    }
  }

  return result;
}

function gaussianBlur(pixelArray, width, height) {
  const kernel = [
    [1, 4, 6, 4, 1],
    [4, 16, 24, 16, 4],
    [6, 24, 36, 24, 6],
    [4, 16, 24, 16, 4],
    [1, 4, 6, 4, 1]
  ];

  const sum = kernel.flat().reduce((a, b) => a + b, 0);
  const result = new Uint8ClampedArray(pixelArray);
  const radius = 2;

  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      let r = 0, g = 0, b = 0;

      for (let ky = -radius; ky <= radius; ky++) {
        for (let kx = -radius; kx <= radius; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          const weight = kernel[ky + radius][kx + radius];
          r += pixelArray[idx] * weight;
          g += pixelArray[idx + 1] * weight;
          b += pixelArray[idx + 2] * weight;
        }
      }

      const idx = (y * width + x) * 4;
      result[idx] = Math.round(r / sum);
      result[idx + 1] = Math.round(g / sum);
      result[idx + 2] = Math.round(b / sum);
    }
  }

  return result;
}

function quantizeColors(pixelArray, width, height, maxColors) {
  const colorCounts = new Map();

  for (let i = 0; i < pixelArray.length; i += 4) {
    const a = pixelArray[i + 3];
    if (a < 128) continue;

    const r = pixelArray[i];
    const g = pixelArray[i + 1];
    const b = pixelArray[i + 2];
    const hex = rgbToHex(r, g, b);

    colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
  }

  return Array.from(colorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxColors)
    .map(([hex]) => hex);
}

function assignToPalette(pixelArray, palette, width, height) {
  const result = new Uint8Array(width * height);

  for (let i = 0; i < pixelArray.length; i += 4) {
    const a = pixelArray[i + 3];
    if (a < 128) {
      result[i / 4] = 255; // Transparencia
      continue;
    }

    const r = pixelArray[i];
    const g = pixelArray[i + 1];
    const b = pixelArray[i + 2];
    const hex = rgbToHex(r, g, b);

    let nearestIdx = 0;
    let minDist = Infinity;

    for (let j = 0; j < palette.length; j++) {
      const dist = colorDistance(hex, palette[j]);
      if (dist < minDist) {
        minDist = dist;
        nearestIdx = j;
      }
    }

    result[i / 4] = nearestIdx;
  }

  return result;
}

function mergeSmallRegions(quantized, palette, width, height, minArea) {
  const result = new Uint8Array(quantized);
  const visited = new Set();

  for (let i = 0; i < quantized.length; i++) {
    if (visited.has(i) || quantized[i] === 255) continue;

    const x = i % width;
    const y = Math.floor(i / width);
    const regionColor = quantized[i];

    // Flood fill para encontrar región
    const region = floodFillQuant(quantized, x, y, regionColor, width, height);

    if (region.size < minArea) {
      // Encontrar color vecino más frecuente
      const neighborColors = getNeighborColors(region, quantized, width, height);
      const bestColor = neighborColors[0]?.[0] ?? 0;

      // Reemplazar con el color vecino
      for (const idx of region) {
        result[idx] = bestColor;
      }
    }

    for (const idx of region) {
      visited.add(idx);
    }
  }

  return result;
}

function floodFillQuant(quantized, startX, startY, targetColor, width, height) {
  const queue = [{ x: startX, y: startY }];
  const region = new Set();

  while (queue.length > 0) {
    const { x, y } = queue.shift();
    const idx = y * width + x;

    if (region.has(idx)) continue;
    if (y < 0 || y >= height || x < 0 || x >= width) continue;
    if (quantized[idx] !== targetColor) continue;

    region.add(idx);

    queue.push({ x: x + 1, y });
    queue.push({ x: x - 1, y });
    queue.push({ x, y: y + 1 });
    queue.push({ x, y: y - 1 });
  }

  return region;
}

function getNeighborColors(region, quantized, width, height) {
  const colorCounts = new Map();

  for (const idx of region) {
    const x = idx % width;
    const y = Math.floor(idx / width);

    const neighbors = [
      (y - 1) * width + x,
      (y + 1) * width + x,
      y * width + (x - 1),
      y * width + (x + 1)
    ];

    for (const nIdx of neighbors) {
      if (nIdx >= 0 && nIdx < quantized.length && !region.has(nIdx)) {
        const color = quantized[nIdx];
        if (color !== 255) {
          colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
        }
      }
    }
  }

  return Array.from(colorCounts.entries()).sort((a, b) => b[1] - a[1]);
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function colorDistance(hex1, hex2) {
  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);

  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);

  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}