import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { image_url, mode, width_mm, height_mm, color_count } = await req.json();

    if (!image_url) return Response.json({ error: 'image_url required' }, { status: 400 });

    const w = width_mm || 100;
    const h = height_mm || 100;
    const maxColors = Math.min(color_count || 8, 20);

    // ─── CRITICAL: Use real vectorization, not Claude coordinates ────────────
    console.log('Using real vectorization (robustVectorization)...');
    
    const vectorRes = await base44.functions.invoke('robustVectorization', {
      image_url,
      width_mm: w,
      height_mm: h,
      color_count: maxColors
    });

    if (!vectorRes?.data?.success) {
      return Response.json({
        success: false,
        error: vectorRes?.data?.error || 'Vectorization failed',
        data: { regions: [], total_stitches: 0 }
      }, { status: 422 });
    }

    let regions = vectorRes.data.data?.regions || [];

    if (regions.length === 0) {
      return Response.json({
        success: false,
        error: 'No valid regions extracted from image',
        data: { regions: [], total_stitches: 0 }
      }, { status: 422 });
    }

    // ─── Classification & Optimization ────────────────────────────────────
    
    // Clasificación inteligente de tipo de puntada (geométrica)
    const classifyStitchType = (region) => {
      const hex = (region.color || '').toLowerCase();
      const isDark = hex === '#000000' || hex === '#1a1a1a';

      if (isDark) return 'running_stitch';

      const area = region.area_mm2 || 0;
      const perim = region.perimeter_mm || 1;
      const avgWidth = perim > 0 ? area / perim : 0;
      const compactness = perim > 0 ? (perim * perim) / Math.max(area, 1) : 999;

      if (area < 30) return 'running_stitch';
      if (area > 500 && avgWidth > 8) return 'fill';
      if (avgWidth < 2.5 || compactness > 20) return 'satin';
      if (area < 100 || compactness > 12) return 'satin';
      return 'fill';
    };

    // Optimización de secuencia (reduce saltos)
    const optimizeStitchSequence = (blocks) => {
      if (blocks.length <= 1) return blocks;

      const colorGroups = {};
      blocks.forEach((b, i) => {
        const c = b.color || b.color_index || 0;
        if (!colorGroups[c]) colorGroups[c] = [];
        colorGroups[c].push({ ...b, idx: i });
      });

      const optimized = [];
      Object.keys(colorGroups).sort().forEach(color => {
        const group = colorGroups[color];
        if (group.length <= 1) {
          optimized.push(...group);
          return;
        }

        const visited = new Set();
        const ordered = [group[0]];
        visited.add(0);

        for (let i = 1; i < group.length; i++) {
          const lastBlock = ordered[ordered.length - 1];
          const lastX = lastBlock.centroid?.[0] ?? 0.5;
          const lastY = lastBlock.centroid?.[1] ?? 0.5;

          let minDist = Infinity, nextIdx = -1;
          for (let j = 0; j < group.length; j++) {
            if (visited.has(j)) continue;
            const b = group[j];
            const bx = b.centroid?.[0] ?? 0.5;
            const by = b.centroid?.[1] ?? 0.5;
            const dist = Math.hypot(bx - lastX, by - lastY);
            if (dist < minDist) { minDist = dist; nextIdx = j; }
          }

          ordered.push(group[nextIdx]);
          visited.add(nextIdx);
        }

        optimized.push(...ordered);
      });

      return optimized;
    };

    // Inserción automática de trims
    const insertTrims = (blocks) => {
      const MAX_JUMP_MM = 7.0;
      const result = [];

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];

        if (i > 0) {
          const prevBlock = result[result.length - 1];
          const prevCentroid = prevBlock.centroid || [0.5, 0.5];
          const currCentroid = block.centroid || [0.5, 0.5];
          const dist = Math.hypot(
            (currCentroid[0] - prevCentroid[0]) * w,
            (currCentroid[1] - prevCentroid[1]) * h
          );

          if (dist > MAX_JUMP_MM) {
            block.has_jump_before = true;
          }
        }

        result.push(block);
      }

      return result;
    };

    const calculateStitchCount = (region) => {
      const type = region.stitch_type;
      const area = region.area_mm2 || 0;
      const perim = region.perimeter_mm || 1;
      const density = region.density || 0.7;

      if (type === 'fill') {
        return Math.round(area * density * 2.5);
      } else if (type === 'satin') {
        const width = Math.max(1, area / perim);
        const stitchLength = 2.5;
        return Math.round((perim / stitchLength) * (width / Math.max(0.4, density)));
      } else {
        const stitchLength = 1.5;
        return Math.round(perim / stitchLength);
      }
    };

    // Procesar regiones
    let processedRegions = regions.map((r, idx) => {
      const type = classifyStitchType(r);
      return {
        ...r,
        stitch_type: type,
        stitch_count: calculateStitchCount({ ...r, stitch_type: type })
      };
    });

    // Optimizar secuencia + insertar trims
    processedRegions = optimizeStitchSequence(processedRegions);
    processedRegions = insertTrims(processedRegions);

    const totalStitches = processedRegions.reduce((sum, r) => sum + (r.stitch_count || 0), 0);

    return Response.json({
      success: true,
      data: {
        regions: processedRegions,
        total_stitches: totalStitches,
        estimated_time_min: Math.round(totalStitches / 800),
        colors_used: new Set(processedRegions.map(r => r.color)).size,
        width_mm: w,
        height_mm: h,
        generation_method: 'real_vectorization'
      }
    });

  } catch (error) {
    console.error('hybridDigitize error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});