import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * LIGHTWEIGHT VECTORIZATION
 * Pure geometry from pre-extracted pixels - no heavy algorithms
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { pixels, width, height, width_mm = 100, height_mm = 100, color_count = 6 } = await req.json();

    if (!pixels || !width || !height) {
      return Response.json({ error: 'Missing pixels, width, or height' }, { status: 400 });
    }

    const pixelArray = new Uint8ClampedArray(pixels);
    const regions = [];

    // Quantize to main colors
    const colorCounts = new Map();
    for (let i = 0; i < pixelArray.length; i += 4) {
      const r = pixelArray[i];
      const g = pixelArray[i + 1];
      const b = pixelArray[i + 2];
      const a = pixelArray[i + 3] || 255;
      
      if (a < 128) continue;
      
      const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
      colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
    }

    // Keep top colors
    const topColors = Array.from(colorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.min(color_count, 8))
      .map(([hex]) => hex);

    // For each color, create a simple region
    for (const hex of topColors) {
      // Create bounding box mask
      let minX = width, maxX = 0, minY = height, maxY = 0;
      let pixelCount = 0;

      for (let idx = 0; idx < width * height; idx++) {
        const i = idx * 4;
        const r = pixelArray[i];
        const g = pixelArray[i + 1];
        const b = pixelArray[i + 2];
        const a = pixelArray[i + 3] || 255;
        
        const currentHex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
        
        if (currentHex !== hex || a < 128) continue;
        
        const x = idx % width;
        const y = Math.floor(idx / width);
        
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        pixelCount++;
      }

      if (pixelCount < 1) continue;

      const w = (maxX - minX + 1) / width;
      const h = (maxY - minY + 1) / height;
      const area = w * h;

      if (area < 0.001) continue;

      // Simple rectangle contour
      const path = [
        [minX / width, minY / height],
        [maxX / width, minY / height],
        [maxX / width, maxY / height],
        [minX / width, maxY / height],
        [minX / width, minY / height]
      ];

      const perimeter = 2 * (w + h);
      const type = area > 0.1 ? 'fill' : 'satin';
      const stitches = type === 'fill' 
        ? Math.round(area * width_mm * height_mm * 0.7 * 2.5)
        : Math.round(perimeter * Math.sqrt(width_mm * height_mm) * 20);

      regions.push({
        id: `r${regions.length}`,
        name: `${hex}_${type}`,
        color: hex,
        stitch_type: type,
        density: 0.7,
        angle: 45,
        path_points: path,
        area_mm2: area * width_mm * height_mm,
        perimeter_mm: perimeter * Math.sqrt(width_mm * height_mm),
        stitch_count: stitches,
        visible: true
      });
    }

    if (regions.length === 0) {
      return Response.json({
        success: false,
        error: 'No colored regions detected',
        data: { regions: [], total_stitches: 0 }
      }, { status: 422 });
    }

    const totalStitches = regions.reduce((s, r) => s + (r.stitch_count || 0), 0);

    return Response.json({
      success: true,
      data: {
        regions,
        total_stitches: totalStitches,
        colors_used: regions.length,
        generation_method: 'simple_color_detection'
      }
    });

  } catch (error) {
    console.error('Vectorization error:', error.message);
    return Response.json({
      success: false,
      error: error.message,
      data: { regions: [], total_stitches: 0 }
    }, { status: 422 });
  }
});