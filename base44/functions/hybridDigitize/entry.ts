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
      semantic_regions, image_type,
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
      // Build a semantic lookup map (centroid proximity) for enriching descriptions
      const semLookup = buildSemanticLookup(semantic_regions || []);

      const regionDescriptions = clientRegions.slice(0, 200).map((r, i) => {
        const bbox = r.bbox;
        const cx = ((bbox.minX + bbox.maxX) / 2 / (traced_contours.analysisW || 512)).toFixed(3);
        const cy = ((bbox.minY + bbox.maxY) / 2 / (traced_contours.analysisH || 512)).toFixed(3);
        const areaPct = (r.coverage * 100).toFixed(1);
        const compacidad = r.compacidad !== undefined ? r.compacidad.toFixed(2) : 'N/A';
        const inertia = r.inertia_ratio !== undefined ? r.inertia_ratio.toFixed(2) : 'N/A';
        const aspect = r.bbox_aspect !== undefined ? r.bbox_aspect.toFixed(2) : 'N/A';
        const tipoVec = r.type || 'N/A';
        // Semantic enrichment
        const sem = semLookup(parseFloat(cx), parseFloat(cy));
        const semInfo = sem
          ? ` objeto="${sem.semantic_object}" clase="${sem.semantic_class}" puntada_rec="${sem.recommended_stitch_type}" prioridad=${sem.priority}`
          : '';
        return `Región ${i}: color=${r.hex} centro=(${cx},${cy}) cobertura=${areaPct}% tipo_vec=${tipoVec} compac=${compacidad} inertia=${inertia} aspect=${aspect}${semInfo}`;
      }).join('\n');

      const imageTypeInfo = image_type ? `TIPO DE IMAGEN DETECTADO: ${image_type.toUpperCase()}` : '';

      const labelPrompt = `Eres el mejor digitalizador de bordados del mundo (nivel Wilcom). Analiza la imagen con MÁXIMO detalle semántico.

${imageTypeInfo}

Tengo ${Math.min(clientRegions.length, 200)} regiones detectadas píxel a píxel con segmentación semántica:
${regionDescriptions}

Para CADA región (en orden 0, 1, 2...) asigna:
- name: nombre del OBJETO REAL que representa. Usa el campo "objeto" si está disponible. Sé muy específico: "ojo_izquierdo", "cabello_superior", "borde_ropa", "reflejo_ojo_derecho", "nariz_punta", "cielo_fondo", etc. Para logos: "letra_A", "icono_estrella". Para anime: "contorno_cara", "sombra_pelo".
- stitch_type: usa "puntada_rec" del segmentador si existe y tiene sentido. Reglas: satin=detalles/bordes/letras (<5% area), fill=zonas grandes, running_stitch=bordes muy finos o reflejos.
- density: 0.3-0.9 según tipo. fill_photo=0.35, fill_normal=0.45-0.7, satin=0.5-0.6, run=0.3
- angle: 0-180. Usa orientación PCA si disponible. Ojos/redondos=45°, cabello=ángulo de caída, ropa=45°.
- layer_order: background/fondo=1, rellenos grandes=2, rellenos medianos=3, detalles=4, contornos=5
- underlay: true para fill/satin >2% cobertura
- pull_compensation: 0.1-0.2

TIPOS DE IMAGEN — estrategias:
- drawing: énfasis en contornos precisos (satin bordes), fills limpios, pocos colores
- logo: formas geométricas precisas, satin en letras/bordes, fill en áreas sólidas
- anime: fills planos limpios (fill), bordes nítidos (satin), detalles anatómicos (satin fino)
- photo: fills texturizados (fill 0.35), gradientes como capas de color, detalles pequeños (satin)

CRÍTICO: Nombra los objetos reales — no pongas "region_ffffff_3", pon "reflejo_ojo_izquierdo".
CRÍTICO: Respeta el campo "puntada_rec" del segmentador semántico a menos que sea claramente incorrecto.
CRÍTICO: Ordena layer_order correctamente — bordes y detalles SIEMPRE encima de fills.

Responde SOLO JSON:
{"labels":[{"index":0,"name":"nombre_objeto_real","stitch_type":"fill","density":0.7,"angle":45,"layer_order":2,"underlay":true,"pull_compensation":0.15}],"estimated_time_min":12}`;

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
        
        // === PRIORIDAD: vectorizador > semántico > Claude > geométrico ===
        const semMatch = semLookup(
          (r.centroid?.[0]) || ((r.bbox?.minX + r.bbox?.maxX) / 2 / (traced_contours.analysisW || 512)),
          (r.centroid?.[1]) || ((r.bbox?.minY + r.bbox?.maxY) / 2 / (traced_contours.analysisH || 512))
        );
        const stitch_type = r.type
          || label.stitch_type
          || semMatch?.recommended_stitch_type
          || clasificarPorGeometria(r, w, h);
        
        const regionDensity = label.density || (stitch_type === 'fill' ? density : stitch_type === 'satin' ? density * 1.25 : 0.4);
        
        // Ángulo: priority chain — PCA (if adaptiveAngles) > Claude label > global fill_angle > color-coherent fallback
        let angle;
        if (adaptiveAngles && r.fill_angle !== undefined) {
          angle = r.fill_angle;                                    // PCA per-region — most precise
        } else if (label.angle !== undefined) {
          angle = label.angle;                                     // AI classification
        } else if (fill_angle !== null && fill_angle !== undefined) {
          angle = fill_angle;                                      // user override
        } else if (r.fill_angle !== undefined) {
          angle = r.fill_angle;                                    // PCA even when not adaptiveAngles
        } else {
          // Color-coherent fallback: same color → same angle (deterministic from hex)
          const colorSeed = parseInt((r.hex || '#888888').replace('#', '').slice(0, 2), 16);
          angle = (colorSeed * 53) % 180;                         // deterministic, spread, not per-index
        }
        
        const stitch_count = calcularStitchCount(r, stitch_type, regionDensity, w, h);

        // Underlay: respects mode strategy
        const useUnderlay = underlayEnabled
          ? (label.underlay !== undefined ? label.underlay : stitch_type === 'fill')
          : false;

        // Derive perimeter_mm from normalized perimeter (diagonal of design = reference)
        const diagMm = Math.hypot(w, h);
        const perimeterMm = r.perimeter_norm
          ? r.perimeter_norm * diagMm
          : (r.perimeter_mm || Math.sqrt(r.coverage * w * h) * 3.5);

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
          perimeter_mm: +perimeterMm.toFixed(2),
          centroid: r.centroid || [0.5, 0.5],
          stitch_count,
          is_auto_contour: false,
          visible: true,
          path_points: r.path_points,
          // Semantic metadata
          semantic_object:  r.semantic_object  || semMatch?.semantic_object  || null,
          semantic_class:   r.semantic_class   || semMatch?.semantic_class   || null,
          image_type:       image_type || null,
          _metrics: {
            compacidad:    r.compacidad,
            inertia_ratio: r.inertia_ratio,
            bbox_aspect:   r.bbox_aspect,
            fill_angle:    r.fill_angle,
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

/**
 * Builds a fast centroid-based lookup for semantic regions.
 * Returns a function (cx, cy) => nearest semantic region or null.
 */
function buildSemanticLookup(semanticRegions) {
  if (!semanticRegions || semanticRegions.length === 0) return () => null;
  return (cx, cy) => {
    let best = null, bestD = Infinity;
    for (const s of semanticRegions) {
      const [sx, sy] = s.centroid || [0.5, 0.5];
      const d = Math.hypot(cx - sx, cy - sy);
      if (d < bestD) { bestD = d; best = s; }
    }
    return bestD < 0.25 ? best : null;
  };
}

/**
 * Classify stitch type from real geometric metrics.
 * Uses area_mm2 (scaled to design) for correct thresholds.
 * Priority: compactness → aspect/inertia → area
 */
function clasificarPorGeometria(r, w = 100, h = 100) {
  const areaMm2    = (r.coverage || 0) * w * h;
  const compacidad = r.compacidad   !== undefined ? r.compacidad   : 0.5;
  const inertia    = r.inertia_ratio !== undefined ? r.inertia_ratio : 1;
  const aspect     = r.bbox_aspect  !== undefined ? r.bbox_aspect  : 1;

  // Very thin, elongated shapes → satin (like letters, stripes, stems)
  if (compacidad < 0.3 && (inertia > 3 || aspect > 2.5)) return 'satin';

  // Micro areas → running stitch (hairlines, fine details)
  if (areaMm2 < 4) return 'running_stitch';

  // Small-medium areas with elongation → satin
  if (areaMm2 < 80 && (inertia > 2 || compacidad < 0.45)) return 'satin';

  // Large compact areas → fill
  if (areaMm2 >= 25 && compacidad >= 0.35) return 'fill';

  // Medium areas — use compactness to decide
  if (compacidad >= 0.5) return 'fill';
  return 'satin';
}

/**
 * Canonical stitch count formula — single source of truth for backend + regionBuilder.
 * Aligned with physical embroidery constants:
 *   fill:    ~2.5 stitches/mm² at density 1.0 (0.4mm row spacing)
 *   satin:   ~2 stitches/mm of perimeter per mm of width
 *   running: ~1 stitch per 1.5mm of perimeter
 */
function calcularStitchCount(r, type, density, w, h) {
  const areaMm2    = (r.coverage || 0.01) * w * h;
  // Perimeter: use normalized value scaled to design dimensions
  const diagMm     = Math.hypot(w, h);
  const perimeterMm = r.perimeter_norm
    ? r.perimeter_norm * diagMm
    : (r.perimeter_mm || Math.sqrt(areaMm2) * 3.5);

  if (type === 'fill') {
    // rows/mm = 1/density_mm. stitches per row ≈ stitch_length (2.5mm default)
    // total ≈ area * (1/density) * (1/stitch_length) ≈ area * 2.5 * density_factor
    return Math.round(areaMm2 * 2.5 * (1 / Math.max(0.25, density)));
  } else if (type === 'satin') {
    // each satin column = 1 stitch. columns spaced ~0.4mm along perimeter direction
    return Math.round(perimeterMm * 2 * (areaMm2 / Math.max(1, perimeterMm)));
  } else {
    // running: 1 stitch every 1.5mm
    return Math.round(perimeterMm / 1.5);
  }
}