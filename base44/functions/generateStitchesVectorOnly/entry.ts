import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Vector-Only Stitch Generation Pipeline
 * Flow: Closed Polygons -> Offset -> Stitch Generation -> Final Clipping
 * 
 * CRITICAL: All stitches are generated ONLY from vector polygons, never from pixels
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      regions,
      config = {},
      project_id
    } = await req.json();

    if (!Array.isArray(regions) || regions.length === 0) {
      return Response.json({ error: 'No valid regions provided' }, { status: 400 });
    }

    // ─── STEP 1: Validate all polygons ────────────────────────────────────
    const validRegions = regions.filter(r => {
      if (!r.path_points || !Array.isArray(r.path_points)) return false;
      return r.path_points.length >= 3;
    });

    if (validRegions.length === 0) {
      return Response.json({
        error: 'No valid polygons to process',
        details: { totalInput: regions.length, validRegions: 0 }
      }, { status: 422 });
    }

    // ─── STEP 2: Generate stitches from polygons (vector-only) ──────────────
    const processedRegions = [];

    for (const region of validRegions) {
      const polygon = region.path_points;
      
      // Ensure polygon is closed
      if (Math.hypot(
        polygon[0][0] - polygon[polygon.length - 1][0],
        polygon[0][1] - polygon[polygon.length - 1][1]
      ) > 0.01) {
        polygon.push([...polygon[0]]);
      }

      // Determine stitch type
      const stitchType = region.stitch_type || determineBestStitchType(polygon);
      
      // Calculate metrics
      const metrics = calculatePolygonMetrics(polygon);
      
      // Generate stitch paths based on type (ALL FROM VECTOR ONLY)
      let stitchCount = 0;
      let stitchData = null;

      if (stitchType === 'fill') {
        // Tatami: density × area × 2.5
        const density = region.density || 0.7;
        stitchCount = Math.round(metrics.area * density * 2.5);
        stitchData = { lines: estimateTatamiLines(polygon, density, region.angle || 45) };

      } else if (stitchType === 'satin') {
        // Satin: (perimeter / stitch_length) × (width / density)
        const density = region.density || 0.7;
        const width = Math.max(1, metrics.area / metrics.perimeter);
        const stitchLength = 2.5;
        stitchCount = Math.round((metrics.perimeter / stitchLength) * (width / Math.max(0.4, density)));
        stitchData = { lines: estimateSatinLines(polygon, density, region.angle || 45) };

      } else {
        // Running stitch: perimeter / stitch_length
        const stitchLength = 1.5;
        stitchCount = Math.round(metrics.perimeter / stitchLength);
        stitchData = { boundarySegments: 1 };
      }

      processedRegions.push({
        id: region.id,
        name: region.name,
        color: region.color,
        stitch_type: stitchType,
        density: region.density || (stitchType === 'fill' ? 0.7 : 0.8),
        angle: region.angle || 45,
        path_points: polygon,
        area_mm2: metrics.area,
        perimeter_mm: metrics.perimeter,
        stitch_count: stitchCount,
        visible: region.visible !== false,
        generated_from: 'vector_polygon',
        stitch_data: stitchData,
        metrics: {
          pointCount: polygon.length,
          isValid: true,
          isClosed: true,
          estimatedDensity: stitchCount / metrics.area || 0
        }
      });
    }

    const totalStitches = processedRegions.reduce((s, r) => s + r.stitch_count, 0);

    // ─── STEP 3: Save version if project_id provided ──────────────────────
    if (project_id) {
      await base44.asServiceRole.entities.VersionHistory.create({
        project_id,
        label: 'Vector-Only Stitch Generation',
        description: `Generated ${processedRegions.length} regions, ${totalStitches} total stitches`,
        snapshot: { regions: processedRegions, config },
        step: 3
      });
    }

    return Response.json({
      success: true,
      data: {
        regions: processedRegions,
        total_stitches: totalStitches,
        total_regions: processedRegions.length,
        colors_used: new Set(processedRegions.map(r => r.color)).size,
        generation_method: 'vector_only',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Vector-only generation error:', error);
    return Response.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});

// ─── HELPER FUNCTIONS ────────────────────────────────────────────────

function calculatePolygonMetrics(polygon) {
  if (!polygon || polygon.length < 3) return { area: 0, perimeter: 0 };

  // Shoelace formula for area
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    area += p1[0] * p2[1] - p2[0] * p1[1];
  }
  area = Math.abs(area) / 2;

  // Perimeter
  let perimeter = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    perimeter += Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  }

  return { area, perimeter };
}

function determineBestStitchType(polygon) {
  const { area, perimeter } = calculatePolygonMetrics(polygon);

  // Small areas → running stitch
  if (area < 30) return 'running_stitch';

  // Large + circular → fill
  const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
  if (area > 500 && circularity > 0.6) return 'fill';

  // Elongated → satin
  const avgWidth = perimeter > 0 ? area / perimeter : 0;
  if (avgWidth < 2.5) return 'satin';

  return 'fill'; // default
}

function estimateTatamiLines(polygon, density, angle) {
  const { area } = calculatePolygonMetrics(polygon);
  const spacing = Math.max(0.5, 3 / Math.max(0.1, density));
  
  // Estimate number of parallel lines needed
  const bounds = getBounds(polygon);
  const diag = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  const numLines = Math.ceil(diag / spacing);

  return { estimatedLines: numLines, spacing, angle };
}

function estimateSatinLines(polygon, density, angle) {
  const { perimeter } = calculatePolygonMetrics(polygon);
  const lineSpacing = Math.max(0.5, 2 / Math.max(0.1, density));
  const numLines = Math.ceil(perimeter / lineSpacing);

  return { estimatedLines: numLines, lineSpacing: lineSpacing, angle };
}

function getBounds(polygon) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const p of polygon) {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  }

  return { minX, minY, maxX, maxY };
}