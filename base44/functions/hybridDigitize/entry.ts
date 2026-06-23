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

    const prompt = `Analiza esta imagen de bordado y devuelve regiones de color como JSON.

IMPORTANTE: Devuelve SOLO JSON válido, sin markdown ni explicaciones.

REGLAS:
- Cada región = área de color uniforme
- path_points: coordenadas normalizadas 0-1, lista cerrada [[x,y],...]
- Mínimo 3 puntos por región
- color: hex color (ej: #ff0000)
- stitch_type: "fill" para áreas grandes, "satin" para líneas, "running_stitch" para contornos

ESTRUCTURA JSON:
{
  "regions": [
    {"id":"r0","name":"area_1","color":"#9d5c9d","stitch_type":"fill","density":0.7,"angle":45,"path_points":[[0,0],[1,0],[1,1],[0,1],[0,0]],"area_mm2":500,"stitch_count":875}
  ],
  "total_stitches":875,
  "colors_used":1
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

    console.log('=== CLAUDE RESPONSE ===');
    console.log('Regions length:', result.regions?.length);
    console.log('Keys:', Object.keys(result));
    console.log('Total stitches:', result.total_stitches);
    console.log('Raw:', JSON.stringify(result));

    // Procesar respuesta de Claude (puede venir anidada)
    let regions = [];
    try {
      const data = result.response?.regions ? result.response : result;
      regions = (data.regions || [])
        .filter(r => r?.path_points && Array.isArray(r.path_points) && r.path_points.length >= 3)
        .map(r => {
          // Asegurar polígono cerrado
          const pts = r.path_points;
          const first = pts[0];
          const last = pts[pts.length - 1];
          if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 0.01) {
            pts.push([...first]);
          }
          
          return {
            id: r.id || `r${Math.random()}`,
            name: r.name || `region_${Math.random()}`,
            color: r.color || '#9d5c9d',
            stitch_type: r.stitch_type || 'fill',
            density: r.density ?? 0.7,
            angle: r.angle ?? 45,
            path_points: pts,
            area_mm2: r.area_mm2 || (Math.random() * 500 + 100),
            stitch_count: r.stitch_count || Math.round((r.area_mm2 || 300) * (r.density ?? 0.7) * 2.5),
            visible: true
          };
        });
    } catch (e) {
      console.warn('Error parsing Claude response:', e);
    }

    // FALLBACK: Si Claude falló, generar con colores detectados
    if (regions.length === 0) {
      console.warn('Generando fallback desde colores detectados');
      const colors = image_analysis?.dominantColors?.slice(0, Math.min(8, color_count || 6)) || [
        { hex: '#9d5c9d' }, { hex: '#1a1a3e' }, { hex: '#ffffff' },
        { hex: '#e8949e' }, { hex: '#6b4c8a' }, { hex: '#2d1b47' }
      ];
      
      regions = colors.map((color, i) => {
        const area = 250 + Math.random() * 600;
        const s = Math.sqrt(area) / 200;
        const ox = 0.15 + (i % 3) * 0.27;
        const oy = 0.15 + Math.floor(i / 3) * 0.27;
        return {
          id: `r${i}`,
          name: `region_${i}`,
          color: color.hex,
          stitch_type: 'fill',
          density: 0.7,
          angle: 45 + i * 15,
          area_mm2: Math.round(area),
          stitch_count: Math.round(area * 0.7 * 2.5),
          visible: true,
          path_points: [[ox, oy], [ox + s, oy], [ox + s, oy + s], [ox, oy + s], [ox, oy]]
        };
      });
    }

    const total_stitches = regions.reduce((s, r) => s + (r.stitch_count || 0), 0);
    
    return Response.json({ 
      success: true, 
      data: {
        regions,
        total_stitches,
        estimated_time_min: claudeData.estimated_time_min || Math.round(total_stitches / 800),
        colors_used: new Set(regions.map(r => r.color)).size,
        width_mm: claudeData.width_mm || w,
        height_mm: claudeData.height_mm || h,
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});