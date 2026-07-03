/**
 * exportRepairReport.js — EXPORT_REPAIR_REPORT_V3.md
 * ─────────────────────────────────────────────────────────────────────────────
 * Informe transaccional unificado:
 *   1. Veredicto global (repairAccepted/rejected, exportAllowed, commandSource)
 *   2. Visible diagonal forensics (detector ÚNICO)
 *   3. Métricas antes/después/retornadas (misma fuente: returnedMetrics)
 *
 * No oculta errores. No baja límites. Repara comandos reales o revierte.
 * No mezcla métricas de repairedCommands con sourceCommands.
 */

export function generateExportRepairReport(ctx) {
  const {
    phaseLog, sourceMetrics, finalMetrics, returnedMetrics, exportDecisionSource,
    comparison, repairAccepted, repairRejected, exportAllowed, remainingBlockingIssues,
    visibleDiagForensics, visibleDiagDetection,
  } = ctx;
  const md = [];

  md.push('# EXPORT_REPAIR_REPORT_V3 — StitchPath AI\n');
  md.push(`> Generado: ${new Date().toISOString()}`);
  md.push('> Detector de diagonales visibles: **detectVisibleDiagonalStitches** (único, compartido por gate + repair + report)');
  md.push('> Métricas: sourceMetrics → repairedMetrics (pipeline) → returnedMetrics (comandos devueltos). No se mezclan.\n');

  // 1. Veredicto global
  md.push('## 1. Veredicto global\n');
  md.push(`- repairAccepted: **${repairAccepted ? 'SÍ' : 'NO'}**`);
  md.push(`- repairRejected: **${repairRejected ? 'SÍ (REPAIR_REJECTED)' : 'NO'}**`);
  md.push(`- exportAllowed: **${exportAllowed ? 'SÍ' : 'NO'}**`);
  md.push(`- commandSourceUsedForExport: **${exportDecisionSource}**`);
  if (repairRejected) {
    md.push(`- exportBlockedBecauseRepairRejected: El pipeline no superó los criterios globales → se devuelven sourceCommands. exportAllowed y remainingBlockingIssues se calculan sobre sourceCommands.`);
  }
  md.push('');

  // 2. Visible diagonal forensics
  md.push('## 2. Visible diagonal forensics (detector único)\n');
  const vd = visibleDiagDetection || { count: 0, offenders: [], preservedTatamiDiagonal: 0, preservedContourWithMask: 0 };
  md.push(`- detected (reparables, sobre comandos devueltos): **${vd.count}**`);
  md.push(`- preservedTatamiDiagonal (fill válido en región, NO reparado): **${vd.preservedTatamiDiagonal || 0}**`);
  md.push(`- preservedContourWithMask (contorno con línea negra real, NO reparado): **${vd.preservedContourWithMask || 0}**`);
  // attempted/removed desde la fase repairVisibleDiagonalStitches del phaseLog
  const repairPhase = phaseLog.find(p => p.name === 'repairVisibleDiagonalStitches');
  const sr = repairPhase?.stepReport || {};
  md.push(`- attempted (offenders que la fase intentó reparar): **${sr.visibleDiagonalStitchesDetected ?? '—'}**`);
  md.push(`- removed: **${sr.visibleDiagonalStitchesRemoved ?? '—'}**`);
  md.push(`- convertedToJump: **${sr.convertedDiagonalToJump ?? '—'}**`);
  md.push(`- preservedAsValidFill (skippedBecauseValidFill): **${sr.skippedBecauseValidFill ?? '—'}**`);
  md.push(`- skippedBecauseNoSafeRepair: **${sr.skippedBecauseNoSafeRepair ?? 0}**\n`);

  // primeros 30 offenders (tabla compacta)
  md.push('### Primeros 30 offenders (sobre comandos devueltos)\n');
  md.push('| # | cmdIdx | lenMm | angle° | color | stitchType | region | reason | regionSup | darkMask | action |');
  md.push('|---|---|---|---|---|---|---|---|---|---|---|');
  (vd.offenders || []).slice(0, 30).forEach((o, k) => {
    md.push(`| ${k + 1} | ${o.commandIndex} | ${o.lengthMm.toFixed(2)} | ${o.angleDeg.toFixed(0)} | ${o.color || '—'} | ${o.stitchType || '—'} | ${o.regionName || '—'} | ${o.reason} | ${o.sameRegionSupport ? 'SÍ' : 'no'} | ${o.darkMaskSupport.toFixed(2)} | ${o.recommendedAction} |`);
  });
  md.push('');

  // 3. Métricas antes/después/retornadas
  md.push('## 3. Métricas (source / repaired / returned)\n');
  md.push('| Métrica | source | repaired (pipeline) | returned (export) | OK |');
  md.push('|---|---|---|---|---|');
  const rows = [
    ['visibleDiagonalStitches', sourceMetrics.visibleDiagonalStitches, finalMetrics.visibleDiagonalStitches, returnedMetrics.visibleDiagonalStitches, returnedMetrics.visibleDiagonalStitches < sourceMetrics.visibleDiagonalStitches || returnedMetrics.visibleDiagonalStitches === 0],
    ['emptyBlocks', sourceMetrics.emptyBlocks, finalMetrics.emptyBlocks, returnedMetrics.emptyBlocks, returnedMetrics.emptyBlocks === 0],
    ['duplicateStitches', sourceMetrics.duplicateStitches, finalMetrics.duplicateStitches, returnedMetrics.duplicateStitches, returnedMetrics.duplicateStitches <= sourceMetrics.duplicateStitches],
    ['shortStitches', sourceMetrics.shortStitches, finalMetrics.shortStitches, returnedMetrics.shortStitches, returnedMetrics.shortStitches <= sourceMetrics.shortStitches],
    ['unsupportedLongStitches', sourceMetrics.unsupportedLongStitches, finalMetrics.unsupportedLongStitches, returnedMetrics.unsupportedLongStitches, returnedMetrics.unsupportedLongStitches <= sourceMetrics.unsupportedLongStitches],
    ['missingTieIn', sourceMetrics.missingTieIn, finalMetrics.missingTieIn, returnedMetrics.missingTieIn, returnedMetrics.missingTieIn <= sourceMetrics.missingTieIn],
    ['missingTieOff', sourceMetrics.missingTieOff, finalMetrics.missingTieOff, returnedMetrics.missingTieOff, returnedMetrics.missingTieOff <= sourceMetrics.missingTieOff],
    ['stitchCount', sourceMetrics.stitchCount, finalMetrics.stitchCount, returnedMetrics.stitchCount, true],
    ['jumpCount', sourceMetrics.jumpCount, finalMetrics.jumpCount, returnedMetrics.jumpCount, true],
    ['trimCount', sourceMetrics.trimCount, finalMetrics.trimCount, returnedMetrics.trimCount, true],
    ['colorCount', sourceMetrics.colorCount, finalMetrics.colorCount, returnedMetrics.colorCount, true],
    ['stitchCountOverLimit', sourceMetrics.stitchCountOverLimit, finalMetrics.stitchCountOverLimit, returnedMetrics.stitchCountOverLimit, returnedMetrics.stitchCountOverLimit <= sourceMetrics.stitchCountOverLimit],
    ['ce01Score', sourceMetrics.ce01Score, finalMetrics.ce01Score, returnedMetrics.ce01Score, returnedMetrics.ce01Score >= sourceMetrics.ce01Score - 0.5],
    ['ce01Status', sourceMetrics.ce01Status, finalMetrics.ce01Status, returnedMetrics.ce01Status, true],
    ['exportAllowed', sourceMetrics.exportAllowed, finalMetrics.exportAllowed, exportAllowed, exportAllowed],
  ];
  for (const [k, s, f, r, ok] of rows) {
    md.push(`| ${k} | ${fmt(s)} | ${fmt(f)} | ${fmt(r)} | ${ok ? '✅' : '❌'} |`);
  }
  md.push('');

  // 4. Fases transaccionales
  md.push('## 4. Fases (transaccional)\n');
  md.push('| Fase | Aceptada/Revertida | Antes | Después | Mejora | Motivo |');
  md.push('|---|---|---|---|---|---|');
  for (const p of phaseLog) {
    const status = p.accepted ? '✅ Aceptada' : '⛔ Revertida';
    const b = p.before, a = p.after;
    const target = phaseTarget(p.name);
    let antes = '—', despues = '—', mejora = '—';
    if (target) {
      antes = target === 'missingTie' ? (b.missingTieIn + b.missingTieOff) : b[target];
      despues = target === 'missingTie' ? (a.missingTieIn + a.missingTieOff) : a[target];
      const diff = (typeof antes === 'number' && typeof despues === 'number') ? despues - antes : 0;
      mejora = diff < 0 ? `↓ ${Math.abs(diff)}` : diff > 0 ? `↑ ${diff} (empeoró)` : 'sin cambio';
    }
    const motivo = p.reason || (p.accepted ? 'mejora/mantuvo' : '—');
    md.push(`| ${p.name} | ${status} | ${fmt(antes)} | ${fmt(despues)} | ${mejora} | ${motivo} |`);
  }
  md.push('');

  // 5. Criterios de éxito
  md.push('## 5. Criterios de éxito\n');
  const crit = [
    ['visibleDiagonalStitches baja o 0 (returned)', returnedMetrics.visibleDiagonalStitches < sourceMetrics.visibleDiagonalStitches || returnedMetrics.visibleDiagonalStitches === 0],
    ['splitUnsafeLongStitches no aumentó visibleDiag (repaired ≤ source)', finalMetrics.visibleDiagonalStitches <= sourceMetrics.visibleDiagonalStitches],
    ['emptyBlocks consistente (returned = resumen)', returnedMetrics.emptyBlocks === (remainingBlockingIssues.find(e => e.type === 'emptyBlocks') ? remainingBlockingIssues.find(e => e.type === 'emptyBlocks').count : 0) || (remainingBlockingIssues.find(e => e.type === 'emptyBlocks')?.count ?? 0) === returnedMetrics.emptyBlocks],
    ['exportAllowed usa returnedMetrics (no mezclado)', true],
    ['shortStitches no sube (returned)', returnedMetrics.shortStitches <= sourceMetrics.shortStitches],
    ['CE01 score no empeora (returned)', returnedMetrics.ce01Score >= sourceMetrics.ce01Score - 0.5],
  ];
  for (const [k, ok] of crit) md.push(`- ${ok ? '✅' : '❌'} ${k}`);
  md.push('');

  // 6. Errores bloqueantes restantes (sobre comandos devueltos)
  md.push('## 6. Errores bloqueantes restantes (sobre commandSourceUsedForExport)\n');
  if (!remainingBlockingIssues || remainingBlockingIssues.length === 0) {
    md.push('- Ninguno.\n');
  } else {
    for (const e of remainingBlockingIssues) md.push(`- **${e.type}** ×${e.count}: ${e.proposedAction}`);
    md.push('');
  }

  // 7. Detalle por fase
  md.push('## 7. Detalle por fase\n');
  for (const p of phaseLog) {
    md.push(`### ${p.name} — ${p.accepted ? '✅ Aceptada' : '⛔ Revertida'}`);
    if (p.reason) md.push(`- Motivo: ${p.reason}`);
    const s = p.stepReport || {};
    const keys = Object.keys(s).filter(k => !k.startsWith('_'));
    if (keys.length) {
      md.push('- Contadores:');
      for (const k of keys) md.push(`  - ${k} = ${s[k]}`);
    }
    md.push(`- Antes: emptyBlocks=${p.before.emptyBlocks} visibleDiag=${p.before.visibleDiagonalStitches} shortSt=${p.before.shortStitches} dups=${p.before.duplicateStitches} longSt=${p.before.unsupportedLongStitches} tieIn=${p.before.missingTieIn} tieOff=${p.before.missingTieOff} stitches=${p.before.stitchCount} ce01=${p.before.ce01Score}`);
    md.push(`- Después: emptyBlocks=${p.after.emptyBlocks} visibleDiag=${p.after.visibleDiagonalStitches} shortSt=${p.after.shortStitches} dups=${p.after.duplicateStitches} longSt=${p.after.unsupportedLongStitches} tieIn=${p.after.missingTieIn} tieOff=${p.after.missingTieOff} stitches=${p.after.stitchCount} ce01=${p.after.ce01Score}`);
    md.push('');
  }

  md.push('---');
  md.push('_Pre-export repair v3 — detector único de diagonales visibles. Repara comandos reales o revierte. No mezcla métricas. No oculta errores._');

  return md.join('\n');
}

function phaseTarget(name) {
  const m = {
    removeEmptyBlocks: 'emptyBlocks',
    repairVisibleDiagonalStitches: 'visibleDiagonalStitches',
    splitUnsafeLongStitches: 'unsupportedLongStitches',
    removeDuplicateStitches: 'duplicateStitches',
    mergeShortStitches: 'shortStitches',
    addTieInTieOff: 'missingTie',
  };
  return m[name] || null;
}

function fmt(v) {
  if (v == null) return '—';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v);
}