/**
 * repairFinalLookCommandsForExport.js — ORQUESTRADOR
 * ─────────────────────────────────────────────────────────────────────────────
 * finalLookCommands → technicalRepair → validate → exportCommands
 *
 * NO toca el detector universal, el aprendizaje del corpus, el Final Look
 * visual, los encoders DST/DSB, el CE01 loader, los colores principales ni las
 * formas/regiones. Solo repara la lista de comandos para que exporte sin errores
 * técnicos manteniendo el aspecto visual.
 *
 * Devuelve:
 *   { repairedCommands, repairReport, exportAllowed, remainingBlockingIssues }
 */
import { detectExportErrors, summarizeErrors } from './exportErrorDetector';
import {
  removeDuplicateStitches, mergeShortStitches, addTieInTieOff,
  optimizeTrimsAndJumps, splitUnsafeLongStitches, simplifyTinyObjects,
  reduceColorChangesIfSafe,
} from './preExportRepairer';
import { validateCE01 } from '@/lib/ce01Validator';
import { generateExportRepairReport } from './exportRepairReport';

/**
 * @param {object} ctx
 * @param {Array}  ctx.finalLookCommands
 * @param {Array}  ctx.objects
 * @param {Array}  ctx.regions
 * @param {object} ctx.config
 * @param {object} ctx.machineSettings
 * @returns {{ repairedCommands, repairReport, exportAllowed, remainingBlockingIssues }}
 */
export function repairFinalLookCommandsForExport({ finalLookCommands, objects = [], regions = [], config = {}, machineSettings = {} }) {
  const ms = { maxStitchLength: 12.1, maxJumpLength: 12.1, trimThreshold: 3.5, ...machineSettings };
  const source = (finalLookCommands || []).map(c => (c ? { ...c } : c));

  // ── FASE 1: detectar errores antes ──
  const beforeDetect = detectExportErrors(source, objects, regions, config, ms);
  const beforeCe01 = beforeDetect.ce01;
  const beforeCounts = beforeDetect.counts;

  // ── FASE 2: reparar en orden ──
  const repairReport = { steps: [] };
  let cmds = source;
  const steps = [
    ['removeDuplicateStitches', removeDuplicateStitches],
    ['mergeShortStitches', mergeShortStitches],
    ['splitUnsafeLongStitches', splitUnsafeLongStitches],
    ['simplifyTinyObjects', simplifyTinyObjects],
    ['addTieInTieOff', addTieInTieOff],
    ['optimizeTrimsAndJumps', optimizeTrimsAndJumps],
    ['reduceColorChangesIfSafe', reduceColorChangesIfSafe],
  ];
  for (const [name, fn] of steps) {
    const stepReport = {};
    const before = cmds.length;
    cmds = fn(cmds, regions, stepReport);
    const after = cmds.length;
    repairReport.steps.push({ name, before, after, ...stepReport });
  }

  // ── FASE 3: validar después ──
  const afterDetect = detectExportErrors(cmds, objects, regions, config, ms);
  const afterCe01 = afterDetect.ce01;
  const afterCounts = afterDetect.counts;

  // ── exportAllowed: true si no quedan errores bloqueantes ──
  const remainingBlockingIssues = afterDetect.errors.filter(e => e.severity === 'blocking' && e.count > 0);
  const exportAllowed = afterCe01.status !== 'INVALID' && remainingBlockingIssues.length === 0 && cmds.length > 0;

  // ── antes/después para la tabla ──
  const comparison = {
    stitchCount: { before: beforeCounts.stitches, after: afterCounts.stitches },
    jumpCount: { before: beforeCounts.jumps, after: afterCounts.jumps },
    trimCount: { before: beforeCounts.trims, after: afterCounts.trims },
    shortStitches: { before: beforeCounts.shortSt, after: afterCounts.shortSt },
    duplicateStitches: { before: beforeCounts.dups, after: afterCounts.dups },
    missingTieIn: { before: beforeCounts.noTieIn, after: afterCounts.noTieIn },
    missingTieOff: { before: beforeCounts.noTieOff, after: afterCounts.noTieOff },
    visibleDiagonalStitches: { before: beforeCounts.visibleDiag, after: afterCounts.visibleDiag },
    unsupportedLongStitches: { before: beforeCounts.longSt, after: afterCounts.longSt },
    colorCount: { before: beforeCounts.totalColors, after: afterCounts.totalColors },
    ce01Status: { before: beforeCe01.status, after: afterCe01.status },
    ce01Score: { before: beforeCe01.score, after: afterCe01.score },
    exportAllowed: { before: beforeCe01.status !== 'INVALID', after: exportAllowed },
  };

  repairReport.beforeErrors = beforeDetect.errors;
  repairReport.afterErrors = afterDetect.errors;
  repairReport.comparison = comparison;
  repairReport.beforeCe01 = beforeCe01;
  repairReport.afterCe01 = afterCe01;
  repairReport.remainingBlockingIssues = remainingBlockingIssues;

  // ── FASE 6: informe markdown ──
  repairReport.report = generateExportRepairReport({
    beforeErrors: beforeDetect.errors,
    afterErrors: afterDetect.errors,
    steps: repairReport.steps,
    comparison,
    beforeCe01, afterCe01,
    exportAllowed,
    remainingBlockingIssues,
  });

  return {
    repairedCommands: cmds,
    repairReport,
    exportAllowed,
    remainingBlockingIssues,
    comparison,
    beforeErrors: beforeDetect.errors,
    afterErrors: afterDetect.errors,
    beforeCe01,
    afterCe01,
  };
}