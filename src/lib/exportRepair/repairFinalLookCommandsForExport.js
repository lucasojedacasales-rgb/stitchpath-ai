/**
 * repairFinalLookCommandsForExport.js — ORQUESTRADOR v4 (transaccional, prioridad bloqueos)
 * ─────────────────────────────────────────────────────────────────────────────
 * Flujo: finalLookCommands → technicalRepair (transaccional) → validate → exportCommands
 *
 * REGLA PRINCIPAL (v4): eliminar un error BLOQUEANTE tiene prioridad sobre una
 * bajada moderada de ce01Score, siempre que CE01 no pase a INVALID. Una fase que
 * elimina bloqueos (visibleDiagonalStitches, emptyBlocks, invalidCommandSequence,
 * regionOutsideBounds) se acepta aunque ce01Score baje, si CE01 sigue RISKY.
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
  removeEmptyBlocks, repairVisibleDiagonalStitches,
  removeDuplicateStitches, addTieInTieOff, reduceColorChangesIfSafe,
} from './preExportRepairer';
import { validateCE01 } from '@/lib/ce01Validator';
import { generateExportRepairReport } from './exportRepairReport';
import { detectVisibleDiagonalStitches, generateVisibleDiagonalForensicsReport } from './visibleDiagonalDetector';

const MAX_STITCHES = 12000;

// Fases que eliminan errores BLOQUEANTES — prioridad sobre ce01Score.
const BLOCKING_FIX_PHASES = new Set([
  'removeEmptyBlocks',
  'removeEmptyBlocksFinal',
  'repairVisibleDiagonalStitches',
]);

// ── Métricas críticas medidas sobre comandos reales ───────────────────────────
function measureMetrics(commands, objects, regions, config, ms) {
  const det = detectExportErrors(commands, objects, regions, config, ms);
  const c = det.counts;
  return {
    emptyBlocks: c.emptyBlocks,
    visibleDiagonalStitches: c.visibleDiag,
    invalidCommandSequence: det.errors.find(e => e.type === 'invalidCommandSequence')?.count || 0,
    regionOutsideBounds: det.errors.find(e => e.type === 'regionOutsideBounds')?.count || 0,
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

// ── Gate transaccional: endurece fallos graves, flexibiliza score si bloquea ──
// blockingFix=true → permite bajada moderada de ce01Score si se elimina un bloqueo
// y CE01 no pasa a INVALID.
function phaseGateAccepts(before, after, opts = {}) {
  const reasons = [];
  const blockingFix = !!opts.blockingFixPriority;

  // ── Fallos duros (siempre revierten) ──
  if (before.ce01Status !== 'INVALID' && after.ce01Status === 'INVALID') {
    reasons.push('CE01 pasó a INVALID');
  }
  if (after.emptyBlocks > before.emptyBlocks) {
    reasons.push(`emptyBlocks ${before.emptyBlocks}→${after.emptyBlocks}`);
  }
  if (after.invalidCommandSequence > before.invalidCommandSequence) {
    reasons.push(`invalidCmd ${before.invalidCommandSequence}→${after.invalidCommandSequence}`);
  }
  if (after.regionOutsideBounds > before.regionOutsideBounds) {
    reasons.push(`outOfBounds ${before.regionOutsideBounds}→${after.regionOutsideBounds}`);
  }
  if (after.duplicateStitches > before.duplicateStitches) {
    reasons.push(`dups ${before.duplicateStitches}→${after.duplicateStitches}`);
  }
  // longSt: para fases que eliminan bloqueos es métrica secundaria (soft) — no
  // revierte la eliminación de diagonales visibles solo porque longSt suba +2.
  if (!blockingFix && after.unsupportedLongStitches > before.unsupportedLongStitches) {
    reasons.push(`longSt ${before.unsupportedLongStitches}→${after.unsupportedLongStitches}`);
  }
  if (after.stitchCountOverLimit > before.stitchCountOverLimit) {
    reasons.push(`stitchCountOverLimit ${before.stitchCountOverLimit}→${after.stitchCountOverLimit}`);
  }
  // shortStitches: aumento grave (>50) siempre revienta; pequeño permitido si blockingFix
  const shortDelta = after.shortStitches - before.shortStitches;
  if (shortDelta > 50) reasons.push(`shortSt +${shortDelta} (grave)`);

  // ── ce01Score: flexible para fases que eliminan bloqueos ──
  if (!blockingFix) {
    if (after.ce01Score < before.ce01Score - 0.5) {
      reasons.push(`ce01Score ${before.ce01Score}→${after.ce01Score}`);
    }
  } else {
    // permitir bajada hasta 15 puntos si CE01 no pasó a INVALID y se reduce un bloqueo
    const blockingReduced =
      after.visibleDiagonalStitches < before.visibleDiagonalStitches ||
      after.emptyBlocks < before.emptyBlocks ||
      after.invalidCommandSequence < before.invalidCommandSequence ||
      after.regionOutsideBounds < before.regionOutsideBounds;
    if (!blockingReduced && after.ce01Score < before.ce01Score - 0.5) {
      reasons.push(`ce01Score ${before.ce01Score}→${after.ce01Score} (sin reducción de bloqueos)`);
    } else if (after.ce01Score < before.ce01Score - 15) {
      reasons.push(`ce01Score caída excesiva ${before.ce01Score}→${after.ce01Score}`);
    }
  }
  return { accept: reasons.length === 0, reasons };
}

// ── Target de cada fase: debe mejorar si había algo que arreglar ───────────────
const PHASE_TARGETS = {
  removeEmptyBlocks: 'emptyBlocks',
  removeEmptyBlocksFinal: 'emptyBlocks',
  repairVisibleDiagonalStitches: 'visibleDiagonalStitches',
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
  if (target === 'emptyBlocks') {
    if (before.emptyBlocks === 0) return true;
    return after.emptyBlocks < before.emptyBlocks;
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
  const blockingFix = BLOCKING_FIX_PHASES.has(name);
  const gate = phaseGateAccepts(before, after, { blockingFixPriority: blockingFix });
  const target = PHASE_TARGETS[name];
  const improved = target ? targetImproved(before, after, target) : true;
  const accept = gate.accept && improved;
  phaseLog.push({
    name,
    accepted: accept,
    rejected: !accept,
    blockingFixPriority: blockingFix,
    acceptedDespiteScoreDrop: blockingFix && accept && after.ce01Score < before.ce01Score - 0.5,
    acceptedDespiteLongStIncrease: blockingFix && accept && after.unsupportedLongStitches > before.unsupportedLongStitches,
    reason: !gate.accept ? gate.reasons.join('; ') : (!improved ? `target ${target} no mejoró (${before[target]}→${after[target]})` : ''),
    before, after, stepReport,
  });
  return { commands: accept ? afterCommands : commands, accepted: accept };
}

// ── Criterio global de aceptación (v4: prioridad bloqueos) ────────────────────
function globalRepairAccepted(sourceMetrics, finalMetrics) {
  // FASE 4 — decisión global: aceptar repairedCommands si no hay bloqueos
  // restantes y CE01 no es INVALID. RISKY = exportar con advertencia.
  const ce01NotInvalid = finalMetrics.ce01Status !== 'INVALID';
  const noBlockingRemaining =
    finalMetrics.emptyBlocks === 0 &&
    finalMetrics.visibleDiagonalStitches === 0 &&
    finalMetrics.invalidCommandSequence === 0 &&
    finalMetrics.regionOutsideBounds === 0;
  // solo regresiones graves bloquean; warnings (shortSt/longSt/trims/jumps) no
  const noSevereRegression =
    finalMetrics.duplicateStitches <= sourceMetrics.duplicateStitches + 50 &&
    finalMetrics.shortStitches <= sourceMetrics.shortStitches + 100 &&
    finalMetrics.stitchCountOverLimit <= sourceMetrics.stitchCountOverLimit;
  return ce01NotInvalid && noBlockingRemaining && noSevereRegression;
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

  // ── Pipeline v4 (orden: removeEmpty → diagonales → dups → short → ties → trims → colors → emptyFinal) ──
  const darkSeed = { ...(darkStroke ? { darkStroke } : {}), config };
  // ── Pipeline v5 (orden: empty → diagonales → dups → ties → colors → emptyFinal) ──
  const phases = [
    { name: 'removeEmptyBlocks', fn: removeEmptyBlocks, seed: {} },
    { name: 'repairVisibleDiagonalStitches', fn: repairVisibleDiagonalStitches, seed: darkSeed },
    { name: 'removeDuplicateStitches', fn: removeDuplicateStitches, seed: {} },
    { name: 'addTieInTieOff', fn: addTieInTieOff, seed: {} },
    { name: 'reduceColorChangesIfSafe', fn: reduceColorChangesIfSafe, seed: {} },
    { name: 'removeEmptyBlocksFinal', fn: removeEmptyBlocks, seed: {} },
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
  let rejectionReason = null;
  if (!repairAccepted) {
    repairedCommands = source;
    repairRejected = true;
    rejectionReason = buildRejectionReason(sourceMetrics, finalMetrics);
  }

  // ── returnedMetrics = métricas de los comandos QUE SE DEVUELVEN ──
  const exportDecisionSource = repairAccepted ? 'repaired' : 'source';
  const returnedMetrics = measureMetrics(repairedCommands, objects, regions, config, ms);

  // ── exportAllowed + remainingBlockingIssues sobre los comandos devueltos ──
  const finalDetect = detectExportErrors(repairedCommands, objects, regions, config, ms);
  const remainingBlockingIssues = finalDetect.errors.filter(e => e.severity === 'blocking' && e.count > 0);
  // RISKY permite exportación; solo INVALID bloquea
  const exportAllowed = finalDetect.ce01.status !== 'INVALID' && repairedCommands.length > 0 && remainingBlockingIssues.length === 0;

  // ── Forensics de diagonales visibles (sobre los comandos devueltos) ──
  const vdDetection = detectVisibleDiagonalStitches(repairedCommands, objects, regions, darkStroke, config);
  const vdForensics = generateVisibleDiagonalForensicsReport(vdDetection);

  // ── comparativa antes/después/retornadas (misma fuente: returnedMetrics) ──
  const comparison = {
    stitchCount: { before: sourceMetrics.stitchCount, after: returnedMetrics.stitchCount },
    jumpCount: { before: sourceMetrics.jumpCount, after: returnedMetrics.jumpCount },
    trimCount: { before: sourceMetrics.trimCount, after: returnedMetrics.trimCount },
    shortStitches: { before: sourceMetrics.shortStitches, after: returnedMetrics.shortStitches },
    duplicateStitches: { before: sourceMetrics.duplicateStitches, after: returnedMetrics.duplicateStitches },
    missingTieIn: { before: sourceMetrics.missingTieIn, after: returnedMetrics.missingTieIn },
    missingTieOff: { before: sourceMetrics.missingTieOff, after: returnedMetrics.missingTieOff },
    visibleDiagonalStitches: { before: sourceMetrics.visibleDiagonalStitches, after: returnedMetrics.visibleDiagonalStitches },
    unsupportedLongStitches: { before: sourceMetrics.unsupportedLongStitches, after: returnedMetrics.unsupportedLongStitches },
    emptyBlocks: { before: sourceMetrics.emptyBlocks, after: returnedMetrics.emptyBlocks },
    invalidCommandSequence: { before: sourceMetrics.invalidCommandSequence, after: returnedMetrics.invalidCommandSequence },
    regionOutsideBounds: { before: sourceMetrics.regionOutsideBounds, after: returnedMetrics.regionOutsideBounds },
    colorCount: { before: sourceMetrics.colorCount, after: returnedMetrics.colorCount },
    ce01Status: { before: sourceMetrics.ce01Status, after: returnedMetrics.ce01Status },
    ce01Score: { before: sourceMetrics.ce01Score, after: returnedMetrics.ce01Score },
    exportAllowed: { before: sourceMetrics.exportAllowed, after: exportAllowed },
  };

  const repairReport = {
    phaseLog,
    sourceMetrics,
    repairedMetrics: finalMetrics,
    returnedMetrics,
    exportDecisionSource,
    comparison,
    repairAccepted,
    repairRejected,
    rejectionReason,
    exportAllowed,
    remainingBlockingIssues,
    exportBlockedBecauseRepairRejected: repairRejected ? `REPAIR_REJECTED — ${rejectionReason}` : null,
    visibleDiagForensics: vdForensics,
    visibleDiagDetection: vdDetection,
    report: generateExportRepairReport({
      phaseLog, sourceMetrics, finalMetrics, returnedMetrics, exportDecisionSource,
      comparison, repairAccepted, repairRejected, rejectionReason, exportAllowed, remainingBlockingIssues,
      visibleDiagForensics: vdForensics, visibleDiagDetection: vdDetection,
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

function buildRejectionReason(sourceMetrics, finalMetrics) {
  const reasons = [];
  if (finalMetrics.ce01Status === 'INVALID') reasons.push('CE01 pasó a INVALID');
  if (finalMetrics.emptyBlocks > 0) reasons.push(`emptyBlocks=${finalMetrics.emptyBlocks} restantes`);
  if (finalMetrics.visibleDiagonalStitches > 0 && finalMetrics.visibleDiagonalStitches >= sourceMetrics.visibleDiagonalStitches) {
    reasons.push(`visibleDiag no redujo (${sourceMetrics.visibleDiagonalStitches}→${finalMetrics.visibleDiagonalStitches})`);
  }
  if (finalMetrics.duplicateStitches > sourceMetrics.duplicateStitches + 20) reasons.push(`dups regresión +${finalMetrics.duplicateStitches - sourceMetrics.duplicateStitches}`);
  if (finalMetrics.shortStitches > sourceMetrics.shortStitches + 50) reasons.push(`shortSt regresión +${finalMetrics.shortStitches - sourceMetrics.shortStitches}`);
  if (reasons.length === 0) reasons.push('criterios globales no satisfechos');
  return reasons.join('; ');
}