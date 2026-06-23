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

    const { 
      pixels, width, height, 
      width_mm = 100, height_mm = 100, color_count = 6,
      apply_pipeline = true 
    } = await req.json();

    if (!pixels || !width || !height) {
      return Response.json({ error: 'Missing pixels, width, or height' }, { status: 400 });
    }

    const pixelArray = new Uint8ClampedArray(pixels);
    const regions = [];

    // Detect shadows and dark areas
    const SHADOW_THRESHOLD = 85;
    const shadowPixels = new Set();
    
    for (let i = 0; i < pixelArray.length; i += 4) {
      const r = pixelArray[i];
      const g = pixelArray[i + 1];
      const b = pixelArray[i + 2];
      const a = pixelArray[i + 3] || 255;
      
      if (a < 128) continue;
      
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
      if (brightness < SHADOW_THRESHOLD) {
        shadowPixels.add(i / 4);
      }
    }

    // Quantize to main colors with clustering of similar colors
    const colorCounts = new Map();
    const colorSamples = []; // For clustering
    
    for (let i = 0; i < pixelArray.length; i += 4) {
      const r = pixelArray[i];
      const g = pixelArray[i + 1];
      const b = pixelArray[i + 2];
      const a = pixelArray[i + 3] || 255;
      
      if (a < 128) continue;
      
      const pixelIdx = i / 4;
      if (shadowPixels.has(pixelIdx)) continue;
      
      // Cluster similar colors (tolerance: 20 units in RGB)
      let found = false;
      for (const [hex, rgb] of colorCounts) {
        const dist = Math.hypot(rgb[0] - r, rgb[1] - g, rgb[2] - b);
        if (dist < 20) {
          colorCounts.set(hex, colorCounts.get(hex) + 1);
          found = true;
          break;
        }
      }
      
      if (!found) {
        const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
        colorCounts.set(hex, 1);
      }
    }

    // Keep top colors (limit to 12 for cleaner output)
    const topColors = Array.from(colorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.min(color_count, 12)) // Reduced from 16 to avoid over-fragmentation
      .map(([hex]) => hex);

    // Process colors and shadows
    const allRegionColors = [...topColors];
    if (shadowPixels.size > width * height * 0.01) {
      allRegionColors.push('#0a0a0a'); // Add shadow as explicit region
    }

    // Build pixel mask for each color
    const pixelMasks = new Map();
    for (const hex of allRegionColors) {
      pixelMasks.set(hex, new Set());
    }
    
    // Assign pixels to colors
    for (let idx = 0; idx < width * height; idx++) {
      const i = idx * 4;
      const isShadowPixel = shadowPixels.has(idx);
      
      if (isShadowPixel) {
        pixelMasks.get('#0a0a0a').add(idx);
      } else {
        const r = pixelArray[i];
        const g = pixelArray[i + 1];
        const b = pixelArray[i + 2];
        const a = pixelArray[i + 3] || 255;
        if (a < 128) continue;
        
        const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
        if (pixelMasks.has(hex)) pixelMasks.get(hex).add(idx);
      }
    }

    // For each color, extract connected regions via flood fill
    for (const hex of allRegionColors) {
      const colorPixels = pixelMasks.get(hex);
      if (colorPixels.size < 5) continue; // Skip tiny regions

      // Group connected components
      const visited = new Set();
      const components = [];
      
      for (const startIdx of colorPixels) {
        if (visited.has(startIdx)) continue;
        
        // Flood fill to find connected component
        const component = floodFill(startIdx, colorPixels, visited, width, height);
        if (component.length > 20) { // Min 20 pixels to avoid noise
          components.push(component);
        }
      }

      // Create region for each significant component
      for (const component of components) {
        const pixelCount = component.length;
        const box = getComponentBounds(component, width, height);
        const w = (box.maxX - box.minX + 1) / width;
        const h = (box.maxY - box.minY + 1) / height;
        const area = w * h;

        // Better filtering: ignore tiny regions
        if (area < 0.002) continue;

        const path = extractContourPoints(component, width, height);
        if (path.length < 4) continue;

        const perimeter = estimatePerimeter(path);
        const isShadow = hex === '#0a0a0a';
        
        // Shadow regions should be running stitch (contours/details)
        let type = area > 0.1 ? 'fill' : area > 0.02 ? 'satin' : 'running_stitch';
        if (isShadow) type = 'running_stitch';
        
        const stitches = type === 'fill' 
          ? Math.round(area * width_mm * height_mm * 0.7 * 2.5)
          : type === 'satin'
          ? Math.round(perimeter * Math.sqrt(width_mm * height_mm) * 20)
          : Math.round(perimeter * Math.sqrt(width_mm * height_mm) * 15);

        regions.push({
          id: `r${regions.length}`,
          name: isShadow ? `sombra_${type}` : `${hex}_${type}`,
          color: hex,
          stitch_type: type,
          density: isShadow ? 0.5 : 0.7,
          angle: isShadow ? 60 : 45,
          path_points: path,
          area_mm2: area * width_mm * height_mm,
          perimeter_mm: perimeter * Math.sqrt(width_mm * height_mm),
          stitch_count: stitches,
          visible: true,
          isShadow: isShadow
        });
      }
    }

    if (regions.length === 0) {
      return Response.json({
        success: false,
        error: 'No colored regions detected',
        data: { regions: [], total_stitches: 0 }
      }, { status: 422 });
    }

    // Apply geometric pipeline if requested
    let finalRegions = regions;
    let pipelineReport = null;

    if (apply_pipeline) {
      try {
        // NOTE: Pipeline execution happens client-side in pages/Editor.js
        // This flag indicates that pipeline MUST be applied before stitching
        pipelineReport = {
          message: 'Geometric pipeline must be applied client-side',
          pipeline_required: true,
          steps: [
            'Close polygons',
            'Apply safety offset',
            'Clip to bounds',
            'Validate regions'
          ]
        };
      } catch (err) {
        console.warn('Pipeline execution skipped:', err.message);
      }
    }

    const totalStitches = finalRegions.reduce((s, r) => s + (r.stitch_count || 0), 0);

    return Response.json({
      success: true,
      data: {
        regions: finalRegions,
        total_stitches: totalStitches,
        colors_used: finalRegions.length,
        generation_method: 'simple_color_detection',
        pipeline_report: pipelineReport,
        vector_source: true // CRITICAL: Indicates regions are vector-based
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

// ─── Flood Fill: Extract connected components ──────────────────────────────

function floodFill(startIdx, colorPixels, visited, width, height) {
  const queue = [startIdx];
  const component = [];
  visited.add(startIdx);

  while (queue.length > 0) {
    const idx = queue.shift();
    component.push(idx);

    const x = idx % width;
    const y = Math.floor(idx / width);

    // Check 4-connected neighbors
    const neighbors = [
      (y - 1) * width + x,     // up
      (y + 1) * width + x,     // down
      y * width + (x - 1),     // left
      y * width + (x + 1)      // right
    ];

    for (const nIdx of neighbors) {
      if (!visited.has(nIdx) && colorPixels.has(nIdx)) {
        visited.add(nIdx);
        queue.push(nIdx);
      }
    }
  }

  return component;
}

// ─── Contour Extraction: Get boundary points ───────────────────────────────

function extractContourPoints(component, width, height) {
  const componentSet = new Set(component);
  const boundary = [];

  // Find boundary pixels (adjacent to non-component pixels)
  for (const idx of component) {
    const x = idx % width;
    const y = Math.floor(idx / width);

    const neighbors = [
      (y - 1) * width + x,
      (y + 1) * width + x,
      y * width + (x - 1),
      y * width + (x + 1)
    ];

    if (neighbors.some(n => !componentSet.has(n))) {
      boundary.push({ x, y, idx });
    }
  }

  if (boundary.length === 0) return [];

  // Simplify boundary to key points (convex hull approximation)
  const startPoint = boundary.reduce((a, b) => a.y < b.y ? a : b);
  const sorted = sortBoundaryPoints(boundary, startPoint);

  // Aggressively reduce points via Ramer-Douglas-Peucker simplification
  const simplified = douglasPeucker(sorted, 3); // Tolerance: 3 pixels

  // Normalize to [0,1] coordinates
  return simplified.map(p => [p.x / width, p.y / height]);
}

// ─── Ramer-Douglas-Peucker Simplification ─────────────────────────────────

function douglasPeucker(points, tolerance) {
  if (points.length < 3) return points;

  let maxDist = 0, maxIdx = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = pointToLineDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > tolerance) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), tolerance);
    const right = douglasPeucker(points.slice(maxIdx), tolerance);
    return left.slice(0, -1).concat(right);
  }

  return [start, end];
}

function pointToLineDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  
  const closest = { x: a.x + t * dx, y: a.y + t * dy };
  return Math.hypot(p.x - closest.x, p.y - closest.y);
}

function sortBoundaryPoints(boundary, start) {
  const cx = boundary.reduce((s, p) => s + p.x, 0) / boundary.length;
  const cy = boundary.reduce((s, p) => s + p.y, 0) / boundary.length;

  return boundary.sort((a, b) => {
    const angleA = Math.atan2(a.y - cy, a.x - cx);
    const angleB = Math.atan2(b.y - cy, b.x - cx);
    return angleA - angleB;
  });
}

// ─── Component Bounds ───────────────────────────────────────────────────────

function getComponentBounds(component, width, height) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  for (const idx of component) {
    const x = idx % width;
    const y = Math.floor(idx / width);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  return { minX, maxX, minY, maxY };
}

// ─── Perimeter Estimation ──────────────────────────────────────────────────

function estimatePerimeter(pathPoints) {
  if (pathPoints.length < 2) return 0;

  let perim = 0;
  for (let i = 0; i < pathPoints.length; i++) {
    const p1 = pathPoints[i];
    const p2 = pathPoints[(i + 1) % pathPoints.length];
    perim += Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  }

  return perim;
}