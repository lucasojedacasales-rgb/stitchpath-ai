import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Fetch image and re-upload via Base44 UploadFile so Claude Vision can access it
async function reuploadForClaude(imageUrl, base44) {
  try {
    const res = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return imageUrl; // fallback to original URL if fetch fails
    const contentType = res.headers.get('content-type') || 'image/png';
    const buffer = await res.arrayBuffer();
    const ext = contentType.includes('png') ? 'png' : contentType.includes('gif') ? 'gif' : contentType.includes('webp') ? 'webp' : 'jpg';
    const file = new File([buffer], `image.${ext}`, { type: contentType });
    const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });
    return uploaded.file_url;
  } catch (e) {
    return imageUrl; // fallback: use original URL if re-upload fails
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { image_url, mode, width_mm, height_mm, color_count, use_ia_vision, image_analysis, traced_contours } = await req.json();

    if (!image_url) return Response.json({ error: 'image_url required' }, { status: 400 });

    const maxColors = Math.min(color_count || 8, 20);
    const w = width_mm || 100;
    const h = height_mm || 100;

    // Re-upload image so Claude Vision always gets a valid Base44-hosted URL
    const imageDataUrl = await reuploadForClaude(image_url, base44);
    
    // Pre-analyze colors for better accuracy
    let colorData = '';
    if (image_analysis?.dominantColors?.length > 0) {
      colorData = `COLORES DETECTADOS EN LA IMAGEN:\n${image_analysis.dominantColors.slice(0, 8).map((c, i) => `${i+1}. ${c.hex} - ${Math.round(c.coverage * 100)}% de cobertura`).join('\n')}\n\n`;
    }

    // ─── PATH B: Pure AI generation (mejor detección de detalles) ──────────────
    const regionTarget = mode === 'ultra' ? '80-120' : mode === 'precision' ? '50-80' : mode === 'standard' ? '15-30' : '30-60';
    const pointsPerShape = mode === 'ultra' ? '40-80' : mode === 'precision' ? '30-60' : '15-40';

    let colorDataBlock = '';
    if (image_analysis?.dominantColors?.length > 0) {
      colorDataBlock = `\nPALETA DE COLORES DETECTADA:\n${image_analysis.dominantColors.slice(0, 12).map((c, i) => `${i+1}. ${c.hex} - ${(c.coverage * 100).toFixed(1)}% cobertura - REUSAR EXACTAMENTE ESTE COLOR`).join('\n')}\n`;
    }

    const prompt = `MOTOR DE DETECCIÓN: Paso 1 - Áreas sólidas. Paso 2 - Detalles internos. Paso 3 - Contornos.

${colorDataBlock}

PASO 1 - DETECTAR ÁREAS DE COLOR SÓLIDO (Primero):
Identifica todas las áreas homogéneas de color:
- Cuerpo principal (color sólido)
- Superficies planas (ropa, piel base)
- Regiones extensas del mismo color

PASO 2 - DETECTAR DETALLES INTERNOS (Segundo - CRÍTICO):
Dentro de cada región, busca detalles finos como regiones INDEPENDIENTES:
- Ojos: blanco separado + pupila separada + brillo separado = 3 regiones
- Mejillas: forma base + sombra/detalle = 2+ regiones
- Boca: labios + dientes = 2+ regiones
- Nariz: base + sombra = 2 regiones
- Cejas, pestañas = regiones separadas si visibles
- REGLA: Cualquier color/sombra diferente = región nueva independiente

PASO 3 - CONTORNOS Y BORDES (Último):
- Solo si hay líneas oscuras visibles como elementos independientes
- NO AGRUPAR con rellenos

ESPECIFICACIONES:
- name: Jerárquico (ej: "cuerpo", "ojo_izq_blanco", "ojo_izq_pupila", "mejilla_rosa")
- stitch_type: "fill" (sólido), "satin" (detalle), "running_stitch" (línea)
- color: Paleta exacta o #rrggbb más cercano
- area_mm2: Realista (cuerpo ~500mm², ojo ~15mm², mejilla ~50mm²)
- density: 0.6-0.9
- layer_order: cuerpo=1, detalles grandes=2-3, finos=4-6, contornos=7+
- path_points: ${pointsPerShape} puntos, polígono cerrado

CRÍTICO: NO OMITAS PEQUEÑOS DETALLES. Incluye todos.

Responde SOLO JSON válido:
{
  "regions": [
    {
      "id": "r1",
      "name": "nombre_descriptivo",
      "color": "#rrggbb",
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
      "path_points": [[0.1,0.1],[0.9,0.1],[0.9,0.9],[0.1,0.9],[0.1,0.1]]
    }
  ],
  "total_stitches": 18000,
  "estimated_time_min": 12,
  "colors_used": 6,
  "width_mm": ${w},
  "height_mm": ${h}
}`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      file_urls: [imageDataUrl],
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

    // ─── POST-PROCESAMIENTO: Validar y mejorar regiones ─────────────────────
    const regions = (result.regions || []).filter(r => {
      // Validar path_points válido
      if (!r.path_points || r.path_points.length < 4) return false;
      // Validar polígono cerrado
      const first = r.path_points[0];
      const last = r.path_points[r.path_points.length - 1];
      if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 0.01) {
        r.path_points.push(first); // Cerrar polígono si no lo está
      }
      return true;
    }).map(r => {
      // Mejorar clasificación de stitch_type si no viene completa
      const area = r.area_mm2 || 0;
      if (!r.stitch_type || r.stitch_type === 'unknown') {
        if (area >= 100) r.stitch_type = 'fill';
        else if (area >= 20) r.stitch_type = 'satin';
        else r.stitch_type = 'running_stitch';
      }
      
      // Calcular stitch_count más precisamente
      if (!r.stitch_count) {
        const baseCount = area * (r.density || 0.7) * 2.5; // factor optimizado
        r.stitch_count = Math.round(baseCount);
      }
      
      return r;
    });

    const total_stitches = regions.reduce((s, r) => s + (r.stitch_count || 0), 0);
    
    return Response.json({ 
      success: true, 
      data: {
        regions,
        total_stitches,
        estimated_time_min: result.estimated_time_min || Math.round(total_stitches / 800),
        colors_used: new Set(regions.map(r => r.color)).size,
        width_mm: w,
        height_mm: h,
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});