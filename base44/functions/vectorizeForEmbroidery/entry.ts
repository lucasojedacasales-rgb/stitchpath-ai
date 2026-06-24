/* global Deno */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Vectorize image for embroidery: ensures closed paths, optimizes geometry, separates by color
 */
Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'POST only' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const {
      pixels,
      width,
      height,
      width_mm = 100,
      height_mm = 100,
      color_count = 6,
      stitch_density = 0.7,
      detail_level = 'medium'
    } = payload;

    console.log(`[VECTORIZE] Starting: ${width}x${height}px → SVG`);

    // 1. Call robustVectorization backend
    const vectorRes = await base44.functions.invoke('robustVectorization', {
      pixels,
      width,
      height,
      width_mm,
      height_mm,
      color_count,
      stitch_density
    });

    if (!vectorRes?.data?.success || !vectorRes.data.data?.response?.regions) {
      throw new Error('Vectorization failed');
    }

    const regions = vectorRes.data.data.response.regions;

    console.log(`[VECTORIZE] Got ${regions.length} regions from vectorization`);

    // 2. Process regions: close paths, simplify, optimize
    const processedRegions = regions.map(r => processRegion(r, detail_level));

    // 3. Group by color into layers
    const layers = groupByColor(processedRegions);

    // 4. Generate SVG per layer
    const svgLayers = Object.entries(layers).map(([colorKey, regionList]) => {
      const [color, colorName] = colorKey.split('|');
      return generateSVGLayer(color, colorName, regionList, width_mm, height_mm);
    });

    // 5. Combine into single SVG with groups per color
    const combinedSVG = generateCombinedSVG(svgLayers, width_mm, height_mm);

    console.log(`[VECTORIZE] Generated ${svgLayers.length} color layers`);

    return Response.json({
      success: true,
      data: {
        svg: combinedSVG,
        layers: svgLayers.map(l => ({ color: l.color, name: l.name, pathCount: l.paths.length })),
        regionCount: regions.length,
        colorCount: svgLayers.length
      }
    });
  } catch (error) {
    console.error('[VECTORIZE] Error:', error.message);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});

// ============================================================================
// PATH PROCESSING: Ensure closed, simplify, optimize
// ============================================================================

function processRegion(region, detailLevel) {
  let path = region.path_points || region.stitches || [];
  
  // Convert stitches to normalized points if needed
  if (Array.isArray(path) && path.length > 0 && typeof path[0] === 'object' && 'x' in path[0]) {
    path = path.map(p => [p.x, p.y]);
  }

  if (path.length < 3) return null;

  // 1. Ensure path is closed
  path = ensureClosedPath(path);

  // 2. Simplify using Ramer-Douglas-Peucker
  const epsilon = getEpsilonForDetail(detailLevel);
  path = simplifyPath(path, epsilon);

  // 3. Remove collinear/redundant points
  path = removeRedundantPoints(path);

  return {
    ...region,
    path_points: path,
    pathLength: path.length,
    area: calculatePolygonArea(path)
  };
}

function ensureClosedPath(path) {
  if (path.length < 2) return path;
  
  const [x0, y0] = path[0];
  const [xN, yN] = path[path.length - 1];
  
  // If distance to close is < 1%, consider it closed
  const dist = Math.hypot(xN - x0, yN - y0);
  const pathLen = path.reduce((sum, [x, y], i) => {
    if (i === 0) return 0;
    const [px, py] = path[i - 1];
    return sum + Math.hypot(x - px, y - py);
  }, 0);

  // If not closed, append first point at end
  if (dist > pathLen * 0.01) {
    return [...path, [x0, y0]];
  }
  
  return path;
}

function getEpsilonForDetail(level) {
  const epsilons = { low: 0.1, medium: 0.05, high: 0.02 };
  return epsilons[level] || epsilons.medium;
}

/**
 * Ramer-Douglas-Peucker path simplification
 */
function simplifyPath(path, epsilon) {
  if (path.length < 3) return path;

  let maxDist = 0;
  let maxIdx = 0;

  // Find point with max distance from line segment
  const [x0, y0] = path[0];
  const [x1, y1] = path[path.length - 1];
  
  for (let i = 1; i < path.length - 1; i++) {
    const [x, y] = path[i];
    const dist = pointToLineDistance([x, y], [x0, y0], [x1, y1]);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  // Recurse if error is significant
  if (maxDist > epsilon) {
    const left = simplifyPath(path.slice(0, maxIdx + 1), epsilon);
    const right = simplifyPath(path.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [path[0], path[path.length - 1]];
}

function pointToLineDistance(point, lineStart, lineEnd) {
  const [x, y] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;

  const num = Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1);
  const den = Math.hypot(y2 - y1, x2 - x1);
  
  return den === 0 ? Math.hypot(x - x1, y - y1) : num / den;
}

function removeRedundantPoints(path) {
  if (path.length < 3) return path;

  const result = [path[0]];
  
  for (let i = 1; i < path.length; i++) {
    const prev = result[result.length - 1];
    const curr = path[i];
    const next = i < path.length - 1 ? path[i + 1] : path[0];

    // Check if three points are collinear
    const cross = (curr[0] - prev[0]) * (next[1] - prev[1]) - (curr[1] - prev[1]) * (next[0] - prev[0]);
    
    // Keep point if not collinear (cross product != 0)
    if (Math.abs(cross) > 0.001) {
      result.push(curr);
    }
  }

  return result.length >= 3 ? result : path;
}

function calculatePolygonArea(path) {
  if (path.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const [x1, y1] = path[i];
    const [x2, y2] = path[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  
  return Math.abs(area) / 2;
}

// ============================================================================
// COLOR GROUPING & SVG GENERATION
// ============================================================================

function groupByColor(regions) {
  const layers = {};

  for (const region of regions) {
    if (!region || !region.path_points) continue;

    const color = (region.color || '#808080').toLowerCase();
    const name = region.name || 'region';
    const key = `${color}|${name}`;

    if (!layers[key]) {
      layers[key] = [];
    }
    layers[key].push(region);
  }

  return layers;
}

function generateSVGLayer(color, name, regions, widthMm, heightMm) {
  const paths = [];

  for (const region of regions) {
    if (!region.path_points || region.path_points.length < 3) continue;

    const d = regionToSVGPath(region.path_points, widthMm, heightMm);
    paths.push(d);
  }

  return { color, name, paths };
}

function regionToSVGPath(pathPoints, widthMm, heightMm) {
  if (!pathPoints || pathPoints.length < 2) return '';

  const pxPerMmX = 10; // Convert mm to SVG pixels (10px/mm)
  const pxPerMmY = 10;

  let d = `M ${pathPoints[0][0] * pxPerMmX} ${pathPoints[0][1] * pxPerMmY}`;

  for (let i = 1; i < pathPoints.length; i++) {
    const [x, y] = pathPoints[i];
    d += ` L ${x * pxPerMmX} ${y * pxPerMmY}`;
  }

  d += ' Z'; // Close path

  return d;
}

function generateCombinedSVG(svgLayers, widthMm, heightMm) {
  const viewBoxWidth = widthMm * 10;
  const viewBoxHeight = heightMm * 10;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}" width="${widthMm}mm" height="${heightMm}mm">`;
  svg += `<defs><style>.stitch-path { fill: none; stroke-width: 0.5px; stroke-linecap: round; stroke-linejoin: round; }</style></defs>`;

  for (const layer of svgLayers) {
    const color = layer.color;
    svg += `<g id="color-${color.replace('#', '')}" data-color="${color}" data-name="${layer.name}">`;

    for (const pathD of layer.paths) {
      svg += `<path d="${pathD}" stroke="${color}" class="stitch-path" />`;
    }

    svg += '</g>';
  }

  svg += '</svg>';

  return svg;
}