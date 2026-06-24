/* global Deno */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Professional stitch sequence optimization:
 * 1. Center → outward (reduces distortion)
 * 2. Light → dark colors (prevents shadow bleed-through)
 * 3. Group by color (minimize color changes)
 * 4. Minimize jump stitches between elements
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
      stitch_blocks = [],
      width_mm = 100,
      height_mm = 100,
      strategy = 'professional'
    } = payload;

    console.log(`[OPTIMIZE] Processing ${stitch_blocks.length} stitch blocks`);

    if (!stitch_blocks || stitch_blocks.length === 0) {
      throw new Error('No stitch blocks provided');
    }

    // 1. Calculate center of design
    const center = calculateDesignCenter(stitch_blocks, width_mm, height_mm);
    console.log(`[OPTIMIZE] Design center: (${center.x.toFixed(1)}, ${center.y.toFixed(1)})`);

    // 2. Sort by proximity to center (outward expansion)
    const sortedByCenter = sortByProximityToCenter(stitch_blocks, center);

    // 3. Group by color (light → dark)
    const colorGroups = groupByColorOrder(sortedByCenter);

    // 4. Optimize within each color group
    const optimized = optimizeColorGroups(colorGroups, center);

    // 5. Calculate jump statistics
    const stats = calculateJumpStats(optimized);

    console.log(`[OPTIMIZE] Jump reduction: ${stats.totalJumpDistance.toFixed(1)}mm across ${stats.jumpCount} jumps`);

    return Response.json({
      success: true,
      data: {
        optimized_blocks: optimized,
        strategy,
        jump_stats: stats,
        center,
        block_count: optimized.length
      }
    });
  } catch (error) {
    console.error('[OPTIMIZE] Error:', error.message);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});

// ============================================================================
// DESIGN CENTER CALCULATION
// ============================================================================

function calculateDesignCenter(blocks, widthMm, heightMm) {
  if (!blocks || blocks.length === 0) {
    return { x: widthMm / 2, y: heightMm / 2 };
  }

  let sumX = 0, sumY = 0, count = 0;

  for (const block of blocks) {
    if (!block.stitches || block.stitches.length === 0) continue;

    for (const [x, y] of block.stitches) {
      sumX += x;
      sumY += y;
      count++;
    }
  }

  return {
    x: count > 0 ? sumX / count : widthMm / 2,
    y: count > 0 ? sumY / count : heightMm / 2
  };
}

// ============================================================================
// SORTING: CENTER → OUTWARD
// ============================================================================

function sortByProximityToCenter(blocks, center) {
  return [...blocks].sort((a, b) => {
    const distA = getBlockProximityToCenter(a, center);
    const distB = getBlockProximityToCenter(b, center);
    return distA - distB;
  });
}

function getBlockProximityToCenter(block, center) {
  if (!block.stitches || block.stitches.length === 0) return Infinity;

  // Use the block's centroid
  let cx = 0, cy = 0;
  for (const [x, y] of block.stitches) {
    cx += x;
    cy += y;
  }
  cx /= block.stitches.length;
  cy /= block.stitches.length;

  return Math.hypot(cx - center.x, cy - center.y);
}

// ============================================================================
// COLOR GROUPING: LIGHT → DARK (Professional rule)
// ============================================================================

function groupByColorOrder(blocks) {
  const colorMap = new Map();

  for (const block of blocks) {
    if (block.type === 'trim' || block.type === 'command') continue;

    const color = block.color || '#808080';
    if (!colorMap.has(color)) {
      colorMap.set(color, []);
    }
    colorMap.get(color).push(block);
  }

  // Sort colors from light → dark (by luminance)
  const sortedColors = Array.from(colorMap.entries())
    .map(([color, blocks]) => ({
      color,
      luminance: colorLuminance(color),
      blocks
    }))
    .sort((a, b) => b.luminance - a.luminance); // Dark first for substrate preparation

  return sortedColors;
}

function colorLuminance(hexColor) {
  const rgb = parseInt(hexColor.slice(1), 16);
  const r = (rgb >> 16) & 255;
  const g = (rgb >> 8) & 255;
  const b = rgb & 255;

  // Relative luminance per WCAG
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// ============================================================================
// OPTIMIZATION: MINIMIZE JUMPS WITHIN COLOR GROUPS
// ============================================================================

function optimizeColorGroups(colorGroups, center) {
  const optimized = [];

  for (const { color, blocks } of colorGroups) {
    // Optimize block sequence within this color group
    const optimizedGroup = optimizeBlockSequence(blocks, center);
    optimized.push(...optimizedGroup);

    // Add color change marker (trim) if not the last color
    if (colorGroups.indexOf({ color, blocks }) < colorGroups.length - 1) {
      optimized.push({
        id: `trim_after_${color}`,
        type: 'trim',
        command: 'TRIM',
        color
      });
    }
  }

  return optimized;
}

function optimizeBlockSequence(blocks, center) {
  if (blocks.length <= 1) return blocks;

  const result = [];
  const visited = new Set();

  // Start with block closest to center
  let current = blocks.reduce((closest, b) => {
    const distA = getBlockProximityToCenter(closest, center);
    const distB = getBlockProximityToCenter(b, center);
    return distB < distA ? b : closest;
  });

  result.push(current);
  visited.add(current.id);

  // Greedy: pick nearest unvisited block
  while (visited.size < blocks.length) {
    let nearest = null;
    let minDistance = Infinity;

    for (const candidate of blocks) {
      if (visited.has(candidate.id)) continue;

      const distance = calculateBlockDistance(current, candidate);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = candidate;
      }
    }

    if (nearest) {
      result.push(nearest);
      visited.add(nearest.id);
      current = nearest;
    } else {
      break;
    }
  }

  return result;
}

function calculateBlockDistance(blockA, blockB) {
  if (!blockA.stitches?.length || !blockB.stitches?.length) return Infinity;

  const [x1, y1] = blockA.stitches[blockA.stitches.length - 1];
  const [x2, y2] = blockB.stitches[0];

  return Math.hypot(x2 - x1, y2 - y1);
}

// ============================================================================
// JUMP STATISTICS
// ============================================================================

function calculateJumpStats(blocks) {
  let totalJumpDistance = 0;
  let jumpCount = 0;
  let colorChanges = 0;
  let trimCount = 0;

  for (let i = 0; i < blocks.length - 1; i++) {
    const current = blocks[i];
    const next = blocks[i + 1];

    if (current.type === 'trim' || next.type === 'trim') {
      trimCount++;
      continue;
    }

    // Jump distance: end of current block to start of next
    if (current.stitches?.length && next.stitches?.length) {
      const distance = calculateBlockDistance(current, next);
      if (distance > 0.1) { // Only count significant jumps (> 0.1mm)
        totalJumpDistance += distance;
        jumpCount++;
      }

      if (current.color !== next.color) {
        colorChanges++;
      }
    }
  }

  return {
    totalJumpDistance,
    jumpCount,
    colorChanges,
    trimCount,
    averageJumpDistance: jumpCount > 0 ? totalJumpDistance / jumpCount : 0
  };
}