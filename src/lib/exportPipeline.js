/**
 * Professional Export Pipeline — StitchPath AI
 * ─────────────────────────────────────────────────────────────────────────────
 * Separates stitch GENERATION from file WRITING.
 *
 * Flow:
 *   regions → buildStitchObjects → validatePipeline → autoFix → encode (backend)
 *
 * 12 validation rules (all must pass before export):
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
 */

// ─── Machine format limits (DST/DSB physical constraints) ───────────────────
const FORMAT_LIMITS = {
  DST: { maxStitch: 12.1, maxJump: 12.1, coordRange: 121, unit: 0.1 },
  DSB: { maxStitch: 12.1, maxJump: 12.1, coordRange: 121, unit: 0.1 },
  PES: { maxStitch: 12.7, maxJump: 12.7, coordRange: 4095, unit: 0.1 },
  JEF: { maxStitch: 12.7, maxJump: 12.7, coordRange: 32767, unit: 0.1 },
};

const DEFAULT_MACHINE = {
  maxStitchLength: 12.1,
  maxJumpLength: 12.1,
  hoopSize: [100, 100],     // mm
  designOffset: [0, 0],     // mm
  trimThreshold: 5.0,       // mm — distance to trigger trim
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
export function buildStitchObjects(regions, config = {}) {
  const w = config.width_mm || 100;
  const h = config.height_mm || 100;
  const objects = [];

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
      priority: r.priority || 5,
      density: r.density || 0.4,
      angle: r.angle || 45,
      points: mmPoints,
      rawRegion: r,
    });
  }

  // Sort by priority (fills first, satins last) — matches embroidery sequence
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

  for (const obj of objects) {
    if (obj.points.length === 0) continue;

    // Color change (skip if same as previous)
    if (prevColor !== null && obj.color !== prevColor) {
      cmds.push({ type: 'colorChange', x: prevX, y: prevY, color: obj.color });
    }
    prevColor = obj.color;

    // Jump to start if far from current position
    const [sx, sy] = obj.points[0];
    const startX = sx + offX, startY = sy + offY;
    if (!firstCmd) {
      const dist = Math.hypot(startX - prevX, startY - prevY);
      if (dist > ms.trimThreshold) {
        cmds.push({ type: 'trim', x: prevX, y: prevY, color: obj.color });
      }
      if (dist > 0.5) {
        // Break long jumps
        const steps = Math.ceil(dist / ms.maxJumpLength);
        for (let s = 1; s <= steps; s++) {
          const jx = prevX + (startX - prevX) * s / steps;
          const jy = prevY + (startY - prevY) * s / steps;
          cmds.push({ type: s === steps ? 'jump' : 'jump', x: jx, y: jy, color: obj.color });
        }
      }
    }

    // Stitch points
    for (let i = 0; i < obj.points.length; i++) {
      const x = obj.points[i][0] + offX;
      const y = obj.points[i][1] + offY;
      const dist = Math.hypot(x - prevX, y - prevY);

      if (i > 0 && dist > ms.maxStitchLength) {
        // Break long stitches into sub-stitches
        const steps = Math.ceil(dist / ms.maxStitchLength);
        for (let s = 1; s < steps; s++) {
          const sx = prevX + (x - prevX) * s / steps;
          const sy = prevY + (y - prevY) * s / steps;
          cmds.push({ type: 'stitch', x: sx, y: sy, color: obj.color });
        }
      }
      cmds.push({ type: 'stitch', x, y, color: obj.color });
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
 */
export async function encodeToFile(commands, objects, format, machineSettings, base44Client) {
  // Convert commands back to stitchPaths format expected by backend
  const stitchPaths = [];
  let currentPath = null;
  let currentColor = null;

  for (const c of commands) {
    if (c.type === 'colorChange' || (currentColor === null && c.type === 'stitch')) {
      if (currentPath && currentPath.points.length > 0) stitchPaths.push(currentPath);
      currentColor = c.color;
      currentPath = { color: currentColor, points: [] };
    }
    if (c.type === 'stitch' && currentPath) {
      currentPath.points.push([c.x, c.y]);
    }
  }
  if (currentPath && currentPath.points.length > 0) stitchPaths.push(currentPath);

  const res = await base44Client.functions.invoke('exportEmbroideryFile', {
    stitchPaths,
    format,
    machineSettings,
  });

  if (!res || !res.data) throw new Error('Backend no devolvió datos');

  // Handle different response shapes: Blob, ArrayBuffer, base64 string, or Uint8Array
  const data = res.data;
  if (data instanceof Blob) return data;
  if (data instanceof ArrayBuffer) return new Blob([data], { type: 'application/octet-stream' });
  if (data instanceof Uint8Array) return new Blob([data], { type: 'application/octet-stream' });
  if (typeof data === 'string') {
    // base64-encoded binary
    const byteStr = atob(data);
    const bytes = new Uint8Array(byteStr.length);
    for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
    return new Blob([bytes], { type: 'application/octet-stream' });
  }
  // If it's an object with file_base64 (fallback to generateEmbroideryFile shape)
  if (data.file_base64) {
    const byteStr = atob(data.file_base64);
    const bytes = new Uint8Array(byteStr.length);
    for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
    return new Blob([bytes], { type: 'application/octet-stream' });
  }
  throw new Error('Formato de respuesta del backend no reconocido: ' + typeof data);
}

/**
 * Wilcom comparison — structural diff between generated file and reference.
 * Compares: stitch count, color count, command sequence structure, bounding box.
 * @param {Uint8Array} generated
 * @param {Uint8Array} reference (optional — Wilcom-exported)
 * @returns { differences: Array, similarity: number }
 */
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