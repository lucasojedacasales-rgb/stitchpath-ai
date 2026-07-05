/**
 * Professional Export Pipeline — StitchPath AI
 * ─────────────────────────────────────────────────────────────────────────────
 * Separates stitch GENERATION from file WRITING.
 *
 * Flow:
 *   regions → buildStitchObjects → validatePipeline → autoFix → encode (backend)
 *
 * 13 validation rules (all must pass before export):
 *   R1  Excessive stitch length      — stitch > maxStitchLength (12.1mm DST)
 *   R2  Jumps too long               — jump > maxJumpLength (12.1mm DST)
 *   R3  Coordinates outside hoop     — |x|>hoopW/2 or |y|>hoopH/2
 *   R4  Empty objects                — region with 0 stitches
 *   R5  Open regions                 — polygon not closed
 *   R6  Unnecessary trims            — trim with <2 stitches after, or consecutive trims
 *   R7  Redundant color changes      — same color consecutive
 *   R8  Illegal command sequences    — colorChange/trim/end at wrong position
 *   R9  Missing END command          — no END terminator
 *   R10 Corrupt blocks               — block with <2 points or degenerate
 *   R11 Invalid offsets              — offset pushes coords outside hoop
 *   R12 NaN / Infinite coordinates   — non-finite x or y
 *   R13 Jump without trim            — jump >3.5mm without preceding trim (home machine rule)
 */

import { optimizeObjectOrder, processObjectStitches } from './industrialStitchProcessor';
import { generateCE01SafeFillCommands } from './ce01SafeFillGenerator.js';
import { sanitizeCommandsForCE01 } from './ce01CommandSanitizer.js';
import { repairCE01FinalCommands } from './ce01FinalCommandRepair.js';
import { optimizeCE01TravelPath } from './ce01TravelPathOptimizer.js';
import { optimizeCE01Trims } from './ce01TrimOptimizer.js';
import { buildContourObjects, generateContourStitches, contoursPreservedInOptimization } from './contourExportBuilder.js';
import { contourRefineGuard, validateContourRefinement } from './contourRefineValidator.js';
import { auditAndCleanGeometry } from './geometryAudit.js';
import { validateFinalContourCommandsAgainstDarkMask } from './contourSegmentValidator.js';
import { applyProfessionalStitchPlannerRepair } from './professionalStitchPlannerRepair.js';

// ─── Machine format limits (DST/DSB physical constraints) ───────────────────
const FORMAT_LIMITS = {
  DST: { maxStitch: 12.1, maxJump: 12.1, coordRange: 121, unit: 0.1 },
  DSB: { maxStitch: 12.1, maxJump: 12.1, coordRange: 121, unit: 0.1 },
  PES: { maxStitch: 12.7, maxJump: 12.7, coordRange: 4095, unit: 0.1 },
  JEF: { maxStitch: 12.7, maxJump: 12.7, coordRange: 32767, unit: 0.1 },
};

export const DEFAULT_MACHINE = {
  maxStitchLength: 12.1,
  maxJumpLength: 12.1,
  hoopSize: [100, 100],     // mm
  designOffset: [0, 0],     // mm
  trimThreshold: 3.5,       // mm — home machine: trim at 3-4mm (Caydo CE01 rule)
  minStitchLength: 0.3,     // mm — below this = degenerate
};

// ═══════════════════════════════════════════════════════════════════════════
//  STAGE 1: REGIONS → STITCH OBJECTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Converts design regions into machine stitch objects.
 * Each object = one region's contribution: a color block + stitches (mm coords).
 *
 * @param {Array} regions — enriched regions from the editor
 * @param {Object} config — { width_mm, height_mm }
 * @returns {Array<{ id, color, name, stitch_type, points, priority }>}
 *   points: Array<[x_mm, y_mm]> absolute coordinates (already scaled to mm)
 */
/**
 * Assigns embroidery layer priority based on region metadata.
 *   fill → 10, micro_fill → 20, detail_run → 70, inner_outline → 80, outer_outline → 90
 * Lower priority = sewn first (fills before details before outlines).
 */
function getRegionPriority(r) {
  // Explicit priority from region (if already set by region builder)
  if (r.priority != null && r.priority > 0) return r.priority;

  const rc = r.region_class || r.layerType || '';
  if (rc === 'outer_outline') return 90;
  if (rc === 'inner_outline') return 80;
  if (rc === 'detail_run' || rc === 'detail') return 70;
  if (rc === 'micro_fill') return 20;

  // Infer from name + stitch type
  const name = (r.name || '').toLowerCase();
  if (name.includes('outer_outline') || name.includes('outer outline')) return 90;
  if (name.includes('inner_outline') || name.includes('inner outline')) return 80;
  if (name.includes('mouth') || name.includes('detail')) return 70;
  if (name.includes('outline') || name.includes('contour')) return 85;
  if (r.stitch_type === 'running_stitch') return 70;
  if (r.stitch_type === 'satin') return 20;
  return 10; // fill default
}

function getProfessionalFillAngle(points = []) {
  if (!points || points.length < 3) return 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const width = Math.max(0.01, maxX - minX);
  const height = Math.max(0.01, maxY - minY);
  const ratio = width / height;
  if (ratio > 1.8) return 0;
  if (ratio > 1.2) return 15;
  if (ratio < 0.55) return 90;
  if (ratio < 0.85) return 75;
  return 30;
}

export function buildStitchObjects(regions, config = {}) {
  const w = config.width_mm || 100;
  const h = config.height_mm || 100;
  const objects = [];
  const ce01Flag = config.ce01SafeFillMode !== false;
  console.log(`[ce01-safe-fill-wire] ce01SafeFillMode: ${ce01Flag}`);
  console.log(`[ce01-safe-fill-wire] config received by planner: ${JSON.stringify({ width_mm: w, height_mm: h, mode: config.mode, ce01SafeFillMode: ce01Flag })}`);

  for (const r of regions) {
    if (r.visible === false) continue;
    const pts = r.path_points || [];
    if (pts.length < 2) continue;

    // Convert normalized [0-1] → mm, centered at origin (hoop center)
    const mmPoints = pts.map(([nx, ny]) => [
      (nx - 0.5) * w,
      (ny - 0.5) * h,
    ]);

    objects.push({
      id: r.id || `obj_${objects.length + 1}`,
      color: r.color || '#000000',
      name: r.name || 'region',
      stitch_type: r.stitch_type || 'fill',
      priority: getRegionPriority(r),
      layerType: r.region_class || r.layerType || '',
      density: r.density || config.learnedFillDensityMm || 0.4,
      angle: r.angle ?? getProfessionalFillAngle(mmPoints),
      points: mmPoints,
      rawRegion: r,
      ce01SafeFillMode: ce01Flag,
    });
  }

  // ── Generate contour objects (always for export — real stitches, not visual) ──
  const { objects: contourObjs } = buildContourObjects(regions, config);
  objects.push(...contourObjs);

  // Sort by priority (fills=10 → micro_fill=20 → details=70 → inner=80 → outer=90)
  objects.sort((a, b) => (a.priority || 5) - (b.priority || 5));
  return objects;
}

// ═══════════════════════════════════════════════════════════════════════════
//  STAGE 2: STITCH OBJECTS → FLAT STITCH SEQUENCE (commands)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Flattens objects into a linear sequence of machine commands:
 *   { type: 'stitch'|'jump'|'colorChange'|'trim'|'end', x, y, color }
 *
 * Applies offset and breaks long stitches into sub-stitches.
 * This is the GENERATION stage — no file bytes yet.
 */
export function flattenToCommands(objects, machine = DEFAULT_MACHINE) {
  const ms = { ...DEFAULT_MACHINE, ...machine };
  const [offX, offY] = ms.designOffset;
  const cmds = [];
  let prevColor = null;
  let prevX = 0, prevY = 0;
  let firstCmd = true;

  // Industrial: optimize object order — color grouping + nearest-neighbor
  const ordered = optimizeObjectOrder(objects);
  const fillRouted = ordered.filter(o => o.stitch_type === 'fill' && o.ce01SafeFillMode).length;
  const contourRouted = ordered.filter(o => o.stitch_type === 'contour' || o.stitch_type === 'running_stitch').length;
  console.log(`[ce01-safe-fill-wire] regions input: ${ordered.length}`);
  console.log(`[ce01-safe-fill-wire] fill regions routed to CE01 generator: ${fillRouted}`);
  console.log(`[ce01-safe-fill-wire] contour regions routed to running: ${contourRouted}`);
  console.log(`[ce01-safe-fill-wire] old fill generator bypassed: ${fillRouted}`);

  for (const obj of ordered) {
    if (!obj.points || obj.points.length === 0) continue;

    // CE01 safe fill: generate commands directly, bypassing processObjectStitches
    if (obj.stitch_type === 'fill' && obj.ce01SafeFillMode) {
      const fillCmds = generateCE01SafeFillCommands(obj, { machineSettings: ms, designOffset: [offX, offY], fillSpacingMm: obj.density });
      if (fillCmds.length > 0) {
        if (prevColor !== null && obj.color !== prevColor) {
          cmds.push({ type: 'colorChange', x: prevX, y: prevY, color: obj.color, regionId: obj.id });
        }
        prevColor = obj.color;
        const fc = fillCmds[0];
        const startDist = Math.hypot(fc.x - prevX, fc.y - prevY);
        if (startDist > 0.5) {
          if (!firstCmd && startDist > ms.trimThreshold) {
            cmds.push({ type: 'trim', x: prevX, y: prevY, color: obj.color, regionId: obj.id });
          }
          const steps = Math.ceil(startDist / ms.maxJumpLength);
          for (let s = 1; s <= steps; s++) {
            cmds.push({ type: 'jump', x: prevX + (fc.x - prevX) * s / steps, y: prevY + (fc.y - prevY) * s / steps, color: obj.color, regionId: obj.id });
          }
          prevX = fc.x; prevY = fc.y;
        }
        cmds.push(...fillCmds);
        const last = fillCmds[fillCmds.length - 1];
        prevX = last.x; prevY = last.y;
        firstCmd = false;
      }
      continue;
    }

    // Contour objects: dedicated stitch generation (satin / triple run / run)
    // Non-contour: industrial processing (redundant removal + density + underlay + tie-in/off)
    const stitchPoints = obj.isContour
      ? generateContourStitches(obj, ms)
      : processObjectStitches(obj, ms);
    if (stitchPoints.length < 2) continue;

    // Color change (skip if same as previous)
    if (prevColor !== null && obj.color !== prevColor) {
      cmds.push({ type: 'colorChange', x: prevX, y: prevY, color: obj.color, regionId: obj.id });
    }
    prevColor = obj.color;

    // Jump to start if far from current position (including first object from origin 0,0)
    const [sx, sy] = stitchPoints[0];
    const startX = sx + offX, startY = sy + offY;
    const startDist = Math.hypot(startX - prevX, startY - prevY);
    if (startDist > 0.5) {
      // Insert jump(s) from current position to first stitch point
      if (!firstCmd && startDist > ms.trimThreshold) {
        cmds.push({ type: 'trim', x: prevX, y: prevY, color: obj.color, regionId: obj.id });
      }
      const steps = Math.ceil(startDist / ms.maxJumpLength);
      for (let s = 1; s <= steps; s++) {
        const jx = prevX + (startX - prevX) * s / steps;
        const jy = prevY + (startY - prevY) * s / steps;
        cmds.push({ type: 'jump', x: jx, y: jy, color: obj.color, regionId: obj.id });
      }
      prevX = startX;
      prevY = startY;
    }

    // Stitch all points (tie-in + underlay + main + tie-off)
    // Points may carry a 3rd element: 'J' = jump, 'S' or undefined = stitch
    const isFill = obj.stitch_type === 'fill';
    for (let i = 0; i < stitchPoints.length; i++) {
      const pt = stitchPoints[i];
      const x = pt[0] + offX;
      const y = pt[1] + offY;
      const isJump = pt[2] === 'J';

      if (isJump) {
        // Jump to next span start — never stitch across polygon gaps
        const jDist = Math.hypot(x - prevX, y - prevY);
        if (jDist > 0.5) {
          const jSteps = Math.ceil(jDist / ms.maxJumpLength);
          for (let s = 1; s <= jSteps; s++) {
            const jx = prevX + (x - prevX) * s / jSteps;
            const jy = prevY + (y - prevY) * s / jSteps;
            cmds.push({ type: 'jump', x: jx, y: jy, color: obj.color, regionId: obj.id });
          }
          prevX = x; prevY = y;
        }
        continue;
      }

      // Stitch
      const dist = Math.hypot(x - prevX, y - prevY);
      if (dist > ms.maxStitchLength) {
        const steps = Math.ceil(dist / ms.maxStitchLength);
        for (let s = 1; s < steps; s++) {
          const sx = prevX + (x - prevX) * s / steps;
          const sy = prevY + (y - prevY) * s / steps;
          cmds.push({ type: 'stitch', x: sx, y: sy, color: obj.color, regionId: obj.id,
            stitchType: obj.stitch_type, source: isFill ? 'clipped_fill_optimized' : 'standard', layerType: obj.layerType });
        }
      }
      cmds.push({ type: 'stitch', x, y, color: obj.color, regionId: obj.id,
        stitchType: obj.stitch_type, source: isFill ? 'clipped_fill_optimized' : 'standard', layerType: obj.layerType });
      prevX = x; prevY = y;
      firstCmd = false;
    }
  }

  // END terminator
  if (cmds.length > 0) {
    const last = cmds[cmds.length - 1];
    cmds.push({ type: 'end', x: last.x, y: last.y, color: null });
  } else {
    cmds.push({ type: 'end', x: 0, y: 0, color: null });
  }

  // ── Source validation ──────────────────────────────────────────────────
  const sourceStats = {};
  for (const c of cmds) {
    if (c.type === 'stitch' || c.type === 'jump') {
      const s = c.source || 'unknown';
      sourceStats[s] = (sourceStats[s] || 0) + 1;
    }
  }
  console.log('[ce01-safe-fill-wire] commands regenerated:', cmds.length);
  console.log('[ce01-safe-fill-wire] command sources:', sourceStats);
  if (sourceStats.clipped_fill_optimized > 0 && fillRouted > 0) {
    console.warn('[ce01-safe-fill-wire] WARNING: old fill generator still active — clipped_fill_optimized:', sourceStats.clipped_fill_optimized);
  }

  return cmds;
}

// ═══════════════════════════════════════════════════════════════════════════
//  STAGE 3: VALIDATION — 12 RULES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Runs all 12 validation rules against the command sequence.
 * Returns { passed, errors, warnings, fixableIssues }.
 * If errors.length > 0 → export MUST be cancelled.
 */
export function validatePipeline(commands, objects, machine = DEFAULT_MACHINE, format = 'DST') {
  const ms = { ...DEFAULT_MACHINE, ...machine };
  const limits = FORMAT_LIMITS[format] || FORMAT_LIMITS.DST;
  const [hw, hh] = ms.hoopSize;
  const errors = [];
  const warnings = [];
  const fixable = [];

  if (commands.length === 0) {
    errors.push({ rule: 'R4', message: 'Secuencia de comandos vacía — no hay puntadas.' });
    return { passed: false, errors, warnings, fixable };
  }

  let prevX = 0, prevY = 0;
  let prevColor = null;
  let stitchCount = 0;
  let hasEnd = false;
  let consecutiveTrims = 0;
  let stitchesSinceLastCmd = 0;

  for (let i = 0; i < commands.length; i++) {
    const c = commands[i];

    // R12: NaN / Infinite coordinates
    if (c.x !== undefined && (!Number.isFinite(c.x) || !Number.isFinite(c.y))) {
      errors.push({ rule: 'R12', index: i, message: `Coordenada inválida (NaN/Inf) en comando ${i}: x=${c.x} y=${c.y}` });
      continue;
    }

    // R3: Coordinates outside hoop
    if (c.type === 'stitch' || c.type === 'jump') {
      if (Math.abs(c.x) > hw / 2 || Math.abs(c.y) > hh / 2) {
        errors.push({ rule: 'R3', index: i, message: `Puntada fuera del bastidor (${hw}×${hh}mm): x=${c.x.toFixed(1)} y=${c.y.toFixed(1)}` });
      }
    }

    // R1: Excessive stitch length
    if (c.type === 'stitch') {
      const dist = Math.hypot(c.x - prevX, c.y - prevY);
      if (dist > limits.maxStitch) {
        errors.push({ rule: 'R1', index: i, message: `Puntada excesiva ${dist.toFixed(1)}mm > ${limits.maxStitch}mm en comando ${i}` });
        fixable.push({ rule: 'R1', index: i, dist });
      }
      stitchCount++;
      stitchesSinceLastCmd++;
    }

    // R2: Jump too long
    if (c.type === 'jump') {
      const dist = Math.hypot(c.x - prevX, c.y - prevY);
      if (dist > limits.maxJump) {
        errors.push({ rule: 'R2', index: i, message: `Salto excesivo ${dist.toFixed(1)}mm > ${limits.maxJump}mm en comando ${i}` });
        fixable.push({ rule: 'R2', index: i, dist });
      }
      // R13: Jump > trimThreshold without preceding trim — home machine rule
      // Only check the FIRST jump in a consecutive sequence (sub-jumps are part of same travel)
      // Skip: position 0 (start of design) and after colorChange (machine auto-trims on color change)
      const isFirstInJumpSeq = i === 0 || commands[i - 1].type !== 'jump';
      const prevCmd = i > 0 ? commands[i - 1] : null;
      const hasStitchBefore = prevCmd && (prevCmd.type === 'stitch' || prevCmd.type === 'jump');
      if (isFirstInJumpSeq && hasStitchBefore && dist > ms.trimThreshold && prevCmd.type !== 'trim') {
        errors.push({ rule: 'R13', index: i, message: `Salto de ${dist.toFixed(1)}mm sin trim previo — requiere corte de hilo (>${ms.trimThreshold}mm)` });
        fixable.push({ rule: 'R13', index: i });
      }
    }

    // R7: Redundant color change
    if (c.type === 'colorChange') {
      if (c.color === prevColor) {
        errors.push({ rule: 'R7', index: i, message: `Cambio de color redundante: mismo color (${c.color}) consecutivo` });
        fixable.push({ rule: 'R7', index: i });
      }
      prevColor = c.color;
    }

    // R6: Unnecessary trims
    if (c.type === 'trim') {
      consecutiveTrims++;
      if (consecutiveTrims > 1) {
        errors.push({ rule: 'R6', index: i, message: `Trims consecutivos detectados en comando ${i}` });
        fixable.push({ rule: 'R6', index: i });
      }
      if (stitchesSinceLastCmd < 2) {
        errors.push({ rule: 'R6', index: i, message: `Trim con <2 puntadas desde el último comando en ${i}` });
        fixable.push({ rule: 'R6', index: i });
      }
      stitchesSinceLastCmd = 0;
    } else if (c.type !== 'colorChange' && c.type !== 'end') {
      consecutiveTrims = 0;
    }

    // R8: Illegal command sequence — colorChange/trim at index 0
    if (i === 0 && (c.type === 'colorChange' || c.type === 'trim')) {
      errors.push({ rule: 'R8', index: i, message: `Comando ilegal en posición 0: ${c.type}` });
      fixable.push({ rule: 'R8', index: i });
    }

    // R9: END detection
    if (c.type === 'end') hasEnd = true;

    // R8: END not last
    if (c.type === 'end' && i !== commands.length - 1) {
      errors.push({ rule: 'R8', index: i, message: 'Comando END antes del final — hay comandos después de END' });
    }

    prevX = c.x; prevY = c.y;
  }

  // R9: Missing END
  if (!hasEnd) {
    errors.push({ rule: 'R9', message: 'Falta comando END — terminador ausente' });
    fixable.push({ rule: 'R9' });
  }

  // R4: Empty objects
  for (const obj of objects) {
    if (!obj.points || obj.points.length === 0) {
      errors.push({ rule: 'R4', message: `Objeto vacío: ${obj.id} (${obj.name}) no tiene puntadas` });
      fixable.push({ rule: 'R4', objectId: obj.id });
    }
  }

  // R5: Open regions (polygon not closed)
  for (const obj of objects) {
    if (obj.points.length >= 3) {
      const [fx, fy] = obj.points[0];
      const [lx, ly] = obj.points[obj.points.length - 1];
      const gap = Math.hypot(fx - lx, fy - ly);
      if (gap > 0.5) {
        warnings.push({ rule: 'R5', objectId: obj.id, message: `Región abierta: ${obj.id} gap=${gap.toFixed(2)}mm` });
        fixable.push({ rule: 'R5', objectId: obj.id });
      }
    }
  }

  // R10: Corrupt blocks (degenerate — <2 unique points)
  for (const obj of objects) {
    const unique = new Set(obj.points.map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`));
    if (unique.size < 2) {
      errors.push({ rule: 'R10', message: `Bloque corrupto: ${obj.id} tiene ${unique.size} puntos únicos (mínimo 2)` });
      fixable.push({ rule: 'R10', objectId: obj.id });
    }
  }

  // R11: Invalid offsets — designOffset pushes coords outside hoop
  const [offX, offY] = ms.designOffset;
  if (Math.abs(offX) > hw / 4 || Math.abs(offY) > hh / 4) {
    warnings.push({ rule: 'R11', message: `Offset grande (${offX},${offY}) puede sacar puntadas del bastidor` });
  }

  if (stitchCount === 0) {
    errors.push({ rule: 'R4', message: 'Cero puntadas de bordado — no se puede exportar' });
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    fixable,
    stats: { totalCommands: commands.length, stitchCount, colorChanges: commands.filter(c => c.type === 'colorChange').length, trims: commands.filter(c => c.type === 'trim').length },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  STAGE 3b: AUTO-FIX
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Automatically fixes what's fixable. Returns { fixedCommands, fixedObjects, applied }.
 * Fixable rules: R1 (split), R2 (split), R5 (close), R6 (remove), R7 (remove), R9 (append END), R10 (remove).
 * NOT fixable: R3, R4, R12, R8 (some) → these block export.
 */
export function autoFix(commands, objects, machine = DEFAULT_MACHINE, format = 'DST') {
  const ms = { ...DEFAULT_MACHINE, ...machine };
  const limits = FORMAT_LIMITS[format] || FORMAT_LIMITS.DST;
  const applied = [];
  let cmds = [...commands];

  // R5: Close open regions
  let fixedObjects = objects.map(obj => {
    if (obj.points.length >= 3) {
      const [fx, fy] = obj.points[0];
      const [lx, ly] = obj.points[obj.points.length - 1];
      if (Math.hypot(fx - lx, fy - ly) > 0.5) {
        applied.push({ rule: 'R5', objectId: obj.id, message: `Región ${obj.id} cerrada automáticamente` });
        return { ...obj, points: [...obj.points, [fx, fy]] };
      }
    }
    return obj;
  });

  // R4/R10: Remove empty/corrupt objects
  const before = fixedObjects.length;
  fixedObjects = fixedObjects.filter(obj => {
    if (!obj.points || obj.points.length === 0) {
      applied.push({ rule: 'R4', objectId: obj.id, message: `Objeto vacío ${obj.id} eliminado` });
      return false;
    }
    const unique = new Set(obj.points.map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`));
    if (unique.size < 2) {
      applied.push({ rule: 'R10', objectId: obj.id, message: `Bloque corrupto ${obj.id} eliminado` });
      return false;
    }
    return true;
  });
  if (fixedObjects.length < before) {
    // Rebuild commands from fixed objects
    cmds = flattenToCommands(fixedObjects, ms);
  }

  // R7: Remove redundant color changes
  cmds = cmds.filter((c, i) => {
    if (c.type !== 'colorChange') return true;
    const prev = cmds.slice(0, i).reverse().find(x => x.type === 'colorChange' || x.type === 'stitch' || x.type === 'jump');
    if (prev && prev.color === c.color) {
      applied.push({ rule: 'R7', index: i, message: `Cambio de color redundante eliminado en ${i}` });
      return false;
    }
    return true;
  });

  // R6: Remove consecutive/redundant trims
  let prevType = null;
  cmds = cmds.filter(c => {
    if (c.type === 'trim' && prevType === 'trim') {
      applied.push({ rule: 'R6', message: 'Trim consecutivo eliminado' });
      return false;
    }
    prevType = c.type;
    return true;
  });

  // R9: Ensure END exists and is last
  const endIdx = cmds.findIndex(c => c.type === 'end');
  if (endIdx === -1) {
    const last = cmds[cmds.length - 1] || { x: 0, y: 0 };
    cmds.push({ type: 'end', x: last.x, y: last.y, color: null });
    applied.push({ rule: 'R9', message: 'Comando END añadido al final' });
  } else if (endIdx !== cmds.length - 1) {
    // Move END to end, drop everything after
    cmds = [...cmds.slice(0, endIdx + 1)];
    applied.push({ rule: 'R9', message: 'END movido al final' });
  }

  // R8: Remove colorChange/trim at index 0
  while (cmds.length > 0 && (cmds[0].type === 'colorChange' || cmds[0].type === 'trim')) {
    applied.push({ rule: 'R8', message: `Comando ilegal en posición 0 (${cmds[0].type}) eliminado` });
    cmds.shift();
  }

  // R1/R2: Split stitches/jumps that still exceed max length
  const splitCmds = [];
  let prevX2 = 0, prevY2 = 0;
  let splitCount = 0;
  for (const c of cmds) {
    if (c.type === 'stitch' || c.type === 'jump') {
      const dist = Math.hypot(c.x - prevX2, c.y - prevY2);
      const maxLen = c.type === 'stitch' ? limits.maxStitch : limits.maxJump;
      if (dist > maxLen) {
        const steps = Math.ceil(dist / maxLen);
        for (let s = 1; s <= steps; s++) {
          const sx = prevX2 + (c.x - prevX2) * s / steps;
          const sy = prevY2 + (c.y - prevY2) * s / steps;
          splitCmds.push({ type: c.type, x: sx, y: sy, color: c.color });
        }
        splitCount++;
      } else {
        splitCmds.push(c);
      }
      prevX2 = c.x; prevY2 = c.y;
    } else {
      splitCmds.push(c);
    }
  }
  if (splitCount > 0) {
    applied.push({ rule: 'R1/R2', message: `${splitCount} puntadas/saltos excesivos divididos en sub-puntadas` });
    cmds = splitCmds;
  }

  // R12: Remove commands with NaN/Infinite coordinates
  const beforeR12 = cmds.length;
  cmds = cmds.filter(c => {
    if (c.x !== undefined && (!Number.isFinite(c.x) || !Number.isFinite(c.y))) {
      return false;
    }
    return true;
  });
  if (cmds.length < beforeR12) {
    applied.push({ rule: 'R12', message: `${beforeR12 - cmds.length} comandos con coordenadas NaN/Inf eliminados` });
  }

  // R13: Insert trim before first jump in sequence that exceeds trimThreshold without preceding trim
  let trimInserted = 0;
  const trimmed13 = [];
  for (let i = 0; i < cmds.length; i++) {
    const c = cmds[i];
    if (c.type === 'jump') {
      const prev = i > 0 ? cmds[i - 1] : null;
      const isFirstInSeq = !prev || prev.type !== 'jump';
      const hasStitchBefore = prev && (prev.type === 'stitch' || prev.type === 'jump');
      if (isFirstInSeq && hasStitchBefore) {
        let prevX = prev.x, prevY = prev.y;
        const dist = Math.hypot(c.x - prevX, c.y - prevY);
        if (dist > ms.trimThreshold && prev.type !== 'trim') {
          trimmed13.push({ type: 'trim', x: prevX, y: prevY, color: c.color });
          trimInserted++;
        }
      }
    }
    trimmed13.push(c);
  }
  if (trimInserted > 0) {
    applied.push({ rule: 'R13', message: `${trimInserted} trims insertados antes de saltos largos (>${ms.trimThreshold}mm)` });
    cmds = trimmed13;
  }

  // R3: Clip coordinates to hoop bounds
  const [hw, hh] = ms.hoopSize;
  let clipCount = 0;
  cmds = cmds.map(c => {
    if (c.type === 'stitch' || c.type === 'jump') {
      const cx = Math.max(-hw / 2, Math.min(hw / 2, c.x));
      const cy = Math.max(-hh / 2, Math.min(hh / 2, c.y));
      if (cx !== c.x || cy !== c.y) clipCount++;
      return { ...c, x: cx, y: cy };
    }
    return c;
  });
  if (clipCount > 0) {
    applied.push({ rule: 'R3', message: `${clipCount} coordenadas recortadas al bastidor (${hw}×${hh}mm)` });
  }

  return { fixedCommands: cmds, fixedObjects, applied };
}

// ═══════════════════════════════════════════════════════════════════════════
//  RAW PIPELINE (no auto-fix) + SINGLE-RULE FIX — for interactive wizard
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Runs pipeline WITHOUT auto-fix — returns raw errors for interactive review.
 */
export function runExportPipelineRaw(regions, config, machineSettings, format) {
  const ms = { ...DEFAULT_MACHINE, ...machineSettings };
  const objects = buildStitchObjects(regions, config);
  const commands = flattenToCommands(objects, ms);
  const validation = validatePipeline(commands, objects, ms, format);
  return {
    objects,
    commands,
    errors: validation.errors,
    warnings: validation.warnings,
    fixable: validation.fixable,
    stats: validation.stats,
    ready: validation.passed,
  };
}

/**
 * Applies fix for a SINGLE rule only (used by the interactive wizard).
 * Returns { fixedCommands, fixedObjects, applied }.
 */
export function applyFixForRule(commands, objects, rule, machine = DEFAULT_MACHINE, format = 'DST') {
  const ms = { ...DEFAULT_MACHINE, ...machine };
  const limits = FORMAT_LIMITS[format] || FORMAT_LIMITS.DST;
  const applied = [];
  let cmds = [...commands];
  let fixedObjects = objects;

  // Normalize R1/R2 — errors store "R1" or "R2", fix applies to both
  const fixKey = (rule === 'R1' || rule === 'R2') ? 'R1R2' : rule;

  if (fixKey === 'R5') {
    fixedObjects = objects.map(obj => {
      if (obj.points.length >= 3) {
        const [fx, fy] = obj.points[0];
        const [lx, ly] = obj.points[obj.points.length - 1];
        if (Math.hypot(fx - lx, fy - ly) > 0.5) {
          applied.push({ rule: 'R5', objectId: obj.id, message: `Región ${obj.id} cerrada automáticamente` });
          return { ...obj, points: [...obj.points, [fx, fy]] };
        }
      }
      return obj;
    });
    cmds = flattenToCommands(fixedObjects, ms);
  }

  if (fixKey === 'R4' || fixKey === 'R10') {
    const before = fixedObjects.length;
    fixedObjects = fixedObjects.filter(obj => {
      if (!obj.points || obj.points.length === 0) {
        applied.push({ rule: 'R4', objectId: obj.id, message: `Objeto vacío ${obj.id} eliminado` });
        return false;
      }
      const unique = new Set(obj.points.map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`));
      if (unique.size < 2) {
        applied.push({ rule: 'R10', objectId: obj.id, message: `Bloque corrupto ${obj.id} eliminado` });
        return false;
      }
      return true;
    });
    if (fixedObjects.length < before) {
      cmds = flattenToCommands(fixedObjects, ms);
    }
  }

  if (fixKey === 'R7') {
    cmds = cmds.filter((c, i) => {
      if (c.type !== 'colorChange') return true;
      const prev = cmds.slice(0, i).reverse().find(x => x.type === 'colorChange' || x.type === 'stitch' || x.type === 'jump');
      if (prev && prev.color === c.color) {
        applied.push({ rule: 'R7', index: i, message: `Cambio de color redundante eliminado` });
        return false;
      }
      return true;
    });
  }

  if (fixKey === 'R6') {
    let prevType = null;
    cmds = cmds.filter(c => {
      if (c.type === 'trim' && prevType === 'trim') {
        applied.push({ rule: 'R6', message: 'Trim consecutivo eliminado' });
        return false;
      }
      prevType = c.type;
      return true;
    });
  }

  if (fixKey === 'R9') {
    const endIdx = cmds.findIndex(c => c.type === 'end');
    if (endIdx === -1) {
      const last = cmds[cmds.length - 1] || { x: 0, y: 0 };
      cmds.push({ type: 'end', x: last.x, y: last.y, color: null });
      applied.push({ rule: 'R9', message: 'Comando END añadido al final' });
    } else if (endIdx !== cmds.length - 1) {
      cmds = [...cmds.slice(0, endIdx + 1)];
      applied.push({ rule: 'R9', message: 'END movido al final' });
    }
  }

  if (fixKey === 'R8') {
    while (cmds.length > 0 && (cmds[0].type === 'colorChange' || cmds[0].type === 'trim')) {
      applied.push({ rule: 'R8', message: `Comando ilegal en posición 0 (${cmds[0].type}) eliminado` });
      cmds.shift();
    }
  }

  if (fixKey === 'R1R2') {
    const splitCmds = [];
    let prevX2 = 0, prevY2 = 0;
    let splitCount = 0;
    for (const c of cmds) {
      if (c.type === 'stitch' || c.type === 'jump') {
        const dist = Math.hypot(c.x - prevX2, c.y - prevY2);
        const maxLen = c.type === 'stitch' ? limits.maxStitch : limits.maxJump;
        if (dist > maxLen) {
          const steps = Math.ceil(dist / maxLen);
          for (let s = 1; s <= steps; s++) {
            const sx = prevX2 + (c.x - prevX2) * s / steps;
            const sy = prevY2 + (c.y - prevY2) * s / steps;
            splitCmds.push({ type: c.type, x: sx, y: sy, color: c.color });
          }
          splitCount++;
        } else {
          splitCmds.push(c);
        }
        prevX2 = c.x; prevY2 = c.y;
      } else {
        splitCmds.push(c);
      }
    }
    if (splitCount > 0) {
      applied.push({ rule: fixKey === 'R1R2' ? 'R1/R2' : rule, message: `${splitCount} puntadas/saltos excesivos divididos en sub-puntadas` });
      cmds = splitCmds;
    }
  }

  if (fixKey === 'R12') {
    const beforeR12 = cmds.length;
    cmds = cmds.filter(c => {
      if (c.x !== undefined && (!Number.isFinite(c.x) || !Number.isFinite(c.y))) return false;
      return true;
    });
    if (cmds.length < beforeR12) {
      applied.push({ rule: 'R12', message: `${beforeR12 - cmds.length} comandos con coordenadas NaN/Inf eliminados` });
    }
  }

  if (fixKey === 'R3') {
    const [hw, hh] = ms.hoopSize;
    let clipCount = 0;
    cmds = cmds.map(c => {
      if (c.type === 'stitch' || c.type === 'jump') {
        const cx = Math.max(-hw / 2, Math.min(hw / 2, c.x));
        const cy = Math.max(-hh / 2, Math.min(hh / 2, c.y));
        if (cx !== c.x || cy !== c.y) clipCount++;
        return { ...c, x: cx, y: cy };
      }
      return c;
    });
    if (clipCount > 0) {
      applied.push({ rule: 'R3', message: `${clipCount} coordenadas recortadas al bastidor (${hw}×${hh}mm)` });
    }
  }

  if (fixKey === 'R13') {
    let trimInserted = 0;
    const trimmed = [];
    for (let i = 0; i < cmds.length; i++) {
      const c = cmds[i];
      if (c.type === 'jump') {
        const prev = i > 0 ? cmds[i - 1] : null;
        const isFirstInSeq = !prev || prev.type !== 'jump';
        const hasStitchBefore = prev && (prev.type === 'stitch' || prev.type === 'jump');
        if (isFirstInSeq && hasStitchBefore) {
          let prevX = prev.x, prevY = prev.y;
          const dist = Math.hypot(c.x - prevX, c.y - prevY);
          if (dist > ms.trimThreshold && prev.type !== 'trim') {
            trimmed.push({ type: 'trim', x: prevX, y: prevY, color: c.color });
            trimInserted++;
          }
        }
      }
      trimmed.push(c);
    }
    if (trimInserted > 0) {
      applied.push({ rule: 'R13', message: `${trimInserted} trims insertados antes de saltos largos (>${ms.trimThreshold}mm)` });
      cmds = trimmed;
    }
  }

  return { fixedCommands: cmds, fixedObjects, applied };
}

// ═══════════════════════════════════════════════════════════════════════════
//  FULL PIPELINE — single entry point
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Runs the full export pipeline and returns a debug report.
 *
 * @param {Array} regions
 * @param {Object} config — { width_mm, height_mm }
 * @param {Object} machineSettings
 * @param {string} format — 'DST' | 'DSB' | 'PES' | 'JEF'
 * @returns {{
 *   stages: { regions, objects, commands, validation, fixReport },
 *   ready: boolean,   // true = safe to encode
 *   blockingErrors: Array,
 *   commands: Array,  // final validated commands ready for encoding
 * }}
 */
export function runExportPipeline(regions, config, machineSettings, format) {
  const ms = { ...DEFAULT_MACHINE, ...machineSettings };

  // Stage 1: regions → objects
  const objects = buildStitchObjects(regions, config);

  // Stage 2: objects → commands
  let commands = flattenToCommands(objects, ms);

  // Stage 3: validate
  let validation = validatePipeline(commands, objects, ms, format);

  // Stage 3b: auto-fix if there are fixable issues
  let fixReport = { applied: [] };
  if (validation.fixable.length > 0 || !validation.passed) {
    const fixed = autoFix(commands, objects, ms, format);
    commands = fixed.fixedCommands;
    fixReport = { applied: fixed.applied };
    // Re-validate after fix
    validation = validatePipeline(commands, fixed.fixedObjects, ms, format);
  }

  return {
    stages: {
      regions: { count: regions.length, visible: regions.filter(r => r.visible !== false).length },
      objects: { count: objects.length, sample: objects.slice(0, 3).map(o => ({ id: o.id, color: o.color, points: o.points.length })) },
      commands: { count: commands.length, stats: validation.stats },
      validation,
      fixReport,
    },
    ready: validation.passed,
    blockingErrors: validation.errors,
    warnings: validation.warnings,
    commands,
    objects,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  STAGE 4: ENCODE (calls backend) — separate from generation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sends validated commands to backend encoder for file writing.
 * Returns a Blob ready for download.
 *
 * Sends `commands` directly (already validated + optimized by the pipeline)
 * as the primary input. Also builds `stitchPaths` as a fallback so the backend
 * can use whichever format is available.
 */
/**
 * Adaptive-optimized encode: runs the adaptiveOptimizationEngine loop BEFORE
 * encoding, and blocks the export (returns an error) if readyToExport is false.
 *
 * Returns the Blob on success, or throws with the engine report attached:
 *   { blocked: true, report: <engineResult> }
 */
export async function encodeOptimizedToFile(regions, config, format, machineSettings, base44Client) {
  // Lazy import to avoid circular dependency at module load time.
  const { runAdaptiveOptimization } = await import('./adaptiveOptimizationEngine');

  // ── Single source of truth: buildFinalCommands (flatten + autoFix + sanitize) ──
  // All consumers (simulation, validation, export display, export encoding) use
  // the same command sequence so metrics are consistent across panels.
  const { commands: finalCommands, objects, meta, sanitizeReport } =
    buildFinalCommands(regions, config, machineSettings, format);
  logCommandsSync('export-encode', meta);

  // Run adaptive optimization ONLY for scoring / gate decision — does NOT
  // regenerate commands. The encoded commands come from buildFinalCommands.
  const result = runAdaptiveOptimization(regions, config, machineSettings, format);

  if (!result.readyToExport && result.status === 'INVALID') {
    const err = new Error(
      `Exportación bloqueada por errores reales: score ${result.finalScore}/${result.report.targetScore}` +
      (result.report.blockReasons.length ? ` — ${result.report.blockReasons.join('; ')}` : '')
    );
    err.blocked = true;
    err.report = result;
    throw err;
  }

  // Encode the final commands (already sanitized by buildFinalCommands)
  return {
    blob: await encodeToFile(finalCommands, objects, format, machineSettings, base44Client),
    optimizationResult: result,
    sanitizeReport,
  };
}

export async function encodeToFile(commands, objects, format, machineSettings, base44Client) {
  // ── Sanitize commands: filter out NaN/Infinity coordinates ──────────────
  const cleanCommands = (commands || []).filter(c => {
    if (!c || !c.type) return false;
    if (c.type === 'colorChange' || c.type === 'end') return true;
    return Number.isFinite(c.x) && Number.isFinite(c.y);
  });

  // ── Build stitchPaths fallback from clean commands ──────────────────────
  const stitchPaths = [];
  let currentPath = null;
  let currentColor = null;

  for (const c of cleanCommands) {
    if (c.type === 'colorChange' || (currentColor === null && c.type === 'stitch')) {
      if (currentPath && currentPath.points.length > 0) stitchPaths.push(currentPath);
      currentColor = c.color || '#000000';
      currentPath = { color: currentColor, points: [] };
    }
    if (c.type === 'stitch' && currentPath) {
      currentPath.points.push([c.x, c.y]);
    }
  }
  if (currentPath && currentPath.points.length > 0) stitchPaths.push(currentPath);

  // ── Sanitize machineSettings: ensure numeric values ─────────────────────
  const ms = machineSettings || {};
  const hs = Array.isArray(ms.hoopSize) ? ms.hoopSize : [ms.hoopSize, ms.hoopSize];
  const dof = Array.isArray(ms.designOffset) ? ms.designOffset : [ms.designOffset, ms.designOffset];
  const cleanMachineSettings = {
    maxStitchLength: Number(ms.maxStitchLength) || 12.1,
    maxJumpLength: Number(ms.maxJumpLength) || 12.1,
    hoopSize: [Number(hs[0]) || 100, Number(hs[1]) || 100],
    designOffset: [Number(dof[0]) || 0, Number(dof[1]) || 0],
    trimThreshold: Number(ms.trimThreshold) || 5.0,
  };

  // ── Invoke backend with BOTH formats — backend prefers `commands` ───────
  let res;
  try {
    res = await base44Client.functions.invoke('exportEmbroideryFile', {
      commands: cleanCommands,
      stitchPaths,
      format,
      machineSettings: cleanMachineSettings,
    });
  } catch (e) {
    // Extract the real error message from the Axios error response
    const backendError = e?.response?.data?.error;
    const status = e?.response?.status;
    throw new Error(
      backendError
        ? `Backend (${status}): ${backendError}`
        : e?.message || 'Error de conexión con el backend'
    );
  }

  if (!res || !res.data) throw new Error('Backend no devolvió datos');

  // Extract base64 string from various possible response shapes
  const data = res.data;
  if (data instanceof Blob) return data;
  if (data instanceof ArrayBuffer) return new Blob([data], { type: 'application/octet-stream' });
  if (data instanceof Uint8Array) return new Blob([data], { type: 'application/octet-stream' });

  // Find the base64 string — could be in an object, or data itself could be a JSON string
  let b64 = null;
  if (typeof data === 'string') {
    // Could be raw base64 or a JSON string — try JSON.parse first
    try {
      const parsed = JSON.parse(data);
      b64 = parsed?.file_base64 || null;
    } catch {
      b64 = data; // Not JSON — assume it's raw base64
    }
  } else if (data && typeof data === 'object' && data.file_base64) {
    b64 = data.file_base64;
  }

  if (!b64 || typeof b64 !== 'string') {
    throw new Error('Formato de respuesta del backend no reconocido: ' + typeof data);
  }

  // Decode base64 → Blob. Use fetch(data:) as primary method — it's the browser's
  // native base64 decoder, handles any length, and avoids atob's Latin1 limitation.
  try {
    const blob = await fetch(`data:application/octet-stream;base64,${b64}`).then(r => r.blob());
    return blob;
  } catch {
    // Fallback: atob (may fail on very large or non-Latin1 strings)
    const byteStr = atob(b64);
    const bytes = new Uint8Array(byteStr.length);
    for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
    return new Blob([bytes], { type: 'application/octet-stream' });
  }
}

/**
 * Wilcom comparison — structural diff between generated file and reference.
 * Compares: stitch count, color count, command sequence structure, bounding box.
 * @param {Uint8Array} generated
 * @param {Uint8Array} reference (optional — Wilcom-exported)
 * @returns { differences: Array, similarity: number }
 */
// ═══════════════════════════════════════════════════════════════════════════
//  SINGLE SOURCE OF TRUTH — finalEmbroideryCommands
// ═══════════════════════════════════════════════════════════════════════════

let _lastFinalCommandsMeta = null;

/**
 * Builds the canonical final command sequence used by ALL consumers:
 *   visualRegions → stitchPlanner → ce01SafeFill → contour → autoFix → sanitize
 *
 * Simulation, Validation, and Export MUST call this to get their commands.
 * Returns { commands, objects, meta, sanitizeReport, validation }.
 */
export function buildFinalCommands(regions, config = {}, machineSettings = {}, format = 'DST') {
  const ms = { ...DEFAULT_MACHINE, ...machineSettings };

  // Stage 1: regions → objects
  const objects = buildStitchObjects(regions, config);

  // Stage 2: objects → raw commands
  let commands = flattenToCommands(objects, ms);

  // Stage 3: autoFix (R5 close, R4/R10 remove empty, R7 dedupe color, R6 dedupe trim, R9 END, R13 trim insertion)
  let validation = validatePipeline(commands, objects, ms, format);
  if (validation.fixable.length > 0 || !validation.passed) {
    const fixed = autoFix(commands, objects, ms, format);
    commands = fixed.fixedCommands;
    validation = validatePipeline(commands, fixed.fixedObjects, ms, format);
  }

  // Stage 3b: Final command repair — local fix for outside-region stitches
  // Runs BEFORE sanitize. Only modifies commands, never regions/vectors.
  const repairResult = repairCE01FinalCommands(commands, regions, { config, machineSettings: ms, objects });
  if (repairResult.applied) {
    commands = repairResult.commands;
  }

  // ── colorChange preservation guard ──────────────────────────────────────
  // No optimizer may remove colorChange commands or reduce distinct colors.
  const _ccCount = (cmds) => cmds.filter(c => c.type === 'colorChange').length;
  const _distinctColors = (cmds) => {
    const s = new Set();
    for (const c of cmds) {
      if (c.color && (c.type === 'stitch' || c.type === 'jump')) s.add(c.color);
    }
    return s.size;
  };
  const _contourStitchCount = (cmds) => cmds.filter(c => c.type === 'stitch' && c.stitchType === 'running_stitch').length;
  const _detailStitchCount = (cmds) => cmds.filter(c => {
    if (c.type !== 'stitch') return false;
    const rid = (c.regionId || '').toLowerCase();
    return rid.includes('mouth') || rid.includes('detail') || c.stitchType === 'running_stitch';
  }).length;
  const _preserveColorChange = (before, after, label) => {
    const ccBefore = _ccCount(before);
    const ccAfter = _ccCount(after);
    const colorsBefore = _distinctColors(before);
    const colorsAfter = _distinctColors(after);
    const contourBefore = _contourStitchCount(before);
    const contourAfter = _contourStitchCount(after);
    const detailBefore = _detailStitchCount(before);
    const detailAfter = _detailStitchCount(after);
    if (ccAfter !== ccBefore || colorsAfter < colorsBefore ||
        contourAfter < contourBefore * 0.9 || detailAfter < detailBefore * 0.9) {
      console.warn(`[colorChange-guard] ${label}: cc ${ccBefore}→${ccAfter}, colors ${colorsBefore}→${colorsAfter}, contour ${contourBefore}→${contourAfter}, detail ${detailBefore}→${detailAfter} — DISCARDED`);
      return false;
    }
    // ── Contour protection — outer_outline, inner_outline, mouth must survive ──
    //    Also checks travel contamination (no travel as visible contour stitches)
    if (!contourRefineGuard(before, after)) {
      console.warn(`[contour-guard] ${label}: contour/travel guard failed — DISCARDED`);
      return false;
    }
    return true;
  };

  // ── Save pre-optimizer commands for final transactional validation ──
  const preOptCommands = [...commands];

  // Stage 3c: Travel path optimization — collapse jumps, convert short jumps to stitches
  const travelResult = optimizeCE01TravelPath(commands, regions, config, ms);
  if (travelResult.applied && _preserveColorChange(commands, travelResult.commands, 'travel-opt')) {
    commands = travelResult.commands;
  }

  // Stage 4: CE01 sanitize (dedupe, merge micro, split long, optimize jumps + trims)
  const { commands: sanitizedCommands, report: sanitizeReport } = sanitizeCommandsForCE01(commands, ms);
  if (_preserveColorChange(commands, sanitizedCommands, 'sanitize')) {
    commands = sanitizedCommands;
  }

  // Stage 4b: Second light travel pass — clean up any new jumps/trims from sanitize
  const finalTravelResult = optimizeCE01TravelPath(commands, regions, config, ms);
  if (finalTravelResult.applied && _preserveColorChange(commands, finalTravelResult.commands, 'travel-opt-2')) {
    commands = finalTravelResult.commands;
  }

  // Stage 4c: Trim optimization — remove unnecessary trims between close blocks
  const trimResult = optimizeCE01Trims(commands, regions, config, ms);
  if (trimResult.applied && _preserveColorChange(commands, trimResult.commands, 'trim-opt')) {
    commands = trimResult.commands;
  }

  // ── Stage 5: Contour refine validation — transactional check ──────────
  // After all optimizers, verify contours survived and no travel contamination.
  // If validation fails, revert to pre-optimizer commands.
  const refineResult = validateContourRefinement(preOptCommands, commands, regions, format);
  if (!refineResult.accepted) {
    console.log('[outline-refine] reverting to pre-optimizer commands');
    commands = preOptCommands;
  }

  // ── Stage 6: Geometry audit — remove artificial segments, fix end position ──
  // Converts any long visible stitch that isn't contour/detail/fill into a jump,
  // and ensures no return-to-origin is stitched visibly.
  const geometryResult = auditAndCleanGeometry(commands, config);
  if (geometryResult.segmentsRemoved > 0 || geometryResult.endPositionFixed) {
    commands = geometryResult.commands;
  }
  console.log(`[travel-audit] suspicious detected: ${geometryResult.suspiciousDetected}`);
  console.log(`[travel-audit] segments removed: ${geometryResult.segmentsRemoved}`);
  console.log(`[travel-audit] end position fixed: ${geometryResult.endPositionFixed}`);

  // ── Stage 7: Dark-mask contour segment guard ──────────────────────────────
  // Cut any contour/detail stitch longer than 2.5mm without dark-mask support
  // (artificial diagonals / satin closing across gaps). Converts to jump + trim.
  const { commands: _guardedCmds, report: contourSegmentReport } =
    validateFinalContourCommandsAgainstDarkMask(commands, config.darkStroke, config);
  if (contourSegmentReport.removedArtificialBridges > 0) {
    commands = _guardedCmds;
  }
  console.log(`[contour-segment-guard] unsupported segments removed: ${contourSegmentReport.removedArtificialBridges}`);
  console.log(`[contour-segment-guard] suspicious diagonal: ${contourSegmentReport.suspiciousBlackDiagonalDetected}`);

  // ── Stage 8: Professional stitch planner repair — transactional ─────────
  // Eliminates critical visible long stitches without touching segmentation,
  // validation, export modal, encoders, Reference Learning, or global ordering.
  const professionalPlannerRepair = applyProfessionalStitchPlannerRepair({
    commands,
    regions,
    config,
    machineSettings: ms,
  });
  commands = professionalPlannerRepair.commands;

  const stitchCount = commands.filter(c => c.type === 'stitch').length;
  const jumpCount = commands.filter(c => c.type === 'jump').length;
  const trimCount = commands.filter(c => c.type === 'trim').length;
  const colorCount = commands.filter(c => c.type === 'colorChange').length + 1;

  const meta = {
    source: 'ce01_safe_pipeline',
    generatedAt: new Date().toISOString(),
    stitchCount,
    jumpCount,
    trimCount,
    colorCount,
    sanitized: true,
    validatorVersion: 'ce01-v2',
    generatorVersion: 'ce01-safe-fill-v1',
  };

  _lastFinalCommandsMeta = meta;

  return { commands, objects, meta, sanitizeReport, repairReport: repairResult.report, travelReport: travelResult.report, finalTravelReport: finalTravelResult.report, trimReport: trimResult.report, contourSegmentReport, professionalPlannerRepairReport: professionalPlannerRepair.report, validation };
}

/**
 * Logs command sync info from a consumer (simulation / validation / export).
 * Call from each panel's useMemo to verify all use the same source.
 */
export function logCommandsSync(consumer, meta) {
  const sc = meta?.stitchCount ?? '?';
  const jc = meta?.jumpCount ?? '?';
  const tc = meta?.trimCount ?? '?';
  console.log(`[commands-sync] ${consumer} source: ${meta?.source || 'unknown'}`);
  console.log(`[commands-sync] stitch count: ${sc}`);
  console.log(`[commands-sync] jump count: ${jc}`);
  console.log(`[commands-sync] trim count: ${tc}`);

  if (_lastFinalCommandsMeta) {
    const same = _lastFinalCommandsMeta.source === meta?.source;
    console.log(`[commands-sync] same command reference: ${same}`);
    if (
      _lastFinalCommandsMeta.stitchCount !== sc ||
      _lastFinalCommandsMeta.jumpCount !== jc ||
      _lastFinalCommandsMeta.trimCount !== tc
    ) {
      console.warn('[commands-sync] Simulación, validación y exportación no están usando el mismo set de comandos');
    }
  }
}

export function compareWithReference(generated, reference) {
  if (!reference) {
    return { differences: [{ type: 'no_reference', message: 'No se proporcionó archivo de referencia Wilcom — comparación omitida' }], similarity: null };
  }
  const differences = [];
  let matches = 0;

  // Size comparison
  if (generated.length !== reference.length) {
    differences.push({ type: 'size', message: `Tamaño: generado=${generated.length}B vs referencia=${reference.length}B` });
  } else {
    matches++;
  }

  // Byte-level structural comparison (first 512 bytes = header)
  let headerMatch = 0;
  for (let i = 0; i < 512 && i < generated.length && i < reference.length; i++) {
    if (generated[i] === reference[i]) headerMatch++;
  }
  if (headerMatch < 400) {
    differences.push({ type: 'header', message: `Header difiere: ${headerMatch}/512 bytes coinciden` });
  } else matches++;

  // Stitch record count (DST: 3 bytes per record after 512 header)
  const genRecords = Math.floor((generated.length - 512) / 3);
  const refRecords = Math.floor((reference.length - 512) / 3);
  if (genRecords !== refRecords) {
    differences.push({ type: 'record_count', message: `Registros: generado=${genRecords} vs referencia=${refRecords}` });
  } else matches++;

  const total = 3;
  const similarity = Math.round((matches / total) * 100);
  return { differences, similarity };
}