import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Fetch image and re-upload via Base44 UploadFile so Claude Vision can access it
async function reuploadForClaude(imageUrl, base44) {
  const res = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching image`);
  const contentType = res.headers.get('content-type') || 'image/png';
  const buffer = await res.arrayBuffer();
  const ext = contentType.includes('png') ? 'png' : contentType.includes('gif') ? 'gif' : contentType.includes('webp') ? 'webp' : 'jpg';
  const file = new File([buffer], `image.${ext}`, { type: contentType });
  const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });
  return uploaded.file_url;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      image_url, mode, width_mm, height_mm, color_count,
      use_ia_vision, image_analysis, traced_contours,
      max_regions, stitch_strategy, tatami_density, fill_angle
    } = await req.json();

    if (!image_url) return Response.json({ error: 'image_url required' }, { status: 400 });

    const maxColors = Math.min(color_count || 8, 20);
    const w = width_mm || 100;
    const h = height_mm || 100;
    const regionLimit = max_regions || 150;
    const density = tatami_density || 0.4;
    const adaptiveAngles = stitch_strategy?.adaptiveAngles || false;
    const travelOptimize = stitch_strategy?.travelOptimize || false;
    const underlayEnabled = stitch_strategy?.underlayEnabled !== false;

    // Re-upload image so Claude Vision always gets a valid Base44-hosted URL
    const imageDataUrl = await reuploadForClaude(image_url, base44);

    // ─── PATH A: Use real traced contours from client ────────────────────────
    if (traced_contours && traced_contours.regions && traced_contours.regions.length > 0) {
      const clientRegions = traced_contours.regions;

      // === NUEVO: Usar métricas geométricas del vectorizador para clasificación ===
      const regionDescriptions = clientRegions.slice(0, 200).map((r, i) => {
        const bbox = r.bbox;
        const cx = ((bbox.minX + bbox.maxX) / 2 / (traced_contours.analysisW || 512)).toFixed(3);
        const cy = ((bbox.minY + bbox.maxY) / 2 / (traced_contours.analysisH || 512)).toFixed(3);
        const areaPct = (r.coverage * 100).toFixed(1);
        // Usar métricas del vectorizador si existen
        const compacidad = r.compacidad !== undefined ? r.compacidad.toFixed(2) : 'N/A';
        const inertia = r.inertia_ratio !== undefined ? r.inertia_ratio.toFixed(2) : 'N/A';
        const aspect = r.bbox_aspect !== undefined ? r.bbox_aspect.toFixed(2) : 'N/A';
        const tipoVec = r.type || 'N/A';
        return `Región ${i}: color=${r.hex} centro=(${cx},${cy}) cobertura=${areaPct}% tipo_vectorizador=${tipoVec} compacidad=${compacidad} inertia=${inertia} aspect=${aspect}`;
      }).join('\n');

      const labelPrompt = `Eres un experto digitalizador de bordados. Analiza la imagen con MÁXIMO detalle.

Tengo ${Math.min(clientRegions.length, 200)} regiones detectadas píxel a píxel:
${regionDescriptions}

Para CADA región asigna (en orden 0, 1, 2...):
- name: nombre descriptivo. PRESTA ESPECIAL ATENCIÓN a detalles pequeños: ojos, nariz, boca, pupilas, reflejos, manchas. Si la cobertura es < 0.5%, probablemente es un detalle anatómico pequeño — nómbralo apropiadamente (ej: "ojo_izquierdo_pupila", "nariz_punta", "reflejo_ojo").
- stitch_type: "satin" para detalles pequeños/medianos (< 5% cobertura) porque quedan mejor que fill. "fill" para zonas grandes. "running_stitch" solo para bordes muy finos.
- density: 0.4-0.9 (satin detalles=0.5-0.6, fill grande=0.7-0.8, running=0.3-0.4)
- angle: 0-180 (ángulo puntadas). Para detalles redondos como ojos usa 45 o 90.
- layer_order: fills grandes primero (1), luego medianos (2), detalles pequeños encima (3-4)
- underlay: true para fill/satin > 2% cobertura, false para micro-detalles
- pull_compensation: 0.1-0.2

CRÍTICO: NO omitas ninguna región aunque sea muy pequeña. Cada detalle cuenta.
CRÍTICO: No cambies el stitch_type del vectorizador a menos que sea claramente incorrecto.

Responde SOLO JSON:
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

      const finalRegions = clientRegions.slice(0, regionLimit).map((r, i) => {
        const label = labelMap[i] || {};
        
        // === PRIORIDAD: vectorizador > Claude > reglas geométricas ===
        const stitch_type = r.type || label.stitch_type || clasificarPorGeometria(r);
        
        const regionDensity = label.density || (stitch_type === 'fill' ? density : stitch_type === 'satin' ? density * 1.25 : 0.4);
        
        // Ángulo: adaptiveAngles usa PCA del vectorizador si existe, sino Claude, sino fallback
        let angle;
        if (adaptiveAngles && r.fill_angle !== undefined) {
          angle = r.fill_angle;
        } else if (label.angle !== undefined) {
          angle = label.angle;
        } else if (fill_angle !== null && fill_angle !== undefined) {
          angle = fill_angle;
        } else {
          angle = i * 17 % 180;
        }
        
        const stitch_count = calcularStitchCount(r, stitch_type, regionDensity, w, h);

        // Underlay: respects mode strategy
        const useUnderlay = underlayEnabled
          ? (label.underlay !== undefined ? label.underlay : stitch_type === 'fill')
          : false;

        return {
          id: `r${i + 1}`,
          name: label.name || `region_${r.hex.replace('#', '')}_${i}`,
          color: r.hex,
          stitch_type,
          density: regionDensity,
          angle,
          layer_order: label.layer_order || (stitch_type === 'fill' ? 1 : stitch_type === 'satin' ? 2 : 3),
          pull_compensation: label.pull_compensation || 0.15,
          underlay: useUnderlay,
          area_mm2: Math.round(r.coverage * w * h),
          stitch_count,
          is_auto_contour: false,
          visible: true,
          path_points: r.path_points,
          _metrics: {
            compacidad: r.compacidad,
            inertia_ratio: r.inertia_ratio,
            bbox_aspect: r.bbox_aspect,
            area_relativa: r.area_relativa,
          }
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

    // ─── PATH B: Pure AI generation (solo si no hay contornos) ──────────────
    const regionTarget = mode === 'ultra' ? '80-120' : mode === 'precision' ? '50-80' : mode === 'fast' ? '10-20' : mode === 'standard' ? '15-30' : '30-60';
    const pointsPerShape = mode === 'ultra' ? '40-80' : mode === 'precision' ? '30-60' : mode === 'fast' ? '8-15' : '15-40';

    let colorDataBlock = '';
    if (image_analysis?.dominantColors?.length > 0) {
      colorDataBlock = `\nCOLORES DETECTADOS:\n${image_analysis.dominantColors.map(c => `  ${c.hex} (${(c.coverage * 100).toFixed(1)}%)`).join('\n')}\n`;
    }

    const prompt = `Eres el mejor digitalizador de bordados. Analiza la imagen adjunta y genera ${regionTarget} regiones de bordado con contornos precisos.
TAMAÑO DISEÑO: ${w}mm × ${h}mm | COLORES MÁX: ${maxColors} | MODO: ${mode || 'hybrid'}
${colorDataBlock}
INSTRUCCIONES:
- path_points: ${pointsPerShape} puntos siguiendo el contorno REAL de cada zona de color
- Coordenadas normalizadas 0.0–1.0 (0,0 = arriba-izquierda, 1,1 = abajo-derecha)
- Polígono cerrado: el último punto debe ser igual al primero
- Orden de capas: fills grandes primero (layer_order=1), luego medianos, luego contornos satin, luego detalles running_stitch
- Usa los colores REALES que ves en la imagen para los hex codes
- stitch_count: estima realista según area (fill ~15pts/mm², satin ~20pts/mm, running ~5pts/mm)

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

// === NUEVO: Clasificación por geometría (fallback) ===
function clasificarPorGeometria(r) {
  const compacidad = r.compacidad || 0.5;
  const aspect = r.bbox_aspect || 1;
  const area = r.coverage || 0;
  
  if (compacidad < 0.25 && area < 0.02) return 'running_stitch';
  if ((compacidad < 0.5 && aspect > 2) || (area < 0.05 && aspect > 1.6)) return 'satin';
  if (area > 0.005) return 'fill';
  return 'running_stitch';
}

// === NUEVO: Cálculo de stitch count por tipo ===
function calcularStitchCount(r, type, density, w, h) {
  const areaMm2 = (r.coverage || 0.01) * w * h;
  const perimeterMm = (r.perimeter_mm || Math.sqrt(areaMm2) * 4);
  
  if (type === 'fill') {
    return Math.round(areaMm2 * density * 15);
  } else if (type === 'satin') {
    return Math.round(perimeterMm * density * 20);
  } else {
    return Math.round(perimeterMm * 5);
  }
}