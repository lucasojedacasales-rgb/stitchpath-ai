import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Stitch Generator API
 * 
 * POST /stitchGeneratorAPI
 * Body: {
 *   pixels: Uint8Array,
 *   width: number,
 *   height: number,
 *   color_count: number (default 6),
 *   width_mm: number (default 100),
 *   height_mm: number (default 100),
 *   stitch_density: number (default 0.7)
 * }
 * 
 * Returns: {
 *   success: boolean,
 *   regions: [
 *     {
 *       id: string,
 *       color: string (hex),
 *       stitch_type: 'fill' | 'satin' | 'running_stitch',
 *       path_points: [[x, y], ...],
 *       stitch_count: number,
 *       area_mm2: number,
 *       density: number,
 *       angle: number
 *     }
 *   ],
 *   total_stitches: number
 * }
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      pixels,
      width,
      height,
      color_count = 6,
      width_mm = 100,
      height_mm = 100,
      stitch_density = 0.7
    } = await req.json();

    if (!pixels || !width || !height) {
      return Response.json({ error: 'Missing: pixels, width, height' }, { status: 400 });
    }

    // Convert pixels to Uint8ClampedArray
    let pixelArray;
    if (pixels instanceof Uint8ClampedArray) {
      pixelArray = pixels;
    } else if (Array.isArray(pixels)) {
      pixelArray = new Uint8ClampedArray(pixels);
    } else {
      pixelArray = new Uint8ClampedArray(pixels);
    }

    const px_to_mm_x = width_mm / width;
    const px_to_mm_y = height_mm / height;

    // ─── PHASE 1: Color Detection ───────────────────────────────────────
    const dominantColors = detectDominantColors(pixelArray, width, height, color_count);
    
    if (dominantColors.length === 0) {
      return Response.json({
        success: false,
        error: 'No colors detected',
        regions: [],
        total_stitches: 0
      }, { status: 422 });
    }

    // ─── PHASE 2: Create binary masks ───────────────────────────────────
    const masks = createMasks(pixelArray, width, height, dominantColors);

    // ─── PHASE 3: Detect contours per color ────────────────────────────
    const regions = [];
    
    for (let colorIdx = 0; colorIdx < dominantColors.length; colorIdx++) {
      const color = dominantColors[colorIdx];
      const mask = masks[colorIdx];
      const contours = detectContours(mask, width, height);

      for (const contour of contours) {
        if (contour.length < 3) continue;

        // Convert pixels to mm
        const contourMM = contour.map(p => [p[0] * px_to_mm_x, p[1] * px_to_mm_y]);
        const simplified = simplifyPath(contourMM, 0.5);
        const closed = closePolygon(simplified);
        const area_mm2 = polygonArea(closed);

        if (area_mm2 < 0.5) continue;

        // Classify stitch type
        const stitch_type = classifyStitchType(closed, area_mm2);

        // Generate stitches
        let stitches = [];
        if (stitch_type === 'fill') {
          stitches = generateFillStitches(closed, stitch_density);
        } else if (stitch_type === 'satin') {
          stitches = generateSatinStitches(closed, stitch_density);
        } else {
          stitches = generateRunStitches(closed, stitch_density);
        }

        if (stitches.length > 0) {
          regions.push({
            id: `r${regions.length}`,
            color,
            stitch_type,
            path_points: closed.map(p => [p[0] / width_mm, p[1] / height_mm]),
            stitch_count: stitches.length,
            area_mm2,
            density: stitch_density,
            angle: 45,
            visible: true
          });
        }
      }
    }

    if (regions.length === 0) {
      return Response.json({
        success: false,
        error: 'No regions generated',
        regions: [],
        total_stitches: 0
      }, { status: 422 });
    }

    const totalStitches = regions.reduce((s, r) => s + r.stitch_count, 0);

    return Response.json({
      success: true,
      regions,
      total_stitches: totalStitches,
      colors_used: dominantColors.length
    });

  } catch (error) {
    return Response.json({
      success: false,
      error: error.message,
      regions: [],
      total_stitches: 0
    }, { status: 500 });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────

function detectDominantColors(pixelArray, width, height, colorCount) {
  const colorMap = new Map();
  
  for (let i = 0; i < pixelArray.length; i += 4) {
    const a = pixelArray[i + 3];
    if (a < 128) continue;
    
    const r = pixelArray[i];
    const g = pixelArray[i + 1];
    const b = pixelArray[i + 2];
    const hex = rgbToHex(r, g, b);
    colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
  }

  if (colorMap.size === 0) return [];

  return Array.from(colorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.min(colorCount, colorMap.size))
    .map(([hex]) => hex);
}

function createMasks(pixelArray, width, height, colors) {
  return colors.map(colorHex => {
    const mask = Array(height).fill(null).map(() => Array(width).fill(0));
    
    for (let i = 0; i < pixelArray.length; i += 4) {
      const a = pixelArray[i + 3];
      if (a < 128) continue;

      const r = pixelArray[i];
      const g = pixelArray[i + 1];
      const b = pixelArray[i + 2];
      const px = rgbToHex(r, g, b);

      if (px === colorHex) {
        const idx = i / 4;
        const y = Math.floor(idx / width);
        const x = idx % width;
        if (x >= 0 && x < width && y >= 0 && y < height) {
          mask[y][x] = 1;
        }
      }
    }
    
    return mask;
  });
}

function detectContours(mask, width, height) {
  const contours = [];
  const visited = new Set();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y]?.[x] === 1 && !visited.has(`${x},${y}`)) {
        const contour = traceContour(mask, x, y, width, height, visited);
        if (contour.length >= 3) {
          contours.push(contour);
        }
      }
    }
  }

  return contours;
}

function traceContour(mask, startX, startY, width, height, visited) {
  const contour = [];
  let x = startX, y = startY;
  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  let dirIdx = 0;
  const getKey = (px, py) => `${px},${py}`;

  do {
    contour.push([x, y]);
    visited.add(getKey(x, y));

    let found = false;
    for (let i = 0; i < 4; i++) {
      const [dx, dy] = directions[(dirIdx + i) % 4];
      const nx = x + dx, ny = y + dy;

      if (nx >= 0 && nx < width && ny >= 0 && ny < height && mask[ny]?.[nx] === 1 && !visited.has(getKey(nx, ny))) {
        x = nx;
        y = ny;
        dirIdx = (dirIdx + i) % 4;
        found = true;
        break;
      }
    }

    if (!found) break;
  } while ((x !== startX || y !== startY) && contour.length < width * height);

  return contour;
}

function simplifyPath(path, tolerance) {
  if (path.length <= 2) return path;
  
  const dmax = [];
  let maxDist = 0, index = 0;

  for (let i = 1; i < path.length - 1; i++) {
    const dist = pointToLineDistance(path[i], path[0], path[path.length - 1]);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > tolerance) {
    const rec1 = simplifyPath(path.slice(0, index + 1), tolerance);
    const rec2 = simplifyPath(path.slice(index), tolerance);
    return rec1.slice(0, -1).concat(rec2);
  } else {
    return [path[0], path[path.length - 1]];
  }
}

function pointToLineDistance(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(point[0] - a[0], point[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / len2));
  const projX = a[0] + t * dx;
  const projY = a[1] + t * dy;
  return Math.hypot(point[0] - projX, point[1] - projY);
}

function closePolygon(path) {
  if (path.length > 0) {
    const last = path[path.length - 1];
    const first = path[0];
    if (last[0] !== first[0] || last[1] !== first[1]) {
      return [...path, [first[0], first[1]]];
    }
  }
  return path;
}

function polygonArea(polygon) {
  let area = 0;
  for (let i = 0; i < polygon.length - 1; i++) {
    const p1 = polygon[i];
    const p2 = polygon[i + 1];
    area += (p2[0] - p1[0]) * (p2[1] + p1[1]) / 2;
  }
  return Math.abs(area);
}

function classifyStitchType(contour, area_mm2) {
  if (area_mm2 < 10) return 'running_stitch';
  
  const minX = Math.min(...contour.map(p => p[0]));
  const maxX = Math.max(...contour.map(p => p[0]));
  const minY = Math.min(...contour.map(p => p[1]));
  const maxY = Math.max(...contour.map(p => p[1]));
  const width = maxX - minX;
  const height = maxY - minY;
  const aspectRatio = Math.max(width, height) / Math.min(width, height);

  if (area_mm2 < 50 && aspectRatio < 3) return 'satin';
  return 'fill';
}

function generateFillStitches(contour, density) {
  const stitches = [];
  const spacing = Math.max(0.3, 1.5 / density);
  const minY = Math.min(...contour.map(p => p[1]));
  const maxY = Math.max(...contour.map(p => p[1]));

  for (let y = minY; y <= maxY; y += spacing) {
    const intersections = [];

    for (let i = 0; i < contour.length - 1; i++) {
      const p1 = contour[i];
      const p2 = contour[i + 1];

      if ((p1[1] <= y && p2[1] > y) || (p2[1] <= y && p1[1] > y)) {
        const t = (y - p1[1]) / (p2[1] - p1[1]);
        const x = p1[0] + t * (p2[0] - p1[0]);
        intersections.push(x);
      }
    }

    intersections.sort((a, b) => a - b);

    for (let i = 0; i < intersections.length - 1; i += 2) {
      const x0 = intersections[i];
      const x1 = intersections[i + 1];
      const steps = Math.max(1, Math.ceil((x1 - x0) / 0.7));

      for (let step = 0; step <= steps; step++) {
        const x = x0 + (x1 - x0) * (step / steps);
        stitches.push({ x, y });
      }
    }
  }

  return stitches;
}

function generateSatinStitches(contour, density) {
  const stitches = [];
  const minLen = Math.min(contour.length, 50);
  
  for (let i = 0; i < minLen; i++) {
    const p = contour[i];
    stitches.push({ x: p[0], y: p[1] });
  }

  return stitches;
}

function generateRunStitches(contour, density) {
  const stitches = [];
  const spacing = Math.max(0.3, 0.7 / density);

  for (let i = 0; i < contour.length - 1; i++) {
    const p1 = contour[i];
    const p2 = contour[i + 1];
    const dist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(1, Math.ceil(dist / spacing));

    for (let step = 0; step <= steps; step++) {
      const t = steps > 0 ? step / steps : 0;
      const x = p1[0] + (p2[0] - p1[0]) * t;
      const y = p1[1] + (p2[1] - p1[1]) * t;
      stitches.push({ x, y });
    }
  }

  return stitches;
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
}