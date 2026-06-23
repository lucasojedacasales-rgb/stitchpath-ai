import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { image_url, mode, width_mm, height_mm, color_count, remove_bg, use_ia_vision, use_full_bg } = await req.json();

    if (!image_url) return Response.json({ error: 'image_url required' }, { status: 400 });

    const maxColors = Math.min(color_count || 6, 14);
    const w = width_mm || 100;
    const h = height_mm || 100;

    const prompt = `Eres un experto digitalizador de bordados con visión computacional. Analiza VISUALMENTE esta imagen con máxima precisión.

TAREA: Genera regiones de bordado que reproduzcan fielmente las formas reales visibles en la imagen.
TAMAÑO: ${w}mm × ${h}mm
COLORES MÁXIMOS: ${maxColors}
MODO: ${mode || 'hybrid'}

INSTRUCCIONES CRÍTICAS:
1. MIRA la imagen con atención. Identifica cada zona de color/forma diferenciada (cuerpo principal, ojos, boca, mejillas, extremidades, contornos, etc.)
2. Para cada zona, traza un path_points que siga el CONTORNO REAL de esa forma en la imagen.
   - Los puntos son coordenadas normalizadas (0.0 a 1.0) donde (0,0) es arriba-izquierda y (1,1) es abajo-derecha.
   - Usa entre 8 y 30 puntos por región para capturar bien la forma.
   - El primer y último punto deben ser iguales (polígono cerrado).
   - Para formas curvas (círculos, elipses), genera suficientes puntos para aproximar bien la curva.
3. Los colores deben ser los colores HEX reales extraídos de la imagen, no inventados.
4. Ordena las regiones de mayor a menor área (fondo primero, detalles al final).
5. Clasifica el stitch_type:
   - fill: áreas grandes con color sólido
   - satin: tiras estrechas, contornos gruesos, bordes
   - running_stitch: contornos finos, detalles muy pequeños

IMPORTANTE: No generes formas genéricas (rectángulos, círculos perfectos). Los path_points deben reflejar la silueta real de cada elemento de la imagen.

Responde SOLO en JSON con esta estructura:
{
  "regions": [
    {
      "id": "region_1",
      "name": "descripción breve de la zona (ej: cuerpo_principal, ojo_izquierdo, contorno)",
      "color": "#hexcolor_real",
      "stitch_type": "fill|satin|running_stitch",
      "density": 0.4,
      "angle": 45,
      "layer_order": 1,
      "pull_compensation": 0.2,
      "underlay": true,
      "area_mm2": 1200,
      "stitch_count": 3500,
      "is_auto_contour": false,
      "visible": true,
      "path_points": [[x1,y1],[x2,y2],...,[x1,y1]]
    }
  ],
  "total_stitches": 12000,
  "estimated_time_min": 8,
  "colors_used": 5,
  "width_mm": ${w},
  "height_mm": ${h}
}`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      file_urls: [image_url],
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