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

    const prompt = `Eres un experto digitalizador de bordados con visión computacional avanzada. Tu tarea principal es trazar con MÁXIMA PRECISIÓN los contornos de cada elemento visible en la imagen.

CONFIGURACIÓN:
- Tamaño objetivo: ${w}mm × ${h}mm
- Colores máximos: ${maxColors}
- Modo: ${mode || 'hybrid'}

PASO 1 — ANÁLISIS VISUAL:
Examina la imagen en detalle. Identifica TODOS los elementos visuales diferenciados: silueta principal, sub-formas internas, ojos, boca, mejillas, extremidades, sombras, contornos oscuros, detalles pequeños, etc.

PASO 2 — TRAZADO DE CONTORNOS (CRÍTICO):
Para cada elemento, genera path_points que sigan el contorno REAL píxel a píxel:
- Coordenadas normalizadas 0.0–1.0 donde (0,0)=esquina superior-izquierda, (1,1)=esquina inferior-derecha
- Para formas CURVAS o REDONDEADAS (cuerpos, cabezas, mejillas): usa 24-40 puntos distribuidos uniformemente alrededor del perímetro real
- Para formas ORGÁNICAS COMPLEJAS (siluetas irregulares): usa hasta 50 puntos
- Para formas PEQUEÑAS (ojos, botones): usa 12-20 puntos
- Para CONTORNOS LINEALES finos: usa puntos que sigan exactamente la línea
- El polígono debe ser cerrado: el último punto igual al primero
- NO uses rectángulos genéricos ni círculos perfectos — traza la forma REAL

PASO 3 — CLASIFICACIÓN DE PUNTADAS:
- fill: rellenos amplios (cuerpo, fondos, zonas grandes de color sólido)
- satin: contornos gruesos, bordes definidos, franjas de 2-8mm de ancho
- running_stitch: contornos muy finos, detalles lineales, separaciones entre zonas

PASO 4 — ORDENACIÓN DE CAPAS:
layer_order 1 = más al fondo (rellenos grandes), layer_order creciente = encima. Los contornos siempre encima de los rellenos.

Responde SOLO en JSON con esta estructura exacta:
{
  "regions": [
    {
      "id": "region_1",
      "name": "nombre_descriptivo_del_elemento",
      "color": "#hexcolor_extraido_de_imagen",
      "stitch_type": "fill|satin|running_stitch",
      "density": 0.5,
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