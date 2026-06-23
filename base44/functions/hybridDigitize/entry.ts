import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { image_url, mode, width_mm, height_mm, color_count, remove_bg, use_ia_vision, use_full_bg } = await req.json();

    if (!image_url) return Response.json({ error: 'image_url required' }, { status: 400 });

    const modeDescriptions = {
      hybrid: 'Pixel-perfect con K-means++ y Claude Sonnet para parámetros óptimos. Detecta bordes, sub-regiones y genera contornos automáticos.',
      ultra: 'Ultra-detallada 1200px+ con micro-detalles máximos. Máxima densidad de puntadas y detección de regiones pequeñas.',
      standard: 'Balance rápido entre calidad y velocidad. Ideal para diseños simples.',
      precision: 'Máximo detalle y más puntadas. Óptimo para diseños complejos de alta calidad.',
      potrace: 'Vectorización rápida tipo Potrace sin IA extra. Contornos limpios.'
    };

    const prompt = `Eres un motor experto en digitalización de bordados. Analiza esta imagen y genera regiones de puntadas como un profesional.

MODO: ${modeDescriptions[mode] || modeDescriptions.hybrid}
TAMAÑO OBJETIVO: ${width_mm || 100}mm × ${height_mm || 100}mm
COLORES MÁXIMOS: ${color_count || 6}
USAR IA VISION: ${use_ia_vision ? 'sí' : 'no'}
FONDOS COMPLETOS: ${use_full_bg ? 'sí' : 'no'}

ALGORITMO:
1. Aplica K-means++ clustering de colores (tolerancia 30px, detecta y excluye blancos/fondos)
2. Usa floodFill para detectar sub-regiones internas (ojos, manchas dentro de rellenos)
3. Clasifica cada región por compactness ratio (perímetro²/área):
   - Formas delgadas/pequeñas (<50mm²): running_stitch o satin
   - Formas grandes (>300mm²): fill
   - Regiones negras/oscuras: running_stitch automático
4. Genera auto-contornos: running_stitch negro (layer_order=4) para cada región fill sin contorno próximo
5. Ordena: fills primero, contornos después

RESPONDE EN JSON con esta estructura exacta:
{
  "regions": [
    {
      "id": "region_1",
      "name": "hex_color o contour_hex",
      "color": "#hexcolor",
      "stitch_type": "fill|satin|running_stitch",
      "density": 0.3-2.0,
      "angle": 0-180,
      "layer_order": 1,
      "pull_compensation": 0.0-1.0,
      "underlay": true|false,
      "area_mm2": número,
      "stitch_count": número estimado,
      "is_auto_contour": true|false,
      "visible": true,
      "path_points": [[x1,y1],[x2,y2],...hasta 20 puntos representativos normalizados 0-1]
    }
  ],
  "total_stitches": número,
  "estimated_time_min": número,
  "colors_used": número,
  "width_mm": número,
  "height_mm": número
}

Genera entre 4 y ${Math.min(color_count || 6, 12)} regiones representativas basándote visualmente en la imagen.
Si es modo hybrid o ultra, usa Claude para refinar densidad y ángulo según el tipo de tela.
Asegúrate que los colores sean hex válidos y que las puntadas sean profesionales para bordado industrial.`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      model: 'claude_sonnet_4_6',
      response_json_schema: {
        type: 'object',
        properties: {
          regions: { type: 'array', items: { type: 'object' } },
          total_stitches: { type: 'number' },
          estimated_time_min: { type: 'number' },
          colors_used: { type: 'number' },
          width_mm: { type: 'number' },
          height_mm: { type: 'number' }
        }
      }
    });

    return Response.json({ success: true, data: result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});