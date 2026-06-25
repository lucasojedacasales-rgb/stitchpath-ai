// ============================================
// renderStitchPreview - Mejorado con StitchFlow
// ============================================

import StitchFlowEngine from '../stitchFlowEngine/entrada';

export default async function (request: any) {
  const { regions, width = 700, height = 600, options = {} } = request.body;
  
  if (!regions || !Array.isArray(regions)) {
    return { status: 400, body: { error: 'Se requieren regiones' } };
  }

  const engine = new StitchFlowEngine();
  
  // Procesar todas las regiones
  const processedRegions = regions.map((region: any) => {
    const stitches = engine.processRegion({
      id: region.id,
      color: region.color,
      stitchType: region.stitchType || 'fill',
      polygon: region.polygon,
      path: region.path,
      angle: region.angle,
      density: region.density,
      stitchWidth: region.stitchWidth,
      underlay: region.underlay,
      underlayDensity: region.underlayDensity,
      underlayAngle: region.underlayAngle
    });
    
    return {
      id: region.id,
      color: region.color,
      stitchType: region.stitchType || 'fill',
      stitches,
      originalData: region
    };
  });

  // Generar SVG de preview (alternativa al canvas)
  const svgPreview = generateSVGPreview(processedRegions, width, height);
  
  return {
    status: 200,
    body: {
      preview: svgPreview,
      regions: processedRegions.map((r: any) => ({
        id: r.id,
        color: r.color,
        stitchType: r.stitchType,
        totalStitches: r.stitches.totalStitches,
        bounds: r.stitches.bounds
      })),
      totalStitches: processedRegions.reduce((sum: number, r: any) => sum + r.stitches.totalStitches, 0),
      stats: {
        totalRegions: processedRegions.length,
        totalColors: new Set(regions.map((r: any) => r.color)).size
      }
    }
  };
}

function generateSVGPreview(regions: any[], width: number, height: number): string {
  const svgParts: string[] = [];
  
  svgParts.push(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`);
  svgParts.push(`<rect width="100%" height="100%" fill="#1a1a2e"/>`);
  
  // Grid
  for (let i = 0; i < width; i += 20) {
    svgParts.push(`<line x1="${i}" y1="0" x2="${i}" y2="${height}" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>`);
  }
  for (let i = 0; i < height; i += 20) {
    svgParts.push(`<line x1="0" y1="${i}" x2="${width}" y2="${i}" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>`);
  }
  
  // Renderizar puntadas
  regions.forEach(region => {
    const stitches = region.stitches;
    
    // Underlay
    stitches.underlay.forEach((stitch: any) => {
      svgParts.push(`<line x1="${stitch.x1}" y1="${stitch.y1}" x2="${stitch.x2}" y2="${stitch.y2}" 
        stroke="${stitch.color}" stroke-width="${stitch.width}" stroke-opacity="0.25" stroke-linecap="round"/>`);
    });
    
    // Fill principal
    stitches.fill.forEach((stitch: any) => {
      if (stitch.type === 'running') {
        svgParts.push(`<circle cx="${stitch.x}" cy="${stitch.y}" r="${stitch.width/2}" 
          fill="${stitch.color}" opacity="0.85"/>`);
      } else {
        // Sombra
        svgParts.push(`<line x1="${stitch.x1+0.5}" y1="${stitch.y1+0.5}" x2="${stitch.x2+0.5}" y2="${stitch.y2+0.5}" 
          stroke="rgba(0,0,0,0.3)" stroke-width="${stitch.width}" stroke-linecap="round"/>`);
        // Hilo
        svgParts.push(`<line x1="${stitch.x1}" y1="${stitch.y1}" x2="${stitch.x2}" y2="${stitch.y2}" 
          stroke="${stitch.color}" stroke-width="${stitch.width}" stroke-linecap="round" opacity="0.85"/>`);
        // Brillo
        svgParts.push(`<line x1="${stitch.x1}" y1="${stitch.y1}" x2="${stitch.x2}" y2="${stitch.y2}" 
          stroke="${lightenColor(stitch.color, 35)}" stroke-width="${stitch.width * 0.25}" stroke-linecap="round" opacity="0.5"/>`);
      }
    });
  });
  
  svgParts.push('</svg>');
  return svgParts.join('\n');
}

function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, (num >> 16) + amt);
  const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
  const B = Math.min(255, (num & 0x0000FF) + amt);
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}
