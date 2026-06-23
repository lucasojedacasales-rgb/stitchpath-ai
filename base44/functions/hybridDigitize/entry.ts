import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { image_url, mode, width_mm, height_mm, color_count, remove_bg, use_ia_vision, use_full_bg, image_analysis, traced_contours } = await req.json();

    if (!image_url) return Response.json({ error: 'image_url required' }, { status: 400 });

    const maxColors = Math.min(color_count || 8, 20);
    const w = width_mm || 100;
    const h = height_mm || 100;

    // ─── PATH A: Use real traced contours from client ────────────────────────
    if (traced_contours && traced_contours.regions && traced_contours.regions.length > 0) {
      const clientRegions = traced_contours.regions;

      // Build a description of each traced region for Claude to label
      const regionDescriptions = clientRegions.slice(0, 40).map((r, i) => {
        const bbox = r.bbox;
        const cx = ((bbox.minX + bbox.maxX) / 2 / traced_contours.analysisW).toFixed(3);
        const cy = ((bbox.minY + bbox.maxY) / 2 / traced_contours.analysisH).toFixed(3);
        const areaPct = (r.coverage * 100).toFixed(1);
        return `Región ${i}: color=${r.hex} centro=(${cx},${cy}) cobertura=${areaPct}%`;
      }).join('\n');

      const labelPrompt = `Eres un experto digitalizador de bordados. Analiza esta imagen de bordado.

Tengo ${clientRegions.slice(0, 40).length} regiones ya detectadas con sus contornos reales extraídos píxel a píxel:
${regionDescriptions}

Para CADA región (en el mismo orden 0, 1, 2...) asigna:
- name: nombre descriptivo de la parte del diseño (ej: "cuerpo_principal", "ojo_izquierdo")
- stitch_type: "fill" para zonas grandes rellenas, "satin" para bordes/contornos medianos, "running_stitch" para detalles muy finos
- density: 0.4-0.9 según grosor necesario
- angle: 0-360 ángulo de las puntadas de relleno (varía por zona)
- layer_order: orden de bordado (1=primero, rellenos grandes antes que contornos)
- underlay: true para fill y satin en zonas grandes, false para detalles
- pull_compensation: 0.1-0.2

Responde SOLO JSON válido:
{
  "labels": [
    {"index": 0, "name": "...", "stitch_type": "fill", "density": 0.7, "angle": 45, "layer_order": 1, "underlay": true, "pull_compensation": 0.15}
  ],
  "estimated_time_min": 12
}`;

      const labelResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: labelPrompt,
        file_urls: [image_url],
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

      // Merge real contours with Claude labels
      const finalRegions = clientRegions.slice(0, 40).map((r, i) => {
        const label = labelMap[i] || {};
        const stitch_type = label.stitch_type || (r.coverage > 0.05 ? 'fill' : r.coverage > 0.01 ? 'satin' : 'running_stitch');
        const stitch_count = Math.round(r.area_px * (label.density || 0.7) * 0.4);

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
          area_mm2: Math.round(r.coverage * w * h),
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

    // ─── PATH B: Fallback — pure AI generation (no client contours) ──────────
    const regionTarget = mode === 'ultra' ? '80-150' : mode === 'precision' ? '60-120' : mode === 'standard' ? '20-40' : '40-80';
    const pointsPerShape = mode === 'ultra' ? '60-120' : mode === 'precision' ? '50-100' : '30-60';

    let colorDataBlock = '';
    if (image_analysis && image_analysis.dominantColors && image_analysis.dominantColors.length > 0) {
      colorDataBlock = `
COLORES REALES EXTRAÍDOS:
${image_analysis.dominantColors.map((c, i) => `  ${c.hex} (${(c.coverage * 100).toFixed(1)}%)`).join('\n')}

ZONAS DE COLOR (bounding boxes 0-1):
${image_analysis.colorRegions.map(r =>
  `  ${r.hex}: x=[${r.minX.toFixed(3)},${r.maxX.toFixed(3)}] y=[${r.minY.toFixed(3)},${r.maxY.toFixed(3)}]`
).join('\n')}
`;
    }

    const prompt = `Eres el mejor digitalizador de bordados. Analiza la imagen y genera ${regionTarget} regiones con contornos PRECISOS.
TAMAÑO: ${w}mm × ${h}mm | COLORES MAX: ${maxColors} | MODO: ${mode || 'hybrid'}
${colorDataBlock}

REGLAS:
- path_points: ${pointsPerShape} puntos siguiendo el contorno REAL de cada zona
- Coordenadas 0.0–1.0 desde arriba-izquierda
- Polígono cerrado (último = primer punto)
- Capas: fills grandes → fills medianos → contornos satin → detalles running_stitch

Responde SOLO JSON:
{
  "regions": [{"id":"r1","name":"...","color":"#hex","stitch_type":"fill","density":0.7,"angle":45,"layer_order":1,"pull_compensation":0.15,"underlay":true,"area_mm2":800,"stitch_count":2200,"is_auto_contour":false,"visible":true,"path_points":[[0.2,0.1],...]}],
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