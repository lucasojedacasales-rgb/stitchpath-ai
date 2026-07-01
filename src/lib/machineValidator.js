/**
 * Machine Validator — Industrial Embroidery Executability Assessment
 * ─────────────────────────────────────────────────────────────────────────────
 * Evaluates whether a design can be physically sewn on a home machine (Caydo CE01).
 *
 * Principle: "If it can't be physically sewn on a home machine, it's invalid
 * even if visually perfect."
 *
 * Classification:
 *   SAFE    — executable without problems (score ≥ 85)
 *   RISKY   — may fail or deform (score 50–84)
 *   INVALID — will break or be ignored by machine (score < 50)
 *
 * Categories checked:
 *   GEOMETRY   — excess nodes, unsegmented curves
 *   DENSITY    — stitch saturation
 *   JUMPS      — jumps >3.5mm without trim
 *   STRUCTURE  — open/crossed paths, unclosed blocks
 *   TRIM       — tie-in/tie-off existence
 */

import { DEFAULT_MACHINE } from './exportPipeline';

// ─── Thresholds (Caydo CE01 home machine) ───────────────────────────────────
const THRESHOLDS = {
  maxNodesPerMm: 8,           // nodes per mm of perimeter — above = over-detailed
  maxNodesPerObject: 200,     // absolute cap on nodes per object
  maxStitchDensityPerMm2: 4,  // stitches per mm² — above = saturation
  maxJumpWithoutTrim: 3.5,    // mm — jump above this without trim = penalty
  minStitchesPerBlock: 3,     // below this = degenerate block
  minTieInStitches: 2,        // minimum locking stitches at start
  minTieOffStitches: 2,       // minimum locking stitches at end
  maxCurveAngleDeg: 60,       // sharp corners above this without segmentation
  maxStitchLength: 12.1,      // mm — DST physical limit
  scoreSafe: 85,
  scoreRisky: 50,
};

// ─── Severity weights (how much each issue type deducts from score) ──────────
const PENALTY = {
  CRITICAL: 40,   // makes design INVALID by itself (2+ = guaranteed INVALID)
  MAJOR: 15,      // significant risk
  MINOR: 5,       // cosmetic / minor stability concern
  INFO: 0,        // informational, no deduction
};

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Runs full machine executability validation on a design.
 *
 * @param {Array} regions     — design regions (from editor)
 * @param {Array} commands    — flattened stitch commands (from exportPipeline)
 * @param {Object} config     — { width_mm, height_mm }
 * @param {Object} machine    — machine settings (merged with DEFAULT_MACHINE)
 * @returns {{
 *   status: 'SAFE'|'RISKY'|'INVALID',
 *   score: number,
 *   issues: Array<{severity,category,rule,message,recommendation,index?}>,
 *   recommendation: string,
 *   stats: Object,
 * }}
 */
export function validateForMachine(regions, commands, config = {}, machine = {}) {
  const ms = { ...DEFAULT_MACHINE, ...machine };
  const w = config.width_mm || 100;
  const h = config.height_mm || 100;
  const issues = [];

  // ── Run all category checks ─────────────────────────────────────────────
  const geomIssues = checkGeometry(regions, w, h);
  const densityIssues = checkDensity(regions, commands, w, h);
  const jumpIssues = checkJumps(commands, ms);
  const structIssues = checkStructure(regions);
  const trimIssues = checkTrimThreads(commands, regions);

  issues.push(...geomIssues, ...densityIssues, ...jumpIssues, ...structIssues, ...trimIssues);

  // ── Compute score ───────────────────────────────────────────────────────
  let score = 100;
  let criticalCount = 0;
  for (const issue of issues) {
    const penalty = PENALTY[issue.severity] || 0;
    score -= penalty;
    if (issue.severity === 'CRITICAL') criticalCount++;
  }
  // 2+ criticals = guaranteed INVALID regardless of score
  if (criticalCount >= 2) score = Math.min(score, 30);
  score = Math.max(0, Math.min(100, Math.round(score)));

  // ── Classify ────────────────────────────────────────────────────────────
  let status;
  if (score >= THRESHOLDS.scoreSafe) status = 'SAFE';
  else if (score >= THRESHOLDS.scoreRisky) status = 'RISKY';
  else status = 'INVALID';

  // ── Recommendation ──────────────────────────────────────────────────────
  const recommendation = buildRecommendation(status, issues, score);

  // ── Stats ───────────────────────────────────────────────────────────────
  const stats = {
    totalObjects: regions.filter(r => r.visible !== false).length,
    totalStitches: commands.filter(c => c.type === 'stitch').length,
    totalJumps: commands.filter(c => c.type === 'jump').length,
    totalTrims: commands.filter(c => c.type === 'trim').length,
    colorChanges: commands.filter(c => c.type === 'colorChange').length,
    criticalCount,
    majorCount: issues.filter(i => i.severity === 'MAJOR').length,
    minorCount: issues.filter(i => i.severity === 'MINOR').length,
  };

  return { status, score, issues, recommendation, stats };
}

// ═══════════════════════════════════════════════════════════════════════════
//  CATEGORY 1: GEOMETRY — excess nodes, unsegmented curves
// ═══════════════════════════════════════════════════════════════════════════

function checkGeometry(regions, w, h) {
  const issues = [];

  for (const r of regions) {
    if (r.visible === false) continue;
    const pts = r.path_points || [];
    if (pts.length < 2) continue;

    // Convert normalized points to mm for real-world measurement
    const mmPts = pts.map(([nx, ny]) => [nx * w, ny * h]);

    // Perimeter in mm
    let perimeter = 0;
    for (let i = 1; i < mmPts.length; i++) {
      perimeter += Math.hypot(mmPts[i][0] - mmPts[i-1][0], mmPts[i][1] - mmPts[i-1][1]);
    }

    // Node density: nodes per mm of perimeter
    const nodeDensity = pts.length / Math.max(perimeter, 1);

    if (pts.length > THRESHOLDS.maxNodesPerObject) {
      issues.push({
        severity: 'MAJOR',
        category: 'GEOMETRY',
        rule: 'G1',
        message: `Objeto "${r.name || r.id}": ${pts.length} nodos (máx ${THRESHOLDS.maxNodesPerObject}). Exceso de detalle causará vibración.`,
        recommendation: 'Simplificar con RDP ε=1mm o reducir resolución de contorno.',
      });
    } else if (nodeDensity > THRESHOLDS.maxNodesPerMm && pts.length > 30) {
      issues.push({
        severity: 'MINOR',
        category: 'GEOMETRY',
        rule: 'G2',
        message: `Objeto "${r.name || r.id}": densidad de nodos ${nodeDensity.toFixed(1)}/mm — micro-detalles que la máquina no puede resolver.`,
        recommendation: 'Aplicar decimación de curvas (espaciado mínimo 2mm).',
      });
    }

    // Sharp corners without segmentation
    let sharpCorners = 0;
    for (let i = 1; i < mmPts.length - 1; i++) {
      const [ax, ay] = mmPts[i-1];
      const [bx, by] = mmPts[i];
      const [cx, cy] = mmPts[i+1];
      const v1x = bx - ax, v1y = by - ay;
      const v2x = cx - bx, v2y = cy - by;
      const len1 = Math.hypot(v1x, v1y);
      const len2 = Math.hypot(v2x, v2y);
      if (len1 < 0.5 || len2 < 0.5) continue;
      const cos = (v1x*v2x + v1y*v2y) / (len1 * len2);
      const angleDeg = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
      const turnDeg = 180 - angleDeg;
      if (turnDeg > THRESHOLDS.maxCurveAngleDeg) sharpCorners++;
    }
    if (sharpCorners > 5) {
      issues.push({
        severity: 'MINOR',
        category: 'GEOMETRY',
        rule: 'G3',
        message: `Objeto "${r.name || r.id}": ${sharpCorners} esquinas agudas (>60°) sin segmentar — puede causar enganches de aguja.`,
        recommendation: 'Insertar puntos intermedios o usar Chaikin smoothing (2 pases).',
      });
    }
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CATEGORY 2: DENSITY — stitch saturation
// ═══════════════════════════════════════════════════════════════════════════

function checkDensity(regions, commands, w, h) {
  const issues = [];
  const totalArea = w * h;
  const totalStitches = commands.filter(c => c.type === 'stitch').length;

  // Global density: stitches per mm² of design area
  const globalDensity = totalStitches / Math.max(totalArea, 1);

  if (globalDensity > THRESHOLDS.maxStitchDensityPerMm2) {
    issues.push({
      severity: 'CRITICAL',
      category: 'DENSITY',
      rule: 'D1',
      message: `Saturación global: ${globalDensity.toFixed(2)} stitches/mm² (máx ${THRESHOLDS.maxStitchDensityPerMm2}). El tejido se deformará.`,
      recommendation: 'Reducir densidad a 3.5mm spacing o aumentar área del diseño.',
    });
  } else if (globalDensity > THRESHOLDS.maxStitchDensityPerMm2 * 0.75) {
    issues.push({
      severity: 'MAJOR',
      category: 'DENSITY',
      rule: 'D2',
      message: `Densidad alta: ${globalDensity.toFixed(2)} stitches/mm² — riesgo de arrugado en telas delicadas.`,
      recommendation: 'Considerar medium-low density (target 3.5mm).',
    });
  }

  // Per-region density check
  for (const r of regions) {
    if (r.visible === false) continue;
    const pts = r.path_points || [];
    if (pts.length < 3) continue;

    // Shoelace area in mm²
    const mmPts = pts.map(([nx, ny]) => [nx * w, ny * h]);
    let area = 0;
    for (let i = 0; i < mmPts.length; i++) {
      const j = (i + 1) % mmPts.length;
      area += mmPts[i][0] * mmPts[j][1];
      area -= mmPts[j][0] * mmPts[i][1];
    }
    area = Math.abs(area) / 2;

    const regionStitches = r.stitch_count || 0;
    if (area > 0 && regionStitches > 0) {
      const regionDensity = regionStitches / area;
      if (regionDensity > THRESHOLDS.maxStitchDensityPerMm2) {
        issues.push({
          severity: 'MAJOR',
          category: 'DENSITY',
          rule: 'D3',
          message: `Región "${r.name || r.id}": ${regionDensity.toFixed(2)} stitches/mm² — saturación local causará fruncido.`,
          recommendation: `Reducir stitch_count de ${regionStitches} o aumentar densidad spacing.`,
        });
      }
    }
  }

  // Total stitch count cap for home machines
  if (totalStitches > 12000) {
    issues.push({
      severity: 'MAJOR',
      category: 'DENSITY',
      rule: 'D4',
      message: `${totalStitches} puntadas — excede límite recomendado para máquinas domésticas (12,000).`,
      recommendation: 'Reducir colores o simplificar regiones pequeñas.',
    });
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CATEGORY 3: JUMPS — jumps >3.5mm without trim
// ═══════════════════════════════════════════════════════════════════════════

function checkJumps(commands, ms) {
  const issues = [];
  let prevX = 0, prevY = 0;
  let longJumpsWithoutTrim = 0;
  let maxJumpDist = 0;

  for (let i = 0; i < commands.length; i++) {
    const c = commands[i];
    if (c.type === 'jump') {
      const dist = Math.hypot(c.x - prevX, c.y - prevY);
      maxJumpDist = Math.max(maxJumpDist, dist);

      const isFirstInSeq = i === 0 || commands[i-1].type !== 'jump';
      const prevCmd = i > 0 ? commands[i-1] : null;
      const hasStitchBefore = prevCmd && (prevCmd.type === 'stitch' || prevCmd.type === 'jump');

      if (isFirstInSeq && hasStitchBefore && dist > THRESHOLDS.maxJumpWithoutTrim && prevCmd.type !== 'trim') {
        longJumpsWithoutTrim++;
        if (longJumpsWithoutTrim <= 5) {
          issues.push({
            severity: dist > 8 ? 'CRITICAL' : 'MAJOR',
            category: 'JUMPS',
            rule: 'J1',
            index: i,
            message: `Salto de ${dist.toFixed(1)}mm sin trim previo — hilo se enredará o arrastrará.`,
            recommendation: 'Insertar trim antes del salto o reducir distancia entre bloques.',
          });
        }
      }

      // Jump exceeding physical limit
      if (dist > THRESHOLDS.maxStitchLength) {
        issues.push({
          severity: 'CRITICAL',
          category: 'JUMPS',
          rule: 'J2',
          index: i,
          message: `Salto de ${dist.toFixed(1)}mm excede límite físico de ${THRESHOLDS.maxStitchLength}mm — la máquina no puede ejecutarlo.`,
          recommendation: 'Dividir en sub-saltos ≤12.1mm.',
        });
      }
    }

    if (c.x !== undefined) { prevX = c.x; prevY = c.y; }
  }

  if (longJumpsWithoutTrim > 5) {
    issues.push({
      severity: 'CRITICAL',
      category: 'JUMPS',
      rule: 'J3',
      message: `${longJumpsWithoutTrim} saltos >3.5mm sin trim — el diseño arrastrará hilo excesivo entre bloques.`,
      recommendation: 'Activar trim automático en todos los saltos >3.5mm.',
    });
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CATEGORY 4: STRUCTURE — open/crossed paths, unclosed blocks
// ═══════════════════════════════════════════════════════════════════════════

function checkStructure(regions) {
  const issues = [];

  for (const r of regions) {
    if (r.visible === false) continue;
    const pts = r.path_points || [];

    // Empty / degenerate
    if (pts.length === 0) {
      issues.push({
        severity: 'CRITICAL',
        category: 'STRUCTURE',
        rule: 'S1',
        message: `Región "${r.name || r.id}": 0 puntos — bloque vacío.`,
        recommendation: 'Eliminar región o regenerar contorno.',
      });
      continue;
    }

    if (pts.length < THRESHOLDS.minStitchesPerBlock) {
      issues.push({
        severity: 'MAJOR',
        category: 'STRUCTURE',
        rule: 'S2',
        message: `Región "${r.name || r.id}": ${pts.length} puntos — bloque degenerado.`,
        recommendation: 'Fusionar con región adyacente o eliminar.',
      });
      continue;
    }

    // Open polygon (for fill/satin — must be closed)
    if ((r.stitch_type === 'fill' || r.stitch_type === 'satin') && pts.length >= 3) {
      const [fx, fy] = pts[0];
      const [lx, ly] = pts[pts.length - 1];
      const gap = Math.hypot(fx - lx, fy - ly);
      if (gap > 0.01) {
        issues.push({
          severity: 'MAJOR',
          category: 'STRUCTURE',
          rule: 'S3',
          message: `Región "${r.name || r.id}": path abierto (gap=${gap.toFixed(3)}). Fill/satin requiere polígono cerrado.`,
          recommendation: 'Cerrar polígono automáticamente antes de exportar.',
        });
      }
    }

    // Self-intersecting (simple check — crossing count)
    if (pts.length >= 4 && r.stitch_type !== 'running_stitch') {
      const crossings = countSelfIntersections(pts);
      if (crossings > 0) {
        issues.push({
          severity: crossings > 2 ? 'CRITICAL' : 'MAJOR',
          category: 'STRUCTURE',
          rule: 'S4',
          message: `Región "${r.name || r.id}": ${crossings} auto-intersecciones — path cruzado causará geometría corrupta.`,
          recommendation: 'Re-trazar contorno o usar morphological closing.',
        });
      }
    }
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CATEGORY 5: TRIM / THREADS — tie-in/tie-off existence
// ═══════════════════════════════════════════════════════════════════════════

function checkTrimThreads(commands, regions) {
  const issues = [];

  // Group commands by color blocks (between colorChanges)
  const blocks = [];
  let currentBlock = { startIndex: 0, stitches: [], color: null, hasTrim: false };

  for (let i = 0; i < commands.length; i++) {
    const c = commands[i];

    if (c.type === 'colorChange') {
      if (currentBlock.stitches.length > 0) blocks.push(currentBlock);
      currentBlock = { startIndex: i, stitches: [], color: c.color, hasTrim: false };
      continue;
    }

    if (c.type === 'stitch') {
      currentBlock.stitches.push(i);
    }

    if (c.type === 'trim') {
      currentBlock.hasTrim = true;
    }

    if (c.type === 'end') {
      if (currentBlock.stitches.length > 0) blocks.push(currentBlock);
      break;
    }
  }
  if (currentBlock.stitches.length > 0) blocks.push(currentBlock);

  // Check each block for tie-in/tie-off (short stitches at start/end)
  let blocksWithoutTieOff = 0;
  for (const block of blocks) {
    if (block.stitches.length < THRESHOLDS.minTieInStitches + THRESHOLDS.minTieOffStitches) {
      issues.push({
        severity: 'MAJOR',
        category: 'TRIM',
        rule: 'T1',
        message: `Bloque (${block.stitches.length} puntadas): insuficiente para tie-in/tie-off — hilo se soltará.`,
        recommendation: 'Añadir mínimo 2 puntadas de anclaje al inicio y final.',
      });
      continue;
    }

    // Check tie-off: last block should have trim or be followed by colorChange/end
    const lastStitchIdx = block.stitches[block.stitches.length - 1];
    const nextCmd = commands[lastStitchIdx + 1];
    const hasTieOff = block.hasTrim ||
      (nextCmd && (nextCmd.type === 'colorChange' || nextCmd.type === 'end' || nextCmd.type === 'trim'));

    if (!hasTieOff) {
      blocksWithoutTieOff++;
      if (blocksWithoutTieOff <= 3) {
        issues.push({
          severity: 'MAJOR',
          category: 'TRIM',
          rule: 'T2',
          message: `Bloque sin tie-off/trim — el hilo se desenredará al final del bloque.`,
          recommendation: 'Insertar trim o tie-off (2-3 puntadas cortas) al final del bloque.',
        });
      }
    }
  }

  if (blocksWithoutTieOff > 3) {
    issues.push({
      severity: 'CRITICAL',
      category: 'TRIM',
      rule: 'T3',
      message: `${blocksWithoutTieOff} bloques sin tie-off — el diseño se deshilachará durante el cosido.`,
      recommendation: 'Activar tie-off automático en todos los bloques.',
    });
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════════
//  RECOMMENDATION BUILDER
// ═══════════════════════════════════════════════════════════════════════════

function buildRecommendation(status, issues, score) {
  const criticals = issues.filter(i => i.severity === 'CRITICAL');
  const majors = issues.filter(i => i.severity === 'MAJOR');

  if (status === 'INVALID') {
    const reasons = criticals.slice(0, 2).map(c => c.message);
    return `NO EJECUTABLE en máquina doméstica (score ${score}/100). ${reasons.join(' ')} Corregir antes de exportar.`;
  }

  if (status === 'RISKY') {
    const topIssues = majors.slice(0, 2).map(m => m.recommendation);
    return `EJECUTABLE CON RIESGO (score ${score}/100). Puede deformarse o fallar. Recomendado: ${topIssues.join(' ')}`;
  }

  if (criticals.length > 0 || majors.length > 0) {
    return `SEGURO con advertencias menores (score ${score}/100). Ejecutable pero revisar ${majors.length} issue(s) mayor(es) para máxima estabilidad.`;
  }

  return `SEGURO (score ${score}/100). Diseño ejecutable sin problemas en máquina doméstica.`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Simple self-intersection count using segment crossing test.
 * O(n²) — fine for embroidery polygons (<200 nodes).
 */
function countSelfIntersections(points) {
  let count = 0;
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 2; j < n - 1; j++) {
      if (i === 0 && j === n - 2) continue; // skip adjacent closing segment
      if (segmentsCross(points[i], points[i+1], points[j], points[j+1])) {
        count++;
      }
    }
  }
  return count;
}

function segmentsCross(p1, p2, p3, p4) {
  const d1 = crossProduct(p3, p4, p1);
  const d2 = crossProduct(p3, p4, p2);
  const d3 = crossProduct(p1, p2, p3);
  const d4 = crossProduct(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return false;
}

function crossProduct(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}