/**
 * ce01TravelPathOptimizer.js — StitchPath AI
 * ─────────────────────────────────────────────────────────────────────────────
 * Optimizes the sewing ORDER and travel path of finalEmbroideryCommands
 * to reduce jumps and trims WITHOUT changing the visual design.
 *
 * Works ONLY on existing commands — never touches regions, vectors, colors,
 * or visual types. Only reorders blocks and regenerates transition jumps/trims.
 *
 * Pipeline:
 *   1. buildCommandBlocks  — group stitches into logical blocks by region
 *   2. sort by layer priority (fills → details → outlines)
 *   3. nearest-neighbor within each priority+color group (with reversal)
 *   4. rebuild command sequence with smart trim/jump insertion
 *   5. transactional validation — apply only if metrics improve ≥20%
 *
 * Smart trim rules:
 *   - jump > 8mm       → trim + jump
 *   - jump > 3.5mm     → jump (no trim)
 *   - jump ≤ 3.5mm     → jump (no trim)
 *   - color change     → implicit (colorChange command)
 *   - never trim between stitches within the same block
 */

import { calculateUnifiedCommandMetrics } from './unifiedCommandMetrics';

// ─── Layer priorities ────────────────────────────────────────────────────────

const LAYER_PRIORITY = {
  fill:          10,
  micro_fill:    20,
  detail_run:    30,
  contour_run:   35,
  inner_outline: 40,
  outer_outline: 50,
};

// ─── Layer type detection ────────────────────────────────────────────────────

function detectLayerType(cmd, region) {
  // 1. region_class (most specific — set by regionClassifier.js)
  const rc = region?.region_class;
  if (rc) {
    if (rc === 'outer_outline') return 'outer_outline';
    if (rc === 'inner_outline') return 'inner_outline';
    if (rc === 'detail_run' || rc === 'detail_satin' || rc === 'decorative_detail') return 'detail_run';
    if (rc === 'micro_fill') return 'micro_fill';
    if (rc === 'fill') return 'fill';
  }

  // 2. Region name hints (mouth, eye, cheek, etc.)
  const name = (region?.name || '').toLowerCase();
  if (name.includes('mouth') || name.includes('eye') || name.includes('cheek') ||
      name.includes('detail') || name.includes('sparkle') || name.includes('shine') ||
      name.includes('brillo') || name.includes('boca') || name.includes('ojo')) {
    return 'detail_run';
  }
  if (name.includes('outer') || name.includes('silhouette') || name.includes('exterior')) return 'outer_outline';
  if (name.includes('inner') || name.includes('contour') || name.includes('borde')) return 'inner_outline';

  // 3. Fall back to stitch type on the command
  const st = cmd.stitchType || region?.stitch_type || '';
  if (st === 'running_stitch' || st === 'contour') return 'contour_run';
  if (st === 'satin') return 'fill'; // satin treated as fill-level
  return 'fill';
}

// ─── Geometry helpers ────────────────────────────────────────────────────────

function dist(a, b) {
  if (!a || !b || a.x == null || b.x == null) return Infinity;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function computeBbox(commands) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let has = false;
  for (const c of commands) {
    if (c.x == null || !Number.isFinite(c.x)) continue;
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.y > maxY) maxY = c.y;
    has = true;
  }
  return has ? { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 } : null;
}

// ─── Block builder ───────────────────────────────────────────────────────────

/**
 * Groups flat commands into logical sewing blocks.
 * Each block = contiguous stitch commands for one region segment.
 * Leading transition jumps/trims are stripped (regenerated later).
 * Internal jumps (row transitions within a fill) are preserved.
 *
 * @param {Array} commands — flat command sequence
 * @param {Array} regions  — visual regions (for region_class lookup)
 * @returns {Array<Block>}
 */
export function buildCommandBlocks(commands, regions = []) {
  const regionMap = new Map();
  for (const r of regions) {
    if (r.id) regionMap.set(r.id, r);
  }

  const blocks = [];
  let blockId = 0;
  let i = 0;

  while (i < commands.length) {
    const c = commands[i];

    // Skip end / colorChange — they're separators, not blocks
    if (c.type === 'end' || c.type === 'colorChange') { i++; continue; }

    // Skip leading trims and transition jumps (before any stitch)
    if (c.type === 'trim' || c.type === 'jump') { i++; continue; }

    // ── Start a block at the first stitch ──
    if (c.type === 'stitch') {
      const regionId = c.regionId || 'unknown';
      const color = c.color || null;
      const region = regionMap.get(regionId);
      const layerType = detectLayerType(c, region);
      const stitchType = c.stitchType || region?.stitch_type || 'fill';

      const blockCmds = [];

      while (i < commands.length) {
        const cmd = commands[i];

        // Block separators
        if (cmd.type === 'end' || cmd.type === 'colorChange' || cmd.type === 'trim') break;

        // Different region → new block
      if ((cmd.regionId || 'unknown') !== regionId) break;

        // Same region: stitches and internal jumps
        blockCmds.push(cmd);
        i++;
      }

      if (blockCmds.length > 0) {
        const stitches = blockCmds.filter(c => c.type === 'stitch');
        const firstSt = stitches[0];
        const lastSt = stitches[stitches.length - 1];

        blocks.push({
          blockId: blockId++,
          regionId,
          color,
          stitchType,
          layerType,
          commands: blockCmds,
          startPoint: firstSt ? { x: firstSt.x, y: firstSt.y } : null,
          endPoint: lastSt ? { x: lastSt.x, y: lastSt.y } : null,
          bbox: computeBbox(blockCmds),
          priority: LAYER_PRIORITY[layerType] ?? 10,
          stitchCount: stitches.length,
          reverseable: stitches.length > 2,
        });
      }
    } else {
      i++;
    }
  }

  return blocks;
}

// ─── Nearest-neighbor ordering with reversal ────────────────────────────────

/**
 * Orders blocks by nearest-neighbor from a start point.
 * For reverseable blocks, considers starting from endPoint if closer.
 * Modifies block.commands in-place when reversing.
 */
function nearestNeighborOrder(blocks, startFrom) {
  if (blocks.length === 0) return [];
  const remaining = [...blocks];
  const ordered = [];
  let current = startFrom;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    let bestReverse = false;

    for (let i = 0; i < remaining.length; i++) {
      const b = remaining[i];

      // Normal: distance to startPoint
      const dStart = dist(current, b.startPoint);
      if (dStart < bestDist) {
        bestDist = dStart;
        bestIdx = i;
        bestReverse = false;
      }

      // Reversed: distance to endPoint (if reverseable)
      if (b.reverseable) {
        const dEnd = dist(current, b.endPoint);
        if (dEnd < bestDist) {
          bestDist = dEnd;
          bestIdx = i;
          bestReverse = true;
        }
      }
    }

    const chosen = remaining.splice(bestIdx, 1)[0];

    if (bestReverse && chosen.reverseable) {
      chosen.commands = [...chosen.commands].reverse();
      const tmp = chosen.startPoint;
      chosen.startPoint = chosen.endPoint;
      chosen.endPoint = tmp;
    }

    ordered.push(chosen);
    current = chosen.endPoint;
  }

  return ordered;
}

// ─── Block ordering: priority → color → nearest-neighbor ────────────────────

function optimizeBlockOrder(blocks) {
  // Group by priority
  const priorityGroups = new Map();
  for (const b of blocks) {
    const p = b.priority;
    if (!priorityGroups.has(p)) priorityGroups.set(p, []);
    priorityGroups.get(p).push(b);
  }

  const sortedPriorities = [...priorityGroups.keys()].sort((a, b) => a - b);
  const ordered = [];
  let currentEndPoint = null;

  for (const p of sortedPriorities) {
    const pBlocks = priorityGroups.get(p);

    // Within this priority, group by color (preserve original color order)
    const colorGroups = new Map();
    const colorOrder = [];
    for (const b of pBlocks) {
      const col = b.color || 'none';
      if (!colorGroups.has(col)) {
        colorGroups.set(col, []);
        colorOrder.push(col);
      }
      colorGroups.get(col).push(b);
    }

    // Nearest-neighbor within each color group
    for (const col of colorOrder) {
      const colBlocks = colorGroups.get(col);
      const nnOrdered = nearestNeighborOrder(colBlocks, currentEndPoint);
      ordered.push(...nnOrdered);
      if (nnOrdered.length > 0) {
        currentEndPoint = nnOrdered[nnOrdered.length - 1].endPoint;
      }
    }
  }

  return ordered;
}

// ─── Command sequence rebuild with smart trims ──────────────────────────────

function rebuildCommands(orderedBlocks, machineSettings) {
  const result = [];
  const trimThreshold = machineSettings.trimThreshold || 3.5;
  const longJumpThreshold = 8.0; // mm — trim only above this
  const maxJump = machineSettings.maxJumpLength || 12.1;
  let prevX = 0, prevY = 0;
  let prevColor = null;
  let firstBlock = true;

  for (const block of orderedBlocks) {
    if (!block.startPoint) continue;

    // Color change (only if color actually changed)
    if (block.color && block.color !== prevColor) {
      result.push({ type: 'colorChange', x: prevX, y: prevY, color: block.color, regionId: block.regionId });
      prevColor = block.color;
    }

    // Transition to block start
    const gap = Math.hypot(block.startPoint.x - prevX, block.startPoint.y - prevY);
    if (gap > 0.5) {
      // Trim only on long jumps (>8mm) — not on every >3.5mm
      if (!firstBlock && gap > longJumpThreshold) {
        result.push({ type: 'trim', x: prevX, y: prevY, color: block.color, regionId: block.regionId });
      }
      // Jump(s) to block start (split if > maxJump)
      const steps = Math.ceil(gap / maxJump);
      for (let s = 1; s <= steps; s++) {
        const jx = prevX + (block.startPoint.x - prevX) * s / steps;
        const jy = prevY + (block.startPoint.y - prevY) * s / steps;
        result.push({ type: 'jump', x: jx, y: jy, color: block.color, regionId: block.regionId });
      }
      prevX = block.startPoint.x;
      prevY = block.startPoint.y;
    }

    // Append block commands (stitches + internal jumps — intact)
    for (const cmd of block.commands) {
      result.push(cmd);
      if (cmd.type === 'stitch' || cmd.type === 'jump') {
        prevX = cmd.x;
        prevY = cmd.y;
      }
    }

    firstBlock = false;
  }

  // End terminator
  if (result.length > 0) {
    const last = result[result.length - 1];
    result.push({ type: 'end', x: last.x ?? 0, y: last.y ?? 0, color: null });
  } else {
    result.push({ type: 'end', x: 0, y: 0, color: null });
  }

  return result;
}

// ─── Main API — transactional optimizer ─────────────────────────────────────

/**
 * Optimizes the travel path of finalEmbroideryCommands.
 *
 * @param {Array}  commands        — flat command sequence (read-only input)
 * @param {Array}  regions         — visual regions (for layer type lookup)
 * @param {Object} machineSettings — maxJumpLength, trimThreshold, etc.
 * @returns {{
 *   applied: boolean,
 *   commands: Array,
 *   metricsBefore: Object,
 *   metricsAfter: Object,
 *   report: Object,
 * }}
 */
export function optimizeCE01TravelPath(commands, regions = [], machineSettings = {}) {
  console.log('[travel-opt] starting optimization');

  // ── Before metrics ──
  const metricsBefore = calculateUnifiedCommandMetrics(commands, regions, machineSettings);
  console.log('[travel-opt] jumps before:', metricsBefore.jumpCount);
  console.log('[travel-opt] trims before:', metricsBefore.trimCount);

  // ── 1. Build blocks ──
  const blocks = buildCommandBlocks(commands, regions);
  console.log('[travel-opt] blocks built:', blocks.length);

  const fills = blocks.filter(b => b.layerType === 'fill' || b.layerType === 'micro_fill');
  const details = blocks.filter(b => b.layerType === 'detail_run');
  const outlines = blocks.filter(b => b.layerType === 'inner_outline' || b.layerType === 'outer_outline' || b.layerType === 'contour_run');
  console.log('[travel-opt] fills:', fills.length);
  console.log('[travel-opt] details:', details.length);
  console.log('[travel-opt] outlines:', outlines.length);

  if (blocks.length === 0) {
    console.log('[travel-opt] discarded reason: no blocks built');
    return {
      applied: false,
      commands,
      metricsBefore,
      metricsAfter: metricsBefore,
      report: { blocksBuilt: 0, applied: false, discardedReason: 'no blocks built' },
    };
  }

  // ── 2. Optimize block order (priority → color → nearest-neighbor) ──
  const orderedBlocks = optimizeBlockOrder(blocks);

  // ── 3. Rebuild command sequence with smart trims ──
  const candidate = rebuildCommands(orderedBlocks, machineSettings);

  // ── 4. After metrics ──
  const metricsAfter = calculateUnifiedCommandMetrics(candidate, regions, machineSettings);
  console.log('[travel-opt] jumps after:', metricsAfter.jumpCount);
  console.log('[travel-opt] trims after:', metricsAfter.trimCount);

  // ── 5. Verify no blocks were lost ──
  const detailBlocksPreserved = orderedBlocks.filter(b => b.layerType === 'detail_run').length > 0;
  const outlineBlocksPreserved = orderedBlocks.filter(b =>
    b.layerType === 'outer_outline' || b.layerType === 'inner_outline' || b.layerType === 'contour_run'
  ).length > 0;
  console.log('[travel-opt] detail blocks preserved:', detailBlocksPreserved);
  console.log('[travel-opt] outline blocks preserved:', outlineBlocksPreserved);

  // ── 6. Transactional validation ──
  const jumpsBefore = metricsBefore.jumpCount;
  const jumpsAfter = metricsAfter.jumpCount;
  const trimsBefore = metricsBefore.trimCount;
  const trimsAfter = metricsAfter.trimCount;

  const jumpsReduction = jumpsBefore > 0 ? (jumpsBefore - jumpsAfter) / jumpsBefore : 0;
  const trimsReduction = trimsBefore > 0 ? (trimsBefore - trimsAfter) / trimsBefore : 0;

  // Stitch count must not change (we only reorder, never add/remove stitches)
  const stitchesPreserved = metricsAfter.stitchCount === metricsBefore.stitchCount;

  // No regressions allowed
  const outsideOk = metricsAfter.outsideHoop <= metricsBefore.outsideHoop;
  const longOk = metricsAfter.longStitches <= metricsBefore.longStitches;
  const shortOk = metricsAfter.shortStitches <= metricsBefore.shortStitches + 10; // small tolerance

  const applied =
    stitchesPreserved &&
    jumpsReduction >= 0.20 &&
    trimsReduction >= 0.20 &&
    outsideOk &&
    longOk &&
    shortOk &&
    detailBlocksPreserved === (details.length > 0) &&
    outlineBlocksPreserved === (outlines.length > 0);

  console.log('[travel-opt] applied:', applied);

  if (!applied) {
    let reason;
    if (!stitchesPreserved) reason = `stitch count changed (${metricsBefore.stitchCount} → ${metricsAfter.stitchCount})`;
    else if (jumpsReduction < 0.20) reason = `jumps reduction ${(jumpsReduction * 100).toFixed(1)}% < 20%`;
    else if (trimsReduction < 0.20) reason = `trims reduction ${(trimsReduction * 100).toFixed(1)}% < 20%`;
    else if (!outsideOk) reason = 'outsideHoop increased';
    else if (!longOk) reason = 'longStitches increased';
    else if (!shortOk) reason = 'shortStitches increased excessively';
    else reason = 'block preservation failed';

    console.log('[travel-opt] discarded reason:', reason);

    return {
      applied: false,
      commands,
      reason,
      metricsBefore,
      metricsAfter,
      report: {
        blocksBuilt: blocks.length,
        fills: fills.length,
        details: details.length,
        outlines: outlines.length,
        jumpsBefore,
        jumpsAfter,
        trimsBefore,
        trimsAfter,
        detailBlocksPreserved,
        outlineBlocksPreserved,
        applied: false,
        discardedReason: reason,
      },
    };
  }

  return {
    applied: true,
    commands: candidate,
    reason: null,
    metricsBefore,
    metricsAfter,
    report: {
      blocksBuilt: blocks.length,
      fills: fills.length,
      details: details.length,
      outlines: outlines.length,
      jumpsBefore,
      jumpsAfter,
      trimsBefore,
      trimsAfter,
      detailBlocksPreserved,
      outlineBlocksPreserved,
      applied: true,
    },
  };
}