/**
 * runSafeTieV2Experiment.js — Runner experimental (post-V5.1, solo informe)
 * ─────────────────────────────────────────────────────────────────────────────
 * Ejecuta safeAddTieInTieOffV2 sobre los repairedCommands V5.1 y mide todas las
 * invariantes. NO modifica el flujo V5.1. NO sustituye addTieInTieOff.
 *
 * Criterio de éxito experimental:
 *  - missingTieIn + missingTieOff baja claramente
 *  - visibleDiagonalStitches sigue 0
 *  - emptyBlocks sigue 0
 *  - unsupportedLongStitches no sube
 *  - CE01 status no pasa a INVALID
 *  - exportAllowed sigue true
 *
 * Devuelve { experimentAccepted, report, safeCommands, beforeMetrics, afterMetrics }.
 */
import { detectExportErrors } from './exportErrorDetector';
import { safeAddTieInTieOffV2 } from './safeAddTieInTieOffV2';

const MAX_STITCHES = 12000;

function measureMetrics(commands, objects, regions, config, ms) {
  const det = detectExportErrors(commands, objects, regions, config, ms);
  const c = det.counts;
  return {
    missingTieIn: c.noTieIn,
    missingTieOff: c.noTieOff,
    visibleDiagonalStitches: c.visibleDiag,
    emptyBlocks: c.emptyBlocks,
    invalidCommandSequence: det.errors.find(e => e.type === 'invalidCommandSequence')?.count || 0,
    regionOutsideBounds: det.errors.find(e => e.type === 'regionOutsideBounds')?.count || 0,
    unsupportedLongStitches: c.longSt,
    shortStitches: c.shortSt,
    duplicateStitches: c.dups,
    stitchCount: c.stitches,
    jumpCount: c.jumps,
    trimCount: c.trims,
    colorCount: c.totalColors,
    stitchCountOverLimit: Math.max(0, c.stitches - MAX_STITCHES),
    ce01Score: det.ce01.score,
    ce01Status: det.ce01.status,
    exportAllowed: det.ce01.status !== 'INVALID' && c.emptyBlocks === 0 &&
      (det.errors.find(e => e.type === 'invalidCommandSequence')?.count || 0) === 0 &&
      (det.errors.find(e => e.type === 'regionOutsideBounds')?.count || 0) === 0,
  };
}

export function runSafeTieV2Experiment(repairedCommands, objects = [], regions = [], config = {}, machineSettings = {}, darkStroke = null) {
  const ms = { maxStitchLength: 12.1, maxJumpLength: 12.1, trimThreshold: 3.5, ...machineSettings };
  const beforeMetrics = measureMetrics(repairedCommands || [], objects, regions, config, ms);

  const tieReport = {};
  const { commands: safeCommands, report: safeReport } = safeAddTieInTieOffV2(
    repairedCommands || [], objects, regions, config, darkStroke, tieReport
  );

  const afterMetrics = measureMetrics(safeCommands, objects, regions, config, ms);
  const commandCountBefore = (repairedCommands || []).length;
  const commandCountAfter = safeCommands.length;

  // ── criterios de éxito ──
  const tieReduced = (afterMetrics.missingTieIn + afterMetrics.missingTieOff) <
    (beforeMetrics.missingTieIn + beforeMetrics.missingTieOff);
  const visibleDiagStillZero = afterMetrics.visibleDiagonalStitches === 0;
  const emptyBlocksStillZero = afterMetrics.emptyBlocks === 0;
  const longStNotWorse = afterMetrics.unsupportedLongStitches <= beforeMetrics.unsupportedLongStitches;
  const ce01NotInvalid = afterMetrics.ce01Status !== 'INVALID';
  const exportAllowedStill = afterMetrics.exportAllowed === true;
  const invalidCmdStillZero = afterMetrics.invalidCommandSequence === 0;
  const outOfBoundsStillZero = afterMetrics.regionOutsideBounds === 0;

  const reasons = [];
  if (!tieReduced) reasons.push('missingTie no bajó');
  if (!visibleDiagStillZero) reasons.push(`visibleDiagonalStitches=${afterMetrics.visibleDiagonalStitches} (>0)`);
  if (!emptyBlocksStillZero) reasons.push(`emptyBlocks=${afterMetrics.emptyBlocks} (>0)`);
  if (!longStNotWorse) reasons.push(`unsupportedLongStitches subió ${beforeMetrics.unsupportedLongStitches}→${afterMetrics.unsupportedLongStitches}`);
  if (!ce01NotInvalid) reasons.push('CE01 pasó a INVALID');
  if (!exportAllowedStill) reasons.push('exportAllowed=false');
  if (!invalidCmdStillZero) reasons.push(`invalidCommandSequence=${afterMetrics.invalidCommandSequence} (>0)`);
  if (!outOfBoundsStillZero) reasons.push(`regionOutsideBounds=${afterMetrics.regionOutsideBounds} (>0)`);

  let experimentAccepted = reasons.length === 0;

  // Si la V2 detectó un error fatal de preservación, el experimento se rechaza.
  if (safeReport?.fatalPreservationError && !reasons.includes('fatalPreservationError: ' + safeReport.preservationErrorReason)) {
    reasons.push('fatalPreservationError: ' + (safeReport.preservationErrorReason || 'stitchCountDropped'));
    experimentAccepted = false;
  }

  const report = generateReport({
    beforeMetrics, afterMetrics, safeReport, experimentAccepted, reasons,
    commandCountBefore, commandCountAfter,
  });

  return {
    experimentAccepted,
    report,
    safeCommands,
    beforeMetrics,
    afterMetrics,
    safeReport,
  };
}

function generateReport({ beforeMetrics, afterMetrics, safeReport, experimentAccepted, reasons, commandCountBefore, commandCountAfter }) {
  const md = [];
  md.push('# SAFE_TIE_V2_EXPERIMENT_REPORT_V2 — StitchPath AI\n');
  md.push(`> Generado: ${new Date().toISOString()}`);
  md.push('> Modo experimental. NO modifica el flujo V5.1. NO sustituye addTieInTieOff.');
  md.push('> safeAddTieInTieOffV2 se ejecuta sobre los repairedCommands V5.1 solo para informe.\n');

  md.push('## Veredicto\n');
  md.push(`- **experimentAccepted: ${experimentAccepted ? 'SÍ' : 'NO'}**`);
  if (!experimentAccepted) {
    md.push(`- razones: ${reasons.join('; ')}`);
  }
  md.push('');

  md.push('## Métricas before / after\n');
  md.push('| Métrica | Before (V5.1 repaired) | After (V2 safe tie) | Δ |');
  md.push('|---|---|---|---|');
  const row = (label, key, fmt = 'n') => {
    const b = beforeMetrics[key], a = afterMetrics[key];
    const f = (v) => fmt === 'str' ? String(v) : (Number.isInteger(v) ? String(v) : (v?.toFixed?.(2) ?? '—'));
    const delta = (typeof b === 'number' && typeof a === 'number') ? a - b : 0;
    const ds = delta > 0 ? `+${delta}` : `${delta}`;
    md.push(`| ${label} | ${f(b)} | ${f(a)} | ${fmt === 'str' ? '—' : ds} |`);
  };
  row('missingTieIn', 'missingTieIn');
  row('missingTieOff', 'missingTieOff');
  row('visibleDiagonalStitches', 'visibleDiagonalStitches');
  row('unsupportedLongStitches', 'unsupportedLongStitches');
  row('emptyBlocks', 'emptyBlocks');
  row('invalidCommandSequence', 'invalidCommandSequence');
  row('regionOutsideBounds', 'regionOutsideBounds');
  row('shortStitches', 'shortStitches');
  row('duplicateStitches', 'duplicateStitches');
  row('stitchCount', 'stitchCount');
  row('jumpCount', 'jumpCount');
  row('trimCount', 'trimCount');
  row('colorCount', 'colorCount');
  row('ce01Score', 'ce01Score');
  row('ce01Status', 'ce01Status', 'str');
  row('exportAllowed', 'exportAllowed', 'str');
  md.push('');
  md.push('## Conteo de comandos / preservación\n');
  md.push('| Métrica | Before | After |');
  md.push('|---|---|---|');
  md.push(`| commandCount | ${commandCountBefore} | ${commandCountAfter} |`);
  md.push(`| stitchCount (preservación) | ${safeReport?.originalStitchCount ?? '—'} | ${safeReport?.outputStitchCount ?? '—'} |`);
  md.push(`| fatalPreservationError | ${safeReport?.fatalPreservationError ? 'SÍ' : 'NO'} | — |`);
  if (safeReport?.fatalPreservationError) md.push(`| preservationErrorReason | ${safeReport.preservationErrorReason} | — |`);
  md.push('');

  md.push('## Bloques tied / skipped\n');
  md.push(`- safeBlocksTied: **${safeReport.safeBlocksTied || 0}**`);
  md.push(`- safeBlocksSkipped: **${safeReport.safeBlocksSkipped || 0}**`);
  md.push(`- safeTieInAdded: **${safeReport.safeTieInAdded || 0}**`);
  md.push(`- safeTieOffAdded: **${safeReport.safeTieOffAdded || 0}**`);
  md.push('');

  md.push('## Razones de skipped\n');
  md.push('| razón | count |');
  md.push('|---|---|');
  md.push(`| tooSmall | ${safeReport.skippedBecauseTooSmall || 0} |`);
  md.push(`| zeroDirection / tieTooFar | ${safeReport.skippedBecauseZeroDirection || 0} |`);
  md.push(`| createsVisibleDiagonal | ${safeReport.skippedBecauseCreatesVisibleDiagonal || 0} |`);
  md.push(`| createsLongStitch | ${safeReport.skippedBecauseCreatesLongStitch || 0} |`);
  md.push(`| regionMismatch | ${safeReport.skippedBecauseRegionMismatch || 0} |`);
  md.push(`| importantDetail | ${safeReport.skippedBecauseImportantDetail || 0} |`);
  md.push('');

  md.push('## Criterio de éxito experimental\n');
  md.push(`| criterio | resultado |`);
  md.push(`|---|---|`);
  const tieReduced = (afterMetrics.missingTieIn + afterMetrics.missingTieOff) < (beforeMetrics.missingTieIn + beforeMetrics.missingTieOff);
  md.push(`| missingTieIn+Off baja | ${tieReduced ? '✅' : '❌'} (${beforeMetrics.missingTieIn + beforeMetrics.missingTieOff}→${afterMetrics.missingTieIn + afterMetrics.missingTieOff}) |`);
  md.push(`| visibleDiagonalStitches === 0 | ${afterMetrics.visibleDiagonalStitches === 0 ? '✅' : '❌'} (${afterMetrics.visibleDiagonalStitches}) |`);
  md.push(`| emptyBlocks === 0 | ${afterMetrics.emptyBlocks === 0 ? '✅' : '❌'} (${afterMetrics.emptyBlocks}) |`);
  md.push(`| unsupportedLongStitches no sube | ${afterMetrics.unsupportedLongStitches <= beforeMetrics.unsupportedLongStitches ? '✅' : '❌'} (${beforeMetrics.unsupportedLongStitches}→${afterMetrics.unsupportedLongStitches}) |`);
  md.push(`| CE01 no INVALID | ${afterMetrics.ce01Status !== 'INVALID' ? '✅' : '❌'} (${afterMetrics.ce01Status}) |`);
  md.push(`| exportAllowed true | ${afterMetrics.exportAllowed === true ? '✅' : '❌'} (${afterMetrics.exportAllowed}) |`);
  md.push('');

  md.push('## Decisión\n');
  if (experimentAccepted) {
    md.push('**experimentAccepted = SÍ**. safeAddTieInTieOffV2 reduce missingTie sin romper invariantes.');
    md.push('Puede considerarse para sustituir addTieInTieOff en una próxima iteración (previa validación en más diseños).');
    md.push('El flujo V5.1 **no se modifica**; safeCommands queda disponible como candidato pero export sigue usando repairedCommands V5.1.');
  } else {
    md.push('**experimentAccepted = NO**. No se toca V5.1 ni se sustituye addTieInTieOff.');
    md.push(`Razones: ${reasons.join('; ')}.`);
    md.push('Revisar los bloques skipped y las regresiones antes de reintentar.');
  }
  md.push('');

  md.push('---');
  md.push('_Modo experimental. No modifica el flujo V5.1 estable._');
  return md.join('\n');
}