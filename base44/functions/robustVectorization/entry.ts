import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * EMBROIDERY VECTORIZATION ENGINE - Complete Rewrite
 * 
 * Core principles:
 * 1. Independent color segmentation with binary masks
 * 2. Per-region contour detection and closure
 * 3. Geometry-based stitch type classification
 * 4. Clipped fill generation within region boundaries
 * 5. Closed contour paths with validation
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

    // ─── STEP 1: Color Quantization ──────────────────────────────────────────

    const maxColors = Math.min(Math.max(color_count || 6, 3), 10);
    const colorCounts = new Map();

    // Build histogram
    for (let i = 0; i < pixelArray.length; i += 4) {
      const a = pixelArray[i + 3];
      if (a < 128) continue;

      const r = pixelArray[i];
      const g = pixelArray[i + 1];
      const b = pixelArray[i + 2];
      const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
      colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
    }

    // Get top N colors
    const dominantColors = Array.from(colorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxColors)
      .map(([hex]) => hex);

    if (dominantColors.length === 0) {
      return Response.json({
        success: false,
        error: 'No valid colors detected',
        data: { regions: [], total_stitches: 0 }
      }, { status: 422 });
    }

    // ─── STEP 2: Per-Color Segmentation & Region Extraction ─────────────────

    for (const colorHex of dominantColors) {
      // Create binary mask for this color
      const mask = new Uint8Array(width * height);
      
      for (let i = 0; i < pixelArray.length; i += 4) {
        const a = pixelArray[i + 3];
        if (a < 128) continue;

        const r = pixelArray[i];
        const g = pixelArray[i + 1];
        const b = pixelArray[i + 2];
        const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');

        if (hex === colorHex) {
          mask[i / 4] = 1;
        }
      }

      // Find connected components in this mask
      const visited = new Uint8Array(width * height);
      const components = [];

      for (let idx = 0; idx < width * height; idx++) {
        if (!mask[idx] || visited[idx]) continue;

        // Flood fill to extract connected component
        const component = floodFillMask(idx, mask, visited, width, height);
        if (component.length > 15) {
          components.push(component);
        }
      }

      // ─── STEP 3: Per-Component Contour Detection & Classification ─────────

      for (const component of components) {
        const bounds = getBounds(component, width, height);
        const w_px = bounds.maxX - bounds.minX + 1;
        const h_px = bounds.maxY - bounds.minY + 1;
        const area_px2 = w_px * h_px;
        const area_mm2 = (area_px2 / (width * height)) * (width_mm * height_mm);

        // Skip if too small
        if (area_mm2 < 3) continue;

        // Extract closed contour for this component
        const contour = extractClosedContour(component, width, height);
        if (contour.length < 3) continue;

        // Normalize contour to [0,1] canvas coords
        const normalizedContour = contour.map(p => [p.x / width, p.y / height]);

        // Classify stitch type based on geometry
        const stitchType = classifyStitchType(normalizedContour, area_mm2);

        // Generate stitches for this region
        const stitches = stitchType === 'fill'
          ? generateFillStitches(normalizedContour, width_mm, height_mm, width, height)
          : generateContourStitches(normalizedContour, stitchType, width_mm, height_mm, width, height);

        if (stitches.length === 0) continue;

        const perimeter_mm = estimatePerimeter(normalizedContour) * Math.sqrt(width_mm * height_mm);

        regions.push({
          id: `r${regions.length}`,
          name: `${colorHex.slice(1, 4)}_${stitchType[0]}`,
          color: colorHex,
          stitch_type: stitchType,
          density: 0.7,
          angle: 45,
          path_points: normalizedContour,
          area_mm2,
          perimeter_mm,
          stitch_count: stitches.length,
          stitches, // Raw stitch points for validation
          visible: true
        });
      }
    }

    if (regions.length === 0) {
      return Response.json({
        success: false,
        error: 'No valid regions extracted',
        data: { regions: [], total_stitches: 0 }
      }, { status: 422 });
    }

    const totalStitches = regions.reduce((s, r) => s + (r.stitch_count || 0), 0);

    return Response.json({
      success: true,
      data: {
        regions: regions.map(r => {
          const { stitches, ...rest } = r;
          return rest;
        }),
        total_stitches: totalStitches,
        colors_used: dominantColors.length,
        generation_method: 'region_based_vectorization',
        vector_source: true
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

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

function floodFillMask(startIdx, mask, visited, width, height) {
  const queue = [startIdx];
  const component = [];
  visited[startIdx] = 1;

  while (queue.length > 0) {
    const idx = queue.shift();
    component.push(idx);

    const x = idx % width;
    const y = Math.floor(idx / width);
    const neighbors = [
      (y - 1) * width + x, (y + 1) * width + x,
      y * width + (x - 1), y * width + (x + 1)
    ];

    for (const nIdx of neighbors) {
      if (nIdx >= 0 && nIdx < width * height && !visited[nIdx] && mask[nIdx]) {
        visited[nIdx] = 1;
        queue.push(nIdx);
      }
    }
  }

  return component;
}

function getBounds(component, width, height) {
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

function extractClosedContour(component, width, height) {
  const componentSet = new Set(component);
  const boundary = [];

  // Find boundary pixels
  for (const idx of component) {
    const x = idx % width;
    const y = Math.floor(idx / width);
    const neighbors = [
      (y - 1) * width + x, (y + 1) * width + x,
      y * width + (x - 1), y * width + (x + 1)
    ];

    if (neighbors.some(n => !componentSet.has(n))) {
      boundary.push({ x, y });
    }
  }

  if (boundary.length === 0) return [];

  // Sort boundary points by angle from centroid
  const cx = boundary.reduce((s, p) => s + p.x, 0) / boundary.length;
  const cy = boundary.reduce((s, p) => s + p.y, 0) / boundary.length;

  boundary.sort((a, b) => {
    const angleA = Math.atan2(a.y - cy, a.x - cx);
    const angleB = Math.atan2(b.y - cy, b.x - cx);
    return angleA - angleB;
  });

  // Simplify with distance threshold
  const simplified = [];
  for (let i = 0; i < boundary.length; i++) {
    const p = boundary[i];
    const last = simplified[simplified.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 2) {
      simplified.push(p);
    }
  }

  // Ensure closed loop
  if (simplified.length > 2 && 
      (simplified[0].x !== simplified[simplified.length - 1].x || 
       simplified[0].y !== simplified[simplified.length - 1].y)) {
    simplified.push({ x: simplified[0].x, y: simplified[0].y });
  }

  return simplified;
}

function classifyStitchType(contour, area_mm2) {
  // Thin ring/border: width < 3mm
  if (contour.length > 8) {
    const bbox = getBoundingBox(contour);
    const minDim = Math.min(bbox.w, bbox.h);
    if (minDim < 0.03) return 'satin'; // < 3mm → satin/run
  }

  // Small area → running stitch (eyes, mouth, details)
  if (area_mm2 < 10) return 'running_stitch';

  // Medium → satin
  if (area_mm2 < 50) return 'satin';

  // Large → fill
  return 'fill';
}

function getBoundingBox(contour) {
  const xs = contour.map(p => p[0] || p.x);
  const ys = contour.map(p => p[1] || p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

function generateFillStitches(contour, width_mm, height_mm, width, height) {
  const stitches = [];
  const angle = (45 * Math.PI) / 180;
  const density = 0.7;
  const spacing = Math.max(0.5, 1.0 / density); // mm between lines
  const lineSpacing = (spacing / Math.sqrt(width_mm * height_mm)); // normalized spacing

  const bbox = getBoundingBox(contour);
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  const diag = Math.sqrt(bbox.w * bbox.w + bbox.h * bbox.h) + 0.1;

  // Generate parallel lines with polygon clipping
  for (let d = -diag; d < diag; d += lineSpacing) {
    // Line endpoints in normalized coords
    const x1 = cx + Math.cos(angle) * d - Math.sin(angle) * diag;
    const y1 = cy + Math.sin(angle) * d + Math.cos(angle) * diag;
    const x2 = cx + Math.cos(angle) * d + Math.sin(angle) * diag;
    const y2 = cy + Math.sin(angle) * d - Math.cos(angle) * diag;

    // Find all intersections with polygon edges
    const segments = getLinePolygonIntersections([x1, y1], [x2, y2], contour);
    
    // Add stitch pairs from intersections
    for (let i = 0; i < segments.length; i += 2) {
      if (i + 1 < segments.length) {
        stitches.push(segments[i]);
        stitches.push(segments[i + 1]);
      }
    }
  }

  return stitches;
}

function generateContourStitches(contour, stitchType, width_mm, height_mm, width, height) {
  const stitches = [];
  const spacing = stitchType === 'satin' ? 0.5 : 1.0; // mm
  const normSpacing = spacing / Math.sqrt(width_mm * height_mm);

  // Walk contour and add points at regular spacing
  let distAcc = 0;
  for (let i = 0; i < contour.length - 1; i++) {
    const p1 = contour[i];
    const p2 = contour[i + 1];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const segLen = Math.hypot(dx, dy);

    if (segLen === 0) continue;

    let t = 0;
    while (t <= 1) {
      const x = p1[0] + t * dx;
      const y = p1[1] + t * dy;
      stitches.push([x, y]);
      
      const nextDist = distAcc + normSpacing;
      t += (nextDist - distAcc) / segLen;
      distAcc = nextDist;
    }
  }

  return stitches;
}

/**
 * Find all intersections of a line with polygon edges
 * Returns sorted list of intersection points
 */
function getLinePolygonIntersections(p1, p2, polygon) {
  const intersections = [];

  for (let i = 0; i < polygon.length - 1; i++) {
    const a = polygon[i];
    const b = polygon[i + 1];
    const intersection = lineLineIntersection(p1, p2, a, b);
    
    if (intersection) {
      intersections.push(intersection);
    }
  }

  // Sort intersections along the line direction
  if (intersections.length > 0) {
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    intersections.sort((a, b) => {
      const distA = (a[0] - p1[0]) * dx + (a[1] - p1[1]) * dy;
      const distB = (b[0] - p1[0]) * dx + (b[1] - p1[1]) * dy;
      return distA - distB;
    });
  }

  return intersections;
}

/**
 * Find intersection of two line segments
 * Returns [x, y] or null
 */
function lineLineIntersection(p1, p2, p3, p4) {
  const x1 = p1[0], y1 = p1[1];
  const x2 = p2[0], y2 = p2[1];
  const x3 = p3[0], y3 = p3[1];
  const x4 = p4[0], y4 = p4[1];

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  
  if (Math.abs(denom) < 1e-10) return null; // Parallel

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  // Check if intersection is on both segments
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
  }

  return null;
}

function estimatePerimeter(contour) {
  if (contour.length < 2) return 0;
  let perim = 0;
  for (let i = 0; i < contour.length - 1; i++) {
    const p1 = contour[i];
    const p2 = contour[i + 1];
    perim += Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  }
  return perim;
}