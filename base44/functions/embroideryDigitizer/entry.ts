/* global Deno */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Intelligent embroidery digitizer: analyzes shapes, applies pull compensation,
 * generates optimal stitches (satin, fill, running) with underlays and trims
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
      regions,
      width_mm = 100,
      height_mm = 100,
      fabric_type = 'cotton',
      export_format = 'DST'
    } = payload;

    console.log(`[DIGITIZER] Processing ${regions.length} regions for ${fabric_type}`);

    if (!regions || regions.length === 0) {
      throw new Error('No regions provided');
    }

    // 1. Analyze each region and determine stitch type
    const analyzedRegions = regions.map(r => analyzeShape(r, fabric_type));

    // 2. Apply pull compensation
    const compensatedRegions = analyzedRegions.map(r => ({
      ...r,
      path_points: applyPullCompensation(r.path_points, fabric_type)
    }));

    // 3. Generate stitches with underlays
    const stitchBlocks = [];
    for (const region of compensatedRegions) {
      const blocks = generateStitchesForRegion(region);
      stitchBlocks.push(...blocks);
    }

    // 4. Optimize stitch sequence (reduce jumps)
    const optimized = optimizeStitchSequence(stitchBlocks);

    // 5. Convert to coordinate data
    const stitchCoords = optimized.map(b => ({
      ...b,
      stitches: b.stitches || []
    }));

    console.log(`[DIGITIZER] Generated ${stitchBlocks.length} stitch blocks, ${stitchCoords.reduce((s, b) => s + (b.stitches?.length || 0), 0)} total stitches`);

    return Response.json({
      success: true,
      data: {
        stitch_blocks: stitchCoords,
        total_stitches: stitchCoords.reduce((s, b) => s + (b.stitches?.length || 0), 0),
        block_count: stitchCoords.length,
        fabric_type,
        export_format
      }
    });
  } catch (error) {
    console.error('[DIGITIZER] Error:', error.message);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});

// ============================================================================
// SHAPE ANALYSIS: Determine optimal stitch type
// ============================================================================

function analyzeShape(region, fabricType) {
  const path = region.path_points || region.stitches || [];
  if (!path || path.length < 3) return region;

  // Calculate geometric properties
  const width = calculatePathWidth(path);
  const length = calculatePathLength(path);
  const curvature = analyzeCurvature(path);
  const isClosed = isPathClosed(path);
  const area = calculatePolygonArea(path);

  console.log(`[DIGITIZER] Analyzing region: width=${width.toFixed(2)}mm, length=${length.toFixed(2)}mm, curvature=${curvature.toFixed(2)}`);

  // AI decision rules
  let stitchType, params;

  if (width < 2.5 && length > width * 3) {
    // Narrow elongated → satin stitch
    stitchType = 'satin';
    params = {
      density: 0.4,
      angle: calculateOptimalAngle(path),
      underlay: 'center_walk',
      stitch_length: 2.0
    };
  } else if (width >= 2.5 && isClosed && area > 10) {
    // Large closed area → fill (tatami)
    stitchType = 'fill';
    params = {
      density: 0.35,
      angle: 45,
      underlay: 'zigzag',
      pattern: 'tatami',
      stitch_length: 2.5
    };
  } else {
    // Default: running stitch (contours, small details)
    stitchType = 'running_stitch';
    params = {
      stitch_length: 2.5,
      underlay: null
    };
  }

  console.log(`[DIGITIZER] Region type: ${stitchType}`);

  return {
    ...region,
    stitch_type: stitchType,
    stitch_params: params,
    geometry: { width, length, curvature, area, isClosed }
  };
}

function calculatePathWidth(path) {
  if (!path || path.length < 2) return 0;

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const [x, y] of path) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  return Math.min(maxX - minX, maxY - minY);
}

function calculatePathLength(path) {
  if (!path || path.length < 2) return 0;

  let length = 0;
  for (let i = 1; i < path.length; i++) {
    const [x1, y1] = path[i - 1];
    const [x2, y2] = path[i];
    length += Math.hypot(x2 - x1, y2 - y1);
  }

  return length;
}

function analyzeCurvature(path) {
  if (!path || path.length < 3) return 0;

  let totalCurvature = 0;
  let count = 0;

  for (let i = 1; i < path.length - 1; i++) {
    const [x0, y0] = path[i - 1];
    const [x1, y1] = path[i];
    const [x2, y2] = path[i + 1];

    const v1x = x1 - x0, v1y = y1 - y0;
    const v2x = x2 - x1, v2y = y2 - y1;

    const dot = v1x * v2x + v1y * v2y;
    const cross = v1x * v2y - v1y * v2x;

    const angle = Math.atan2(cross, dot);
    totalCurvature += Math.abs(angle);
    count++;
  }

  return count > 0 ? totalCurvature / count : 0;
}

function isPathClosed(path) {
  if (!path || path.length < 2) return false;

  const [x0, y0] = path[0];
  const [xN, yN] = path[path.length - 1];
  const dist = Math.hypot(xN - x0, yN - y0);

  return dist < 1.0; // Within 1mm threshold
}

function calculatePolygonArea(path) {
  if (!path || path.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const [x1, y1] = path[i];
    const [x2, y2] = path[i + 1];
    area += x1 * y2 - x2 * y1;
  }

  return Math.abs(area) / 2;
}

function calculateOptimalAngle(path) {
  if (!path || path.length < 2) return 45;

  // Calculate dominant direction
  let dx = 0, dy = 0;
  for (let i = 1; i < path.length; i++) {
    const [x0, y0] = path[i - 1];
    const [x1, y1] = path[i];
    dx += x1 - x0;
    dy += y1 - y0;
  }

  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  return angle + 45; // Perpendicular to direction
}

// ============================================================================
// PULL COMPENSATION: Adjust path for fabric stretch
// ============================================================================

function applyPullCompensation(path, fabricType) {
  const compensationFactors = {
    cotton: 1.05,
    polyester: 1.08,
    knit: 1.15,
    denim: 1.02,
    silk: 1.03
  };

  const factor = compensationFactors[fabricType] || 1.05;

  if (path.length < 2) return path;

  // Calculate centroid
  let cx = 0, cy = 0;
  for (const [x, y] of path) {
    cx += x;
    cy += y;
  }
  cx /= path.length;
  cy /= path.length;

  // Expand from centroid
  return path.map(([x, y]) => {
    const dx = (x - cx) * factor;
    const dy = (y - cy) * factor;
    return [cx + dx, cy + dy];
  });
}

// ============================================================================
// STITCH GENERATION: Create actual stitch blocks
// ============================================================================

function generateStitchesForRegion(region) {
  const { path_points, stitch_type, stitch_params } = region;

  if (!path_points || path_points.length < 3) return [];

  const blocks = [];

  // Generate underlay if specified
  if (stitch_params?.underlay) {
    const underlayStitches = generateUnderlay(path_points, stitch_params.underlay);
    blocks.push({
      id: `${region.id}_underlay`,
      type: 'underlay',
      color: region.color,
      stitches: underlayStitches
    });
  }

  // Generate main stitches based on type
  let mainStitches = [];

  if (stitch_type === 'fill') {
    mainStitches = generateTatamiStitches(path_points, stitch_params);
  } else if (stitch_type === 'satin') {
    mainStitches = generateSatinStitches(path_points, stitch_params);
  } else {
    mainStitches = generateRunningStitches(path_points, stitch_params);
  }

  blocks.push({
    id: region.id,
    type: stitch_type,
    color: region.color,
    stitches: mainStitches
  });

  // Add trim command
  blocks.push({
    id: `${region.id}_trim`,
    type: 'trim',
    command: 'TRIM'
  });

  return blocks;
}

function generateUnderlay(path, underlayType) {
  if (!path || path.length < 3) return [];

  const stitches = [];

  if (underlayType === 'zigzag') {
    // Simple zigzag along path
    for (let i = 0; i < path.length - 1; i++) {
      const [x1, y1] = path[i];
      const [x2, y2] = path[i + 1];
      stitches.push([x1, y1]);
      stitches.push([x2, y2]);
    }
  } else if (underlayType === 'center_walk') {
    // Walk down the center of the path
    const offset = 0.3; // 0.3mm offset
    for (const [x, y] of path) {
      stitches.push([x + offset, y + offset]);
    }
  }

  return stitches;
}

function generateTatamiStitches(path, params) {
  if (!path || path.length < 3) return [];

  const { density = 0.35, angle = 45 } = params;
  const angleRad = (angle * Math.PI) / 180;

  // Find bounds
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const [x, y] of path) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const spacing = 1.0 / density; // mm between stitch lines

  // Generate horizontal scanlines at angle
  const stitches = [];
  const diagLen = Math.hypot(width, height) + spacing * 2;

  for (let offset = -diagLen; offset < diagLen; offset += spacing) {
    let lineStart = null, lineEnd = null;

    // Rotate coordinate system
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    for (let s = -diagLen; s < diagLen; s += 0.2) {
      // Point in rotated space
      const rotX = offset;
      const rotY = s;

      // Transform back to original space
      const x = minX + width / 2 + rotX * cosA - rotY * sinA;
      const y = minY + height / 2 + rotX * sinA + rotY * cosA;

      // Check if point is inside polygon (simple bounds check for now)
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
        if (!lineStart) lineStart = [x, y];
        lineEnd = [x, y];
      } else if (lineStart && lineEnd) {
        stitches.push(lineStart);
        stitches.push(lineEnd);
        lineStart = null;
        lineEnd = null;
      }
    }

    if (lineStart && lineEnd) {
      stitches.push(lineStart);
      stitches.push(lineEnd);
    }
  }

  return stitches;
}

function generateSatinStitches(path, params) {
  if (!path || path.length < 3) return [];

  const { density = 0.4 } = params;
  const spacing = 1.0 / density;

  // Generate perpendicular stitches along path
  const stitches = [];

  for (let i = 0; i < path.length - 1; i += Math.max(1, Math.round(spacing))) {
    const [x1, y1] = path[i];
    const [x2, y2] = path[i + 1];

    // Direction perpendicular to path
    const dx = y2 - y1;
    const dy = -(x2 - x1);
    const len = Math.hypot(dx, dy);

    if (len > 0) {
      const ux = dx / len;
      const uy = dy / len;

      // Generate stitch across
      const width = 2.0; // 2mm wide satin
      stitches.push([x1 - ux * width / 2, y1 - uy * width / 2]);
      stitches.push([x1 + ux * width / 2, y1 + uy * width / 2]);
    }
  }

  return stitches;
}

function generateRunningStitches(path, params) {
  if (!path || path.length < 2) return [];

  const { stitch_length = 2.5 } = params;
  const stitches = [];

  // Resample path at stitch_length intervals
  let distSoFar = 0;
  for (let i = 1; i < path.length; i++) {
    const [x0, y0] = path[i - 1];
    const [x1, y1] = path[i];
    const segLen = Math.hypot(x1 - x0, y1 - y0);

    while (distSoFar + stitch_length <= segLen) {
      const t = (distSoFar + stitch_length) / segLen;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      stitches.push([x, y]);
      distSoFar = 0;
    }

    distSoFar += segLen;
  }

  return stitches.length > 0 ? stitches : path;
}

// ============================================================================
// SEQUENCE OPTIMIZATION: Minimize jumps and color changes
// ============================================================================

function optimizeStitchSequence(blocks) {
  if (blocks.length <= 1) return blocks;

  const trimmed = blocks.filter(b => b.type !== 'trim');
  const visited = new Set();
  const result = [];

  // Group by color
  const colorGroups = {};
  for (const block of trimmed) {
    const color = block.color || '#808080';
    if (!colorGroups[color]) colorGroups[color] = [];
    colorGroups[color].push(block);
  }

  // Process by color group
  for (const [color, group] of Object.entries(colorGroups)) {
    if (group.length === 0) continue;

    // Greedy: pick nearest unvisited block
    let current = group[0];
    visited.add(current.id);
    result.push(current);

    while (visited.size < group.length) {
      let nearest = null;
      let minDist = Infinity;

      for (const candidate of group) {
        if (visited.has(candidate.id)) continue;

        const dist = calculateBlockDistance(current, candidate);
        if (dist < minDist) {
          minDist = dist;
          nearest = candidate;
        }
      }

      if (nearest) {
        visited.add(nearest.id);
        result.push(nearest);
        current = nearest;
      } else {
        break;
      }
    }
  }

  // Re-add trims
  const withTrims = [];
  for (let i = 0; i < result.length; i++) {
    withTrims.push(result[i]);
    if (i < result.length - 1 && result[i].color !== result[i + 1].color) {
      withTrims.push({
        id: `trim_${i}`,
        type: 'trim',
        command: 'TRIM'
      });
    }
  }

  return withTrims;
}

function calculateBlockDistance(blockA, blockB) {
  if (!blockA.stitches?.length || !blockB.stitches?.length) return Infinity;

  const [x1, y1] = blockA.stitches[blockA.stitches.length - 1];
  const [x2, y2] = blockB.stitches[0];

  return Math.hypot(x2 - x1, y2 - y1);
}