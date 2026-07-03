/**
 * repairFinalLookCommandsForExport.js — ORQUESTRADOR v2 (transaccional)
 * ─────────────────────────────────────────────────────────────────────────────
 * Flujo: finalLookCommands → technicalRepair (transaccional) → validate → exportCommands
 *
 * REGLA PRINCIPAL: cada fase mide métricas antes/después. Si una fase empeora
 * métricas críticas, se revierte automáticamente. Si el resultado global no
 * supera los criterios de aceptación, se revierte todo (REPAIR_REJECTED) y se
 * devuelven los comandos originales.
 *
 * NO toca: detector universal, aprendizaje del corpus, Final Look visual,
 * encoders DST/DSB, CE01 loader, colores/regiones principales.
 *
 * Devuelve:
 *   { repairedCommands, repairAccepted, repairRejected, repairReport,
 *     exportAllowed, remainingBlockingIssues, comparison, phaseLog }
 */
import { detectExportErrors } from './exportErrorDetector';
import {
  removeEmptyBlocks, repairVisibleDiagonalStitches, splitUnsafeLongStitches,
  removeDuplicateStitches, mergeShortStitches, optimizeTrimsAndJumps,
  addTieInTieOff, reduceColorChangesIfSafe,
} from './preExportRepairer';
import { validateCE01 } from '@/lib/ce01Validator';
import { generateExportRepairReport } from './exportRepairReport';

const MAX_STITCHES = 12000;

// ── Métricas críticas medidas sobre comandos reales ───────────────────────────
function measureMetrics(commands, objects, regions, config, ms) {
  const det = detectExportErrors(commands, objects, regions, config, ms);
  const c = det.counts;
  return {
    emptyBlocks: c.emptyBlocks,
    visibleDiagonalStitches: c.visibleDiag,
    shortStitches: c.shortSt,
    duplicateStitches: c.dups,
    unsupportedLongStitches: c.longSt,
    missingTieIn: c.noTieIn,
    missingTieOff: c.noTieOff,
    stitchCount: c.stitches,
    jumpCount: c.jumps,
    trimCount: c.trims,
    colorCount: c.totalColors,
    stitchCountOverLimit: Math.max(0, c.stitches - MAX_STITCHES),
    ce01Score: det.ce01.score,
    ce01Status: det.ce01.status,
    exportAllowed: det.ce01.status !== 'INVALID',
  };
}

// ── Gate genérico: ninguna métrica crítica puede empeorar ─────────────────────
function phaseGateAccepts(before, after) {
  const reasons = [];
  if (after.emptyBlocks > before.emptyBlocks) reasons.push(`emptyBlocks ${before.emptyBlocks}→${after.emptyBlocks}`);
  if (after.visibleDiagonalStitches > before.visibleDiagonalStitches) reasons.push(`visibleDiag ${before.visibleDiagonalStitches}→${after.visibleDiagonalStitches}`);
  if (after.shortStitches > before.shortStitches) reasons.push(`shortSt ${before.shortStitches}→${after.shortStitches}`);
  if (after.duplicateStitches > before.duplicateStitches) reasons.push(`dups ${before.duplicateStitches}→${after.duplicateStitches}`);
  if (after.unsupportedLongStitches > before.unsupportedLongStitches) reasons.push(`longSt ${before.unsupportedLongStitches}→${after.unsupportedLongStitches}`);
  if (after.stitchCountOverLimit > before.stitchCountOverLimit) reasons.push(`stitchCountOverLimit ${before.stitchCountOverLimit}→${after.stitchCountOverLimit}`);
  if (before.exportAllowed && !after.exportAllowed) reasons.push('exportAllowed true→false');
  if (after.ce01Score < before.ce01Score - 0.5) reasons.push(`ce01Score ${before.ce01Score}→${after.ce01Score}`);
  return { accept: reasons.length === 0, reasons };
}

// ── Target de cada fase: debe mejorar si había algo que arreglar ───────────────
const PHASE_TARGETS = {
  removeEmptyBlocks: 'emptyBlocks',
  repairVisibleDiagonalStitches: 'visibleDiagonalStitches',
  splitUnsafeLongStitches: 'unsupportedLongStitches',
  removeDuplicateStitches: 'duplicateStitches',
  mergeShortStitches: 'shortStitches',
  addTieInTieOff: 'missingTie',
  // optimizeTrimsAndJumps y reduceColorChangesIfSafe: sin target obligatorio
};

function targetImproved(before, after, target) {
  if (target === 'missingTie') {
    const bT = before.missingTieIn + before.missingTieOff;
    const aT = after.missingTieIn + after.missingTieOff;
    if (bT === 0) return true; // nada que arreglar
    return aT < bT;
  }
  if (before[target] === 0) return true; // nada que arreglar
  return after[target] < before[target];
}

// ── runRepairPhase: ejecuta una fase y decide aceptar/revertir ────────────────
function runRepairPhase({ name, commands, repairFn, seed, objects, regions, config, ms, phaseLog }) {
  const before = measureMetrics(commands, objects, regions, config, ms);
  let afterCommands;
  const stepReport = { ...(seed || {}) };
  try {
    afterCommands = repairFn(commands, objects, regions, stepReport);
  } catch (e) {
    phaseLog.push({ name, accepted: false, rejected: true, reason: `EXCEPTION: ${e.message}`, before, after: before, stepReport });
    return { commands, accepted: false };
  }
  const after = measureMetrics(afterCommands, objects, regions, config, ms);
  const gate = phaseGateAccepts(before, after);
  const target = PHASE_TARGETS[name];
  const improved = target ? targetImproved(before, after, target) : true;
  const accept = gate.accept && improved;
  phaseLog.push({
    name,
    accepted: accept,
    rejected: !accept,
    reason: !gate.accept ? gate.reasons.join('; ') : (!improved ? `target ${target} no mejoró (${before[target]}→${after[target]})` : ''),
    before, after, stepReport,
  });
  return { commands: accept ? afterCommands : commands, accepted: accept };
}

// ── Criterio global de aceptación (FASE 8) ────────────────────────────────────
function globalRepairAccepted(sourceMetrics, finalMetrics) {
  const ok =
    finalMetrics.emptyBlocks === 0 &&
    (finalMetrics.visibleDiagonalStitches === 0 || finalMetrics.visibleDiagonalStitches < sourceMetrics.visibleDiagonalStitches) &&
    finalMetrics.shortStitches <= sourceMetrics.shortStitches &&
    finalMetrics.ce01Score >= sourceMetrics.ce01Score - 0.5 &&
    finalMetrics.exportAllowed &&
    finalMetrics.stitchCountOverLimit <= sourceMetrics.stitchCountOverLimit;
  return ok;
}

/**
 * @param {object} ctx
 * @param {Array}  ctx.finalLookCommands
 * @param {Array}  ctx.objects
 * @param {Array}  ctx.regions
 * @param {object} ctx.config
 * @param {object} ctx.machineSettings
 * @param {object} ctx.darkStroke   (opcional, para soporte de contornos)
 */
export function repairFinalLookCommandsForExport({ finalLookCommands, objects = [], regions = [], config = {}, machineSettings = {}, darkStroke = null }) {
  const ms = { maxStitchLength: 12.1, maxJumpLength: 12.1, trimThreshold: 3.5, ...machineSettings };
  const source = (finalLookCommands || []).map(c => (c ? { ...c } : c));
  const sourceMetrics = measureMetrics(source, objects, regions, config, ms);

  const phaseLog = [];
  let cmds = source;

  // ── Pipeline transaccional en orden v2 ──
  const darkSeed = darkStroke ? { darkStroke } : {};
  const phases = [
    { name: 'removeEmptyBlocks', fn: removeEmptyBlocks, seed: {} },
    { name: 'repairVisibleDiagonalStitches', fn: repairVisibleDiagonalStitches, seed: darkSeed },
    { name: 'splitUnsafeLongStitches', fn: splitUnsafeLongStitches, seed: darkSeed },
    { name: 'removeDuplicateStitches', fn: removeDuplicateStitches, seed: {} },
    { name: 'mergeShortStitches', fn: mergeShortStitches, seed: {} },
    { name: 'optimizeTrimsAndJumps', fn: optimizeTrimsAndJumps, seed: {} },
    { name: 'addTieInTieOff', fn: addTieInTieOff, seed: {} },
    { name: 'reduceColorChangesIfSafe', fn: reduceColorChangesIfSafe, seed: {} },
  ];

  for (const p of phases) {
    const res = runRepairPhase({
      name: p.name, commands: cmds, repairFn: p.fn, seed: p.seed,
      objects, regions, config, ms, phaseLog,
    });
    cmds = res.commands;
  }

  const finalMetrics = measureMetrics(cmds, objects, regions, config, ms);

  // ── Criterio global: si no supera, revertir todo ──
  const repairAccepted = globalRepairAccepted(sourceMetrics, finalMetrics);
  let repairedCommands = cmds;
  let repairRejected = false;
  if (!repairAccepted) {
    // revertir: devolver comandos originales
    repairedCommands = source;
    repairRejected = true;
  }

  // ── exportAllowed sobre los comandos finales que se devuelven ──
  const finalDetect = detectExportErrors(repairedCommands, objects, regions, config, ms);
  const remainingBlockingIssues = finalDetect.errors.filter(e => e.severity === 'blocking' && e.count > 0);
  const exportAllowed = finalDetect.ce01.status !== 'INVALID' && repairedCommands.length > 0 && remainingBlockingIssues.length === 0;

  // ── comparativa antes/después (sobre los comandos devueltos) ──
  const comparison = {
    stitchCount: { before: sourceMetrics.stitchCount, after: finalMetrics.stitchCount },
    jumpCount: { before: sourceMetrics.jumpCount, after: finalMetrics.jumpCount },
    trimCount: { before: sourceMetrics.trimCount, after: finalMetrics.trimCount },
    shortStitches: { before: sourceMetrics.shortStitches, after: finalMetrics.shortStitches },
    duplicateStitches: { before: sourceMetrics.duplicateStitches, after: finalMetrics.duplicateStitches },
    missingTieIn: { before: sourceMetrics.missingTieIn, after: finalMetrics.missingTieIn },
    missingTieOff: { before: sourceMetrics.missingTieOff, after: finalMetrics.missingTieOff },
    visibleDiagonalStitches: { before: sourceMetrics.visibleDiagonalStitches, after: finalMetrics.visibleDiagonalStitches },
    unsupportedLongStitches: { before: sourceMetrics.unsupportedLongStitches, after: finalMetrics.unsupportedLongStitches },
    emptyBlocks: { before: sourceMetrics.emptyBlocks, after: finalMetrics.emptyBlocks },
    colorCount: { before: sourceMetrics.colorCount, after: finalMetrics.colorCount },
    ce01Status: { before: sourceMetrics.ce01Status, after: finalMetrics.ce01Status },
    ce01Score: { before: sourceMetrics.ce01Score, after: finalMetrics.ce01Score },
    exportAllowed: { before: sourceMetrics.exportAllowed, after: exportAllowed },
  };

  const repairReport = {
    phaseLog,
    sourceMetrics,
    finalMetrics,
    comparison,
    repairAccepted,
    repairRejected,
    exportAllowed,
    remainingBlockingIssues,
    report: generateExportRepairReport({
      phaseLog, sourceMetrics, finalMetrics, comparison,
      repairAccepted, repairRejected, exportAllowed, remainingBlockingIssues,
    }),
  };

  return {
    repairedCommands,
    repairAccepted,
    repairRejected,
    repairReport,
    exportAllowed,
    remainingBlockingIssues,
    comparison,
    phaseLog,
  };
}