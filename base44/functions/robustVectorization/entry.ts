import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * HTTP Connector a API Python externa para vectorización
 * 
 * Esta función NO realiza vectorización localmente.
 * Solo actúa como conector HTTP que:
 * 1. Recibe imagen en formato pixel array
 * 2. Envía a API Python externa
 * 3. Recibe puntadas generadas
 * 4. Transforma formato para el frontend
 */

// CONFIGURAR: Reemplaza con URL de tu API Python desplegada
const API_URL = Deno.env.get('VECTORIZER_API_URL') || 'https://stitchpath-api.up.railway.app/vectorize';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      pixels,
      width,
      height,
      width_mm = 100,
      height_mm = 100,
      color_count = 6,
      stitch_density = 0.7
    } = await req.json();

    if (!pixels || !width || !height) {
      return Response.json({ error: 'Missing image data' }, { status: 400 });
    }

    console.log(`[CONNECTOR] Enviando imagen a ${API_URL}...`);
    console.log(`[CONNECTOR] Dims: ${width}x${height}px → ${width_mm}x${height_mm}mm, colors=${color_count}`);

    // Crear FormData con los pixels
    const formData = new FormData();
    
    // Convertir pixel array a Blob PNG
    const pixelBlob = await pixelsToImageBlob(pixels, width, height);
    formData.append('image', pixelBlob, 'image.png');
    formData.append('color_count', color_count.toString());
    formData.append('width_mm', width_mm.toString());
    formData.append('height_mm', height_mm.toString());
    formData.append('stitch_density', stitch_density.toString());

    // Llamar API Python externa
    let response;
    try {
      response = await fetch(API_URL, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(120_000) // 2 minutos timeout
      });
    } catch (fetchErr) {
      console.error(`[CONNECTOR] Fetch error: ${fetchErr.message}`);
      return Response.json({
        success: false,
        error: `Cannot connect to API: ${API_URL}. Make sure it's deployed and URL is correct.`,
        data: { regions: [], total_stitches: 0, diagnostics: { errors: [fetchErr.message] } }
      }, { status: 503 });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[CONNECTOR] API error ${response.status}: ${errorText}`);
      return Response.json({
        success: false,
        error: `API returned ${response.status}: ${errorText}`,
        data: { regions: [], total_stitches: 0, diagnostics: { errors: [errorText] } }
      }, { status: response.status });
    }

    const apiResult = await response.json();
    console.log(`[CONNECTOR] API response:`, apiResult);

    if (!apiResult.success) {
      return Response.json({
        success: false,
        error: apiResult.error || 'Vectorization failed',
        data: { regions: [], total_stitches: 0, diagnostics: { errors: [apiResult.error] } }
      }, { status: 422 });
    }

    // Transformar respuesta al formato interno
    const regions = (apiResult.regions || []).map((r, idx) => ({
      id: r.id || `r${idx}`,
      name: generateRegionName(r),
      color: r.color || '#ffffff',
      stitch_type: r.type || 'fill',
      density: stitch_density,
      angle: r.angle || 45,
      path_points: (r.stitches || []).map(s => [s.x / width_mm, s.y / height_mm]), // Normalizar
      stitch_count: r.pointCount || 0,
      area_mm2: (r.pointCount || 0) * 0.1, // Estimación
      visible: true
    }));

    const totalStitches = regions.reduce((s, r) => s + (r.stitch_count || 0), 0);

    console.log(`[CONNECTOR] SUCCESS: ${regions.length} regions, ${totalStitches} stitches`);

    return Response.json({
      success: true,
      data: {
        regions,
        total_stitches: totalStitches,
        colors_used: apiResult.colorCount || regions.length,
        generation_method: 'external_api',
        vector_source: true,
        api_url: API_URL,
        diagnostics: {
          regionsDetected: regions.length,
          totalStitches,
          colorsUsed: apiResult.colorCount || 0,
          errors: []
        }
      }
    });

  } catch (error) {
    console.error('[CONNECTOR] ERROR:', error.message);
    return Response.json({
      success: false,
      error: error.message,
      data: { regions: [], total_stitches: 0, diagnostics: { errors: [error.message] } }
    }, { status: 500 });
  }
});

/**
 * Convertir array de pixels a PNG Blob
 * Usa canvas nativo para encoding
 */
async function pixelsToImageBlob(pixels, width, height) {
  try {
    // Los pixels vienen como array plano RGBA
    const imageData = new ImageData(
      new Uint8ClampedArray(pixels),
      width,
      height
    );
    
    // Crear canvas y dibujar
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    ctx.putImageData(imageData, 0, 0);
    
    // Convertir a PNG (convertToBlob retorna Promise)
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return blob;
  } catch (err) {
    console.error('[CONNECTOR] Error converting pixels to blob:', err.message);
    throw new Error(`Cannot convert pixels to image: ${err.message}`);
  }
}

/**
 * Generar nombre legible para región
 */
function generateRegionName(region) {
  const colorNames = {
    'ff0000': 'rojo',
    'ffffff': 'blanco',
    '000000': 'negro',
    '0000ff': 'azul',
    '00ff00': 'verde',
    'ffff00': 'amarillo',
    'ff00ff': 'magenta',
    'ffa500': 'naranja',
    '800080': 'morado',
    'ffc0cb': 'rosa'
  };
  
  let colorName = 'color';
  
  // Intentar extraer nombre del color
  if (region.color) {
    if (typeof region.color === 'string') {
      const hex = region.color.replace('#', '').toLowerCase();
      colorName = colorNames[hex] || `col${hex.slice(0, 3)}`;
    } else if (region.color.r !== undefined) {
      const hex = `${region.color.r.toString(16).padStart(2, '0')}${region.color.g.toString(16).padStart(2, '0')}${region.color.b.toString(16).padStart(2, '0')}`;
      colorName = colorNames[hex] || `col${hex.slice(0, 3)}`;
    }
  }
  
  const typeSuffix = region.type === 'fill' ? 'fill' :
                    region.type === 'satin' ? 'sat' : 'run';
  
  return `${colorName}_${typeSuffix}`;
}