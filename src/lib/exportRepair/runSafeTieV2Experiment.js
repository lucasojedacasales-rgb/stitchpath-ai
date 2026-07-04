/**
 * runSafeTieV2Experiment.js — Runner experimental (post-V5.1, solo informe) — V3
 * ─────────────────────────────────────────────────────────────────────────────
 * Ejecuta safeAddTieInTieOffV2 sobre los repairedCommands V5.1 y mide todas las
 * invariantes. NO modifica el flujo V5.1. NO sustituye addTieInTieOff.
 *
 * V3: la medición de missingTie se hace de DOS formas:
 *  - missingTieByRegion (antigua, por regionId global — la de exportErrorDetector)
 *  - missingTieByRealBlocks (nueva, por bloques consecutivos reales)
 *
 * El criterio de éxito (tieReduced) usa la medición NUEVA por bloques reales,
 * porque es la que reconoce los ties insertados por safeAddTieInTieOffV2. La
 * medición antigua se conserva en el informe solo para comparación.
 *
 * Devuelve { experimentAccepted, report, auditReport, safeCommands,
 *  beforeMetrics, afterMetrics, beforeRealBlocks, afterRealBlocks, safeReport }.
 */
import { detectExportErrors } from './exportErrorDetector';
import { safeAddTieInTieOffV2 } from './safeAddTieInTieOffV2';
import { detectMissingTieByRealBlocks } from './detectMissingTieByRealBlocks';
import { generateMissingTieDetectorAudit } from './missingTieDetectorAuditReport';

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
  const beforeRealBlocks = detectMissingTieByRealBlocks(repairedCommands || []);

  const tieReport = {};
  const { commands: safeCommands, report: safeReport } = safeAddTieInTieOffV2(
    repairedCommands || [], objects, regions, config, darkStroke, tieReport
  );

  const afterMetrics = measureMetrics(safeCommands, objects, regions, config, ms);
  const afterRealBlocks = detectMissingTieByRealBlocks(safeCommands);
  const commandCountBefore = (repairedCommands || []).length;
  const commandCountAfter = safeCommands.length;

  // ── invariantes ──
  const visibleDiagStillZero = afterMetrics.visibleDiagonalStitches === 0;
  const emptyBlocksStillZero = afterMetrics.emptyBlocks === 0;
  const longStNotWorse = afterMetrics.unsupportedLongStitches <= beforeMetrics.unsupportedLongStitches;
  const ce01NotInvalid = afterMetrics.ce01Status !== 'INVALID';
  const exportAllowedStill = afterMetrics.exportAllowed === true;
  const invalidCmdStillZero = afterMetrics.invalidCommandSequence === 0;
  const outOfBoundsStillZero = afterMetrics.regionOutsideBounds === 0;
  const noStitchesLost = (safeReport?.outputStitchCount ?? afterMetrics.stitchCount) >= (safeReport?.originalStitchCount ?? beforeMetrics.stitchCount);

  // ── medición de missingTie (NUEVA: por bloques reales) ──
  const beforeRealMissing = beforeRealBlocks.missingTieIn + beforeRealBlocks.missingTieOff;
  const afterRealMissing = afterRealBlocks.missingTieIn + afterRealBlocks.missingTieOff;
  const tieReducedByRealBlocks = afterRealMissing < beforeRealMissing;
  // medición antigua (solo informativa)
  const beforeRegionMissing = beforeMetrics.missingTieIn + beforeMetrics.missingTieOff;
  const afterRegionMissing = afterMetrics.missingTieIn + afterMetrics.missingTieOff;
  const tieReducedByRegion = afterRegionMissing < beforeRegionMissing;

  const reasons = [];
  if (!tieReducedByRealBlocks) reasons.push(`missingTieByRealBlocks no bajó (${beforeRealMissing}→${afterRealMissing})`);
  if (!visibleDiagStillZero) reasons.push(`visibleDiagonalStitches=${afterMetrics.visibleDiagonalStitches} (>0)`);
  if (!emptyBlocksStillZero) reasons.push(`emptyBlocks=${afterMetrics.emptyBlocks} (>0)`);
  if (!longStNotWorse) reasons.push(`unsupportedLongStitches subió ${beforeMetrics.unsupportedLongStitches}→${afterMetrics.unsupportedLongStitches}`);
  if (!ce01NotInvalid) reasons.push('CE01 pasó a INVALID');
  if (!exportAllowedStill) reasons.push('exportAllowed=false');
  if (!invalidCmdStillZero) reasons.push(`invalidCommandSequence=${afterMetrics.invalidCommandSequence} (>0)`);
  if (!outOfBoundsStillZero) reasons.push(`regionOutsideBounds=${afterMetrics.regionOutsideBounds} (>0)`);
  if (!noStitchesLost) reasons.push('stitchCount bajó (preservación rota)');

  let experimentAccepted = reasons.length === 0;

  // Si la V2 detectó un error fatal de preservación, el experimento se rechaza.
  if (safeReport?.fatalPreservationError && !reasons.includes('fatalPreservationError: ' + safeReport.preservationErrorReason)) {
    reasons.push('fatalPreservationError: ' + (safeReport.preservationErrorReason || 'stitchCountDropped'));
    experimentAccepted = false;
  }

  const auditReport = generateMissingTieDetectorAudit({
    beforeMetrics, afterMetrics,
    beforeRealBlocks, afterRealBlocks,
    safeReport,
    beforeRegionMissing, afterRegionMissing,
    beforeRealMissing, afterRealMissing,
  });

  const report = generateReport({
    beforeMetrics, afterMetrics, safeReport, experimentAccepted, reasons,
    commandCountBefore, commandCountAfter,
    beforeRealBlocks, afterRealBlocks,
    beforeRegionMissing, afterRegionMissing,
    beforeRealMissing, afterRealMissing,
    tieReducedByRegion, tieReducedByRealBlocks,
  });

  return {
    experimentAccepted,
    report,
    auditReport,
    safeCommands,
    beforeMetrics,
    afterMetrics,
    beforeRealBlocks,
    afterRealBlocks,
    safeReport,
  };
}

function generateReport(ctx) {
  const {
    beforeMetrics, afterMetrics, safeReport, experimentAccepted, reasons,
    commandCountBefore, commandCountAfter,
    beforeRealBlocks, afterRealBlocks,
    beforeRegionMissing, afterRegionMissing,
    beforeRealMissing, afterRealMissing,
    tieReducedByRegion, tieReducedByRealBlocks,
  } = ctx;
  const md = [];
  md.push('# SAFE_TIE_V2_EXPERIMENT_REPORT_V3 — StitchPath AI\n');
  md.push(`> Generado: ${new Date().toISOString()}`);
  md.push('> V3: medición de missingTie por bloques reales (detectMissingTieByRealBlocks).');
  md.push('> Modo experimental. NO modifica el flujo V5.1. NO sustituye addTieInTieOff.');
  md.push('> safeAddTieInTieOffV2 se ejecuta sobre los repairedCommands V5.1 solo para informe.\n');

  md.push('## Veredicto\n');
  md.push(`- **experimentAccepted: ${experimentAccepted ? 'SÍ' : 'NO'}**`);
  if (!experimentAccepted) {
    md.push(`- razones: ${reasons.join('; ')}`);
  }
  md.push('');

  md.push('## missingTie — doble medición\n');
  md.push('| Medición | Before | After | Δ | bajó |');
  md.push('|---|---|---|---|---|');
  md.push(`| missingTieByRegion (antigua, ×regionId) | ${beforeRegionMissing} | ${afterRegionMissing} | ${afterRegionMissing - beforeRegionMissing} | ${tieReducedByRegion ? '✅' : '❌'} |`);
  md.push(`| missingTieByRealBlocks (nueva, ×bloques) | ${beforeRealMissing} | ${afterRealMissing} | ${afterRealMissing - beforeRealMissing} | ${tieReducedByRealBlocks ? '✅' : '❌'} |`);
  md.push('');
  md.push('> Nota: la medición antigua agrupa por regionId global; si una región aparece en varios');
  md.push('> bloques del fichero, solo cuenta un bloque. Por eso no reconoce los ties añadidos.');
  md.push('> La medición nueva cuenta bloques consecutivos reales y sí los reconoce.');
  md.push('');

  md.push('## Detalle bloques reales (before / after)\n');
  md.push('| Métrica | Before | After |');
  md.push('|---|---|---|');
  md.push(`| realBlockCount (≥4 stitches) | ${beforeRealBlocks.realBlockCount} | ${afterRealBlocks.realBlockCount} |`);
  md.push(`| protectedBlockCount (detalle) | ${beforeRealBlocks.protectedBlockCount} | ${afterRealBlocks.protectedBlockCount} |`);
  md.push(`| evaluatedBlockCount | ${beforeRealBlocks.evaluatedBlockCount} | ${afterRealBlocks.evaluatedBlockCount} |`);
  md.push(`| blocksWithTieIn | ${beforeRealBlocks.blocksWithTieIn} | ${afterRealBlocks.blocksWithTieIn} |`);
  md.push(`| blocksWithTieOff | ${beforeRealBlocks.blocksWithTieOff} | ${afterRealBlocks.blocksWithTieOff} |`);
  md.push(`| missingTieIn (real) | ${beforeRealBlocks.missingTieIn} | ${afterRealBlocks.missingTieIn} |`);
  md.push(`| missingTieOff (real) | ${beforeRealBlocks.missingTieOff} | ${afterRealBlocks.missingTieOff} |`);
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
  row('missingTieIn (region, antigua)', 'missingTieIn');
  row('missingTieOff (region, antigua)', 'missingTieOff');
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
  md.push(`| NO perder stitches | ${noStitchesLostFlag(safeReport) ? '✅' : '❌'} (${safeReport?.originalStitchCount}→${safeReport?.outputStitchCount}) |`);
  md.push(`| emptyBlocks === 0 | ${afterMetrics.emptyBlocks === 0 ? '✅' : '❌'} (${afterMetrics.emptyBlocks}) |`);
  md.push(`| visibleDiagonalStitches === 0 | ${afterMetrics.visibleDiagonalStitches === 0 ? '✅' : '❌'} (${afterMetrics.visibleDiagonalStitches}) |`);
  md.push(`| unsupportedLongStitches no sube | ${afterMetrics.unsupportedLongStitches <= beforeMetrics.unsupportedLongStitches ? '✅' : '❌'} (${beforeMetrics.unsupportedLongStitches}→${afterMetrics.unsupportedLongStitches}) |`);
  md.push(`| exportAllowed true | ${afterMetrics.exportAllowed === true ? '✅' : '❌'} (${afterMetrics.exportAllowed}) |`);
  md.push(`| missingTieByRealBlocks baja si safeBlocksTied>0 | ${realBlocksTieCriterion(safeReport, beforeRealMissing, afterRealMissing) ? '✅' : '❌'} (${beforeRealMissing}→${afterRealMissing}) |`);
  md.push('');

  md.push('## PREVIEW_DIAGONAL_AUDIT\n');
  md.push('Auditoría del renderer Final Look (src/components/editor/FinalLookSimulator.jsx):\n');
  md.push('- `jump`: **NO se dibuja** (`continue` en la línea 114). El comentario dice "Don\'t draw jumps in final look".');
  md.push('- `trim` / `end`: **NO se dibujan** (`continue` en la línea 110).');
  md.push('- `colorChange`: actualiza el color y no dibuja (`continue`).');
  md.push('- Solo se dibujan segmentos `stitch` cuyo comando previo es `stitch` o `jump` (líneas 117-119).');
  md.push('  Cuando el previo es un `jump`, el segmento va desde el aterrizaje del jump hasta el stitch — es');
  md.push('  una puntada real (el jump reposicionó la aguja), no un travel visualizado.');
  md.push('- Contornos/detalles largos (>6mm) se descartan defensivamente (línea 134) para evitar puentes artificiales.');
  md.push('');
  md.push('**Conclusión del renderer:** las líneas negras diagonales visibles en Final Look NO son');
  md.push('jumps ni trims (esos se descartan). Son uno de:');
  md.push('  1. **Stitches reales** de color oscuro (contorno negro / detalle `detail_run`). Si son stitches');
  md.push('     reales que cruzan el diseño, `visibleDiagonalDetector` debe reportarlos; si no lo hace,');
  md.push('     el detector está fallando y debe corregirse.');
  md.push('  2. **Detail runs oscuros** (`renderColor = c.color || \'#1a1a1a\'`, línea 149) — son');
  md.push('     intencionales (detalles decorativos). No son travel ni bug.');
  md.push('');
  md.push('**Acción recomendada:**');
  md.push('- Si las diagonales son jumps/trims → ya están ocultos; no se requiere cambio.');
  md.push('- Si las diagonales son stitches reales oscuros → ejecutar VISIBLE_DIAGONAL_FORENSICS sobre');
  md.push('  los comandos devueltos (botón en ExportRepairPanel). Si visibleDiagonalStitches=0 pero las');
  md.push('  líneas siguen visibles, el detector tiene un gap y debe auditarse (fuera del alcance V3).');
  md.push('');

  md.push('## Decisión\n');
  if (experimentAccepted) {
    md.push('**experimentAccepted = SÍ**. safeAddTieInTieOffV2 reduce missingTieByRealBlocks sin romper invariantes.');
    md.push('Puede considerarse para sustituir addTieInTieOff en una próxima iteración (previa validación en más diseños).');
    md.push('El flujo V5.1 **no se modifica**; safeCommands queda disponible como candidato pero export sigue usando repairedCommands V5.1.');
  } else {
    md.push('**experimentAccepted = NO**. No se toca V5.1 ni se sustituye addTieInTieOff.');
    md.push(`Razones: ${reasons.join('; ')}.`);
    md.push('Revisar los bloques skipped y las regresiones antes de reintentar.');
  }
  md.push('');

  md.push('---');
  md.push('_V3 — medición por bloques reales + auditoría de preview. Modo experimental. No modifica el flujo V5.1 estable._');
  return md.join('\n');
}

function noStitchesLostFlag(safeReport) {
  if (!safeReport) return false;
  const o = safeReport.originalStitchCount, a = safeReport.outputStitchCount;
  return typeof o === 'number' && typeof a === 'number' && a >= o;
}

function realBlocksTieCriterion(safeReport, beforeRealMissing, afterRealMissing) {
  if ((safeReport?.safeBlocksTied || 0) > 0) return afterRealMissing < beforeRealMissing;
  return true; // sin bloques atados, no se exige reducción
}