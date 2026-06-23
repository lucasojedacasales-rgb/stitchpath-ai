import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { image_url, mode, width_mm, height_mm, color_count, remove_bg, use_ia_vision, use_full_bg } = await req.json();

    if (!image_url) return Response.json({ error: 'image_url required' }, { status: 400 });

    const maxColors = Math.min(color_count || 8, 20);
    const w = width_mm || 100;
    const h = height_mm || 100;

    // Determine aggressiveness based on mode
    const regionTarget = mode === 'ultra' ? '80-150' : mode === 'precision' ? '60-120' : mode === 'standard' ? '20-40' : '40-80';
    const pointsPerShape = mode === 'ultra' ? '40-80' : mode === 'precision' ? '30-60' : '20-50';

    const prompt = `Eres el mejor digitalizador de bordados del mundo. Analiza esta imagen y genera un resultado de digitalizacion PROFESIONAL con el nivel de detalle de software industriales como Wilcom, Hatch o Embird.

OBJETIVO: Generar ${regionTarget} regiones que reproduzcan FIELMENTE cada elemento visual de la imagen para bordado a máquina.
TAMAÑO: ${w}mm × ${h}mm | COLORES MAX: ${maxColors} | MODO: ${mode || 'hybrid'}

═══════════════════════════════════════════
REGLAS ABSOLUTAS DE CALIDAD (NO NEGOCIABLES)
═══════════════════════════════════════════

1. CADA ELEMENTO VISUAL = UNA O MÁS REGIONES SEPARADAS
   Descompón la imagen en: silueta exterior, rellenos de color, sub-formas internas, ojos, boca, nariz, mejillas, orejas, extremidades, accesorios, sombras, highlights, contornos de separación entre zonas.

2. REGLAS DE CAPAS (OBLIGATORIO):
   - Capa 1-5: Rellenos grandes de fondo (fill) — zona más grande de cada color principal
   - Capa 6-15: Rellenos medianos internos (fill) — sub-zonas dentro del personaje
   - Capa 16-30: Contornos satin de separación entre colores (satin, 2-4mm ancho)
   - Capa 31+: Contornos finos de detalle y borde exterior (running_stitch o satin)
   SIEMPRE: contornos encima de rellenos. Nunca al revés.

3. CONTORNOS PRECISOS (MUY IMPORTANTE):
   - path_points: ${pointsPerShape} puntos por región siguiendo el contorno REAL píxel a píxel
   - Para siluetas con curvas orgánicas: distribuye puntos en TODAS las inflexiones de la curva
   - Para zonas redondeadas: usa puntos cada 5-15 grados del arco real
   - NUNCA uses cajas rectangulares ni elipses perfectas — sigue la forma REAL de la imagen
   - Coordenadas normalizadas 0.0–1.0: (0,0)=arriba-izquierda, (1,1)=abajo-derecha
   - Polígono SIEMPRE cerrado: último punto = primer punto

4. COLORES EXACTOS:
   - Extrae los colores HEX REALES de la imagen (no aproximaciones genéricas)
   - Cada región tiene el color exacto de esa zona visual
   - El contorno exterior suele ser negro o muy oscuro (#1a1a1a, #2d2d2d, etc.)

5. SEPARACIÓN POR ZONAS DE COLOR:
   Para personajes: CADA zona de color diferente debe tener:
   a) Un fill (relleno) con ese color
   b) Un satin o running_stitch de contorno alrededor de esa zona con el color del borde
   Ejemplo para Yoshi: cuerpo verde (fill) + contorno verde oscuro (satin) + barriga blanca (fill) + contorno barriga (satin) + ojo blanco (fill) + pupila negra (fill) + contorno ojo (running_stitch) etc.

6. STITCH_TYPE según función:
   - fill: zonas rellenas de área > 3mm² (ángulo de relleno variado por zona para no acumular tension)
   - satin: bandas de 1-8mm ancho, contornos principales, bordes entre colores
   - running_stitch: contornos muy finos < 1mm, detalles lineales, texturas

7. DENSIDADES:
   - fill denso: density 0.6-0.8 (zonas sólidas)
   - satin: density 0.7-0.9 (contornos nítidos)
   - running_stitch: density 0.3-0.5 (trazos finos)

Responde SOLO en JSON válido con esta estructura:
{
  "regions": [
    {
      "id": "r1",
      "name": "nombre_descriptivo",
      "color": "#hexcolor",
      "stitch_type": "fill",
      "density": 0.7,
      "angle": 45,
      "layer_order": 1,
      "pull_compensation": 0.15,
      "underlay": true,
      "area_mm2": 800,
      "stitch_count": 2200,
      "is_auto_contour": false,
      "visible": true,
      "path_points": [[0.2,0.1],[0.3,0.08],[0.5,0.07],[0.7,0.09],[0.8,0.2],[0.75,0.4],[0.5,0.5],[0.25,0.4],[0.2,0.1]]
    }
  ],
  "total_stitches": 18000,
  "estimated_time_min": 12,
  "colors_used": 8,
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