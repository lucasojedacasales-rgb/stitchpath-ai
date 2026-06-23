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

    // ─── PATH A: Use real traced contours from client ────────────────────────
    if (traced_contours && traced_contours.regions && traced_contours.regions.length > 0) {
      const clientRegions = traced_contours.regions;

      const regionDescriptions = clientRegions.slice(0, 40).map((r, i) => {
        const bbox = r.bbox;
        const cx = ((bbox.minX + bbox.maxX) / 2 / (traced_contours.analysisW || 512)).toFixed(3);
        const cy = ((bbox.minY + bbox.maxY) / 2 / (traced_contours.analysisH || 512)).toFixed(3);
        const areaPct = (r.coverage * 100).toFixed(1);
        return `Región ${i}: color=${r.hex} centro=(${cx},${cy}) cobertura=${areaPct}%`;
      }).join('\n');

      const labelPrompt = `Eres un experto digitalizador de bordados. Analiza la imagen y las regiones detectadas.

${colorData}
Tengo ${Math.min(clientRegions.length, 40)} regiones detectadas píxel a píxel (ordenadas por importancia/tamaño):
${regionDescriptions}

TAREA CRÍTICA: Para CADA región (en orden 0, 1, 2...):
1. **name**: nombre descriptivo detallado (ej: "ojo_izquierdo", "boca_roja", "contorno_negro")
2. **stitch_type**: 
   - "fill" = zonas grandes homogéneas (> 100mm²)
   - "satin" = áreas medianas con detalle (30-100mm²) 
   - "running_stitch" = líneas finas, contornos, detalles (< 30mm²)
3. **density**: 0.4-0.9 (más alta para detalles finos, más baja para áreas grandes)
4. **angle**: 0-180 (ángulo de puntadas, variado para cada región)
5. **layer_order**: orden de bordado (1=primero, fills grandes antes que detalles)
6. **underlay**: true para fill/satin grandes, false para contornos/detalles
7. **pull_compensation**: 0.1-0.2

IMPORTANTE: Respeta exactamente los colores detectados para cada región.

Responde SOLO JSON válido:
{"labels":[{"index":0,"name":"...","stitch_type":"fill","density":0.7,"angle":45,"layer_order":1,"underlay":true,"pull_compensation":0.15}],"estimated_time_min":12}`;

      const labelResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: labelPrompt,
        file_urls: [imageDataUrl],
        model: 'claude_sonnet_4_6',
        response_json_schema: {
          type: 'object',
          properties: {
            labels: { type: 'array', items: { type: 'object' } },
            estimated_time_min: { type: 'number' }
          }
        }
      });

      const labels = labelResult.labels || [];
      const labelMap = {};
      for (const l of labels) labelMap[l.index] = l;

      const finalRegions = clientRegions.slice(0, 40).map((r, i) => {
        const label = labelMap[i] || {};
        
        // Calculate perimeter from path_points
        let perimeterMm = 0;
        if (r.path_points && r.path_points.length >= 3) {
          for (let j = 0; j < r.path_points.length; j++) {
            const p1 = r.path_points[j];
            const p2 = r.path_points[(j + 1) % r.path_points.length];
            perimeterMm += Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
          }
        }
        
        const areaMm2 = Math.round(r.coverage * w * h);
        const avgWidth = perimeterMm > 0 ? areaMm2 / perimeterMm : 0;
        
        // Smart stitch type classification + contour following
         let stitch_type = label.stitch_type;
         if (!stitch_type) {
           const pathLen = (r.path_points || []).length;
           const curvatureRatio = perimeterMm > 0 ? pathLen / perimeterMm : 0;

           // Mejor detección: área + ancho + curvatura
           if (areaMm2 > 150 && avgWidth > 4.0 && curvatureRatio < 1.2) {
             stitch_type = 'fill';
           } else if (areaMm2 < 40 || avgWidth < 2.0 || curvatureRatio > 1.5) {
             stitch_type = 'satin';
           } else {
             stitch_type = 'fill';
           }
         }
        
        const stitch_count = Math.round(areaMm2 * (label.density || 0.7) * 0.4);
        
        return {
          id: `r${i + 1}`,
          name: label.name || `region_${r.hex.replace('#', '')}_${i}`,
          color: r.hex,
          stitch_type,
          density: label.density || 0.7,
          angle: label.angle || (i * 17 % 180),
          layer_order: label.layer_order || (i + 1),
          pull_compensation: label.pull_compensation || 0.15,
          underlay: label.underlay !== undefined ? label.underlay : stitch_type !== 'running_stitch',
          area_mm2: areaMm2,
          perimeter_mm: parseFloat(perimeterMm.toFixed(2)),
          stitch_count,
          is_auto_contour: false,
          visible: true,
          path_points: r.path_points,
        };
      });

      const total_stitches = finalRegions.reduce((s, r) => s + r.stitch_count, 0);
      return Response.json({
        success: true,
        data: {
          regions: finalRegions,
          total_stitches,
          estimated_time_min: labelResult.estimated_time_min || Math.round(total_stitches / 800),
          colors_used: new Set(finalRegions.map(r => r.color)).size,
          width_mm: w,
          height_mm: h,
        }
      });
    }

    // ─── PATH B: Pure AI generation ───────────────────────────────────────────
    const regionTarget = mode === 'ultra' ? '80-120' : mode === 'precision' ? '50-80' : mode === 'standard' ? '15-30' : '30-60';
    const pointsPerShape = mode === 'ultra' ? '40-80' : mode === 'precision' ? '30-60' : '15-40';

    let colorDataBlock = '';
    if (image_analysis?.dominantColors?.length > 0) {
      colorDataBlock = `\nPALETA DE COLORES DETECTADA:\n${image_analysis.dominantColors.slice(0, 12).map((c, i) => `${i+1}. ${c.hex} - ${(c.coverage * 100).toFixed(1)}% cobertura - REUSAR EXACTAMENTE ESTE COLOR`).join('\n')}\n`;
    }

    const prompt = `Eres el mejor digitalizador de bordados con 20 años de experiencia. Tu objetivo: detectar TODOS los colores y detalles de la imagen.

ANÁLISIS REQUERIDO:
${colorDataBlock}
Genera ${regionTarget} regiones de bordado independientes. CRÍTICO: Cada color diferente debe ser una región independiente con su relleno (fill) COMPLETO, no solo bordes o contornos.

REGLAS CRÍTICAS:
1. **Detecta TODO**:
   - Rellenos sólidos grandes (cuerpo, áreas principales de color)
   - Detalles internos: ojos, mejillas, boca, pupilas (incluso si son pequeños)
   - Contornos solo si son líneas visibles como elementos independientes
   - Cada variación de color = región diferente
   - NO OMITAS REGIONES PEQUEÑAS (ojos, mejillas, detalles siempre se incluyen)

2. **Para CADA región**:
   - name: descriptivo (ej: "cuerpo_rosa", "ojo_blanco", "pupila_azul", "mejilla_rosada")
   - stitch_type: "fill" (rellenos grandes/sólidos homogéneos), "satin" (detalles medianos), "running_stitch" (líneas finas)
   - Usa EXACTAMENTE los colores hex de la paleta
   - density: 0.7-0.9 para detalles pequeños, 0.5-0.7 para rellenos grandes

3. **path_points - Crítico**:
   - ${pointsPerShape} puntos suavemente distribuidos cubriendo TODA la región
   - FILL: 30-60 puntos describiendo el relleno completo
   - Interpolar puntos en bordes curvos, NO crear zig-zag
   - Asegura que la región sea "rellenable" completamente

4. **Coordenadas**: Normalizadas 0.0–1.0 (0,0=top-left, 1,1=bottom-right)
5. **Polígono cerrado**: Último punto = primer punto
6. **Orden**: layer_order 1=fills grandes primero, incrementar para detalles

Responde SOLO con JSON válido (sin texto extra):
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

    return Response.json({ success: true, data: result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});