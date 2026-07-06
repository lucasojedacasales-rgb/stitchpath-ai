function hexToRgb(hex = '#888888') {
  const h = String(hex).replace('#', '');
  return [parseInt(h.slice(0, 2), 16) || 136, parseInt(h.slice(2, 4), 16) || 136, parseInt(h.slice(4, 6), 16) || 136];
}

function rgbToHex([r, g, b]) {
  const to = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function colorDistance(a, b) {
  const ar = hexToRgb(a), br = hexToRgb(b);
  return Math.hypot(ar[0] - br[0], ar[1] - br[1], ar[2] - br[2]);
}

function polygonAreaNorm(points = []) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i][0] * points[j][1] - points[j][0] * points[i][1];
  }
  return Math.abs(area) / 2;
}

function isImportantRegion(region) {
  const text = `${region.id || ''} ${region.name || ''} ${region.object || ''} ${region.semantic?.object || ''} ${region.layerType || ''}`.toLowerCase();
  return ['eye', 'ojo', 'mouth', 'boca', 'foot', 'feet', 'pie', 'belly', 'barriga', 'outline', 'contour', 'contorno'].some(k => text.includes(k));
}

function quantizeColor(hex, palette) {
  let best = null;
  for (const p of palette) {
    const d = colorDistance(hex, p.hex);
    if (!best || d < best.d) best = { ...p, d };
  }
  return best && best.d <= 26 ? best.hex : hex;
}

export function cleanCartoonSegmentationRegions(regions = [], config = {}) {
  const widthMm = config.width_mm || 100;
  const heightMm = config.height_mm || 100;
  const before = {
    regionCount: regions.length,
    unsupportedRegionCount: regions.filter(r => r.supported === false || r.darkSupport === 0).length,
    uniqueThreadColors: new Set(regions.map(r => r.color || r.hex).filter(Boolean)).size,
  };

  const paletteMap = new Map();
  for (const r of regions) {
    const color = (r.color || r.hex || '#888888').toLowerCase();
    const areaNorm = polygonAreaNorm(r.path_points);
    const areaMm2 = r.area_mm2 ?? areaNorm * widthMm * heightMm;
    if (areaMm2 < 3 && !isImportantRegion(r)) continue;
    const key = color.slice(0, 4);
    if (!paletteMap.has(key)) paletteMap.set(key, { hex: color, area: 0 });
    paletteMap.get(key).area += areaMm2;
  }
  const palette = [...paletteMap.values()].sort((a, b) => b.area - a.area).slice(0, 8);

  const cleaned = [];
  let removedNoise = 0;
  let mergedSimilarColors = 0;
  for (const r of regions) {
    const areaNorm = polygonAreaNorm(r.path_points);
    const areaMm2 = r.area_mm2 ?? areaNorm * widthMm * heightMm;
    const pointCount = r.path_points?.length || 0;
    const unsupported = r.supported === false || r.darkSupport === 0;
    const important = isImportantRegion(r);
    const tinyUnsupported = areaMm2 < 3 && unsupported && !important;
    const microOverdraw = areaMm2 < 3 && pointCount > 70 && !important;
    if (tinyUnsupported || microOverdraw) { removedNoise++; continue; }

    const originalColor = (r.color || r.hex || '#888888').toLowerCase();
    const nextColor = quantizeColor(originalColor, palette);
    if (nextColor !== originalColor) mergedSimilarColors++;
    cleaned.push({
      ...r,
      color: nextColor,
      hex: nextColor,
      density: areaMm2 < 8 ? Math.max(Number(r.density) || 0.4, 0.55) : r.density,
      cartoonCleanup: {
        applied: true,
        areaMm2: +areaMm2.toFixed(3),
        important,
        unsupported,
      },
    });
  }

  const after = {
    regionCount: cleaned.length,
    unsupportedRegionCount: cleaned.filter(r => r.supported === false || r.darkSupport === 0).length,
    uniqueThreadColors: new Set(cleaned.map(r => r.color || r.hex).filter(Boolean)).size,
  };

  return {
    regions: cleaned,
    report: {
      before,
      after,
      rejectedNoiseCountAfter: removedNoise,
      mergedSimilarColors,
      phase: 'DARK_STROKE_SOURCE_AND_CARTOON_SEGMENTATION_CLEANUP_V1',
    },
  };
}