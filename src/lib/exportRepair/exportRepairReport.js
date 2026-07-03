/**
 * exportRepairReport.js — EXPORT_REPAIR_REPORT_V4.md
 * ─────────────────────────────────────────────────────────────────────────────
 * Informe transaccional v4 — prioridad de bloqueos sobre ce01Score.
 *   1. Veredicto (repairAccepted, exportAllowed, commandSource, CE01 status/score)
 *   2. Bloqueos antes/después (emptyBlocks, visibleDiag, invalidCmd, outOfBounds)
 *   3. Fase repairVisibleDiagonalStitches (detected/removed/converted/acceptedDespiteScoreDrop)
 *   4. Fase removeEmptyBlocks (removed/remaining/commandIndexes)
 *   5. Métricas (stitch/jump/trim/short/dups/tieIn/tieOff/color/exportAllowed)
 *
 * No oculta errores. No baja límites. Repara comandos reales o revierte.
 */

export function generateExportRepairReport(ctx) {
  const {
    phaseLog, sourceMetrics, finalMetrics, returnedMetrics, exportDecisionSource,
    comparison, repairAccepted, repairRejected, rejectionReason, exportAllowed, remainingBlockingIssues,
    visibleDiagForensics, visibleDiagDetection,
  } = ctx;
  const md = [];

  md.push('# EXPORT_REPAIR_REPORT_V4 — StitchPath AI\n');
  md.push(`> Generado: ${new Date().toISOString()}`);
  md.push('> Prioridad: eliminar errores BLOQUEANTES > ce01Score. RISKY permite export; INVALID bloquea.');
  md.push('> Métricas: sourceMetrics → repairedMetrics (pipeline) → returnedMetrics (comandos devueltos). No se mezclan.\n');

  // 1. Veredicto
  md.push('## 1. Veredicto\n');
  md.push(`- repairAccepted: **${repairAccepted ? 'SÍ' : 'NO'}**`);
  md.push(`- repairRejected: **${repairRejected ? 'SÍ (REPAIR_REJECTED)' : 'NO'}**`);
  md.push(`- exportAllowed: **${exportAllowed ? 'SÍ' : 'NO'}**`);
  md.push(`- commandSourceUsedForExport: **${exportDecisionSource}**`);
  md.push(`- CE01 status: **${returnedMetrics.ce01Status}** (source: ${sourceMetrics.ce01Status})`);
  md.push(`- CE01 score: **${returnedMetrics.ce01Score}** (source: ${sourceMetrics.ce01Score})`);
  if (repairRejected) {
    md.push(`- exportBlockedBecauseRepairRejected: ${rejectionReason || 'REPAIR_REJECTED — export usa sourceCommands.'}`);
  }
  md.push('');

  // 2. Bloqueos antes/después
  md.push('## 2. Bloqueos antes/después (returned = export)\n');
  md.push('| Bloqueo | source | repaired | returned | resuelto |');
  md.push('|---|---|---|---|---|');
  const blockingRows = [
    ['emptyBlocks', sourceMetrics.emptyBlocks, finalMetrics.emptyBlocks, returnedMetrics.emptyBlocks],
    ['visibleDiagonalStitches', sourceMetrics.visibleDiagonalStitches, finalMetrics.visibleDiagonalStitches, returnedMetrics.visibleDiagonalStitches],
    ['invalidCommandSequence', sourceMetrics.invalidCommandSequence, finalMetrics.invalidCommandSequence, returnedMetrics.invalidCommandSequence],
    ['regionOutsideBounds', sourceMetrics.regionOutsideBounds, finalMetrics.regionOutsideBounds, returnedMetrics.regionOutsideBounds],
  ];
  for (const [k, s, f, r] of blockingRows) {
    md.push(`| ${k} | ${fmt(s)} | ${fmt(f)} | ${fmt(r)} | ${r === 0 ? '✅' : '❌'} |`);
  }
  md.push('');

  // 3. Fase repairVisibleDiagonalStitches
  md.push('## 3. Fase repairVisibleDiagonalStitches\n');
  const repairPhase = phaseLog.find(p => p.name === 'repairVisibleDiagonalStitches');
  const sr = repairPhase?.stepReport || {};
  md.push(`- detected: **${sr.visibleDiagonalStitchesDetected ?? '—'}**`);
  md.push(`- removed: **${sr.visibleDiagonalStitchesRemoved ?? '—'}**`);
  md.push(`- convertedToJump: **${sr.convertedDiagonalToJump ?? '—'}**`);
  md.push(`- preservedAsValidFill (skippedBecauseValidFill): **${sr.skippedBecauseValidFill ?? '—'}**`);
  md.push(`- skippedBecauseNoSafeRepair: **${sr.skippedBecauseNoSafeRepair ?? 0}**`);
  md.push(`- acceptedDespiteScoreDrop: **${repairPhase?.acceptedDespiteScoreDrop ? 'SÍ' : 'NO'}**`);
  if (repairPhase) {
    md.push(`- reason: ${repairPhase.reason || (repairPhase.accepted ? 'diagonales reducidas, CE01 no INVALID' : '—')}`);
    md.push(`- ce01Score: ${repairPhase.before.ce01Score} → ${repairPhase.after.ce01Score}`);
  }
  md.push('');

  // 4. Fase removeEmptyBlocks
  md.push('## 4. Fase removeEmptyBlocks\n');
  const emptyPhases = phaseLog.filter(p => p.name === 'removeEmptyBlocks' || p.name === 'removeEmptyBlocksFinal');
  let totalEmptyRemoved = 0;
  for (const p of emptyPhases) {
    const s = p.stepReport || {};
    totalEmptyRemoved += s.emptyBlocksRemoved || 0;
    md.push(`### ${p.name} — ${p.accepted ? '✅ Aceptada' : '⛔ Revertida'}`);
    md.push(`- emptyBlocksRemoved: **${s.emptyBlocksRemoved ?? 0}**`);
    md.push(`- colorChangesRemoved: ${s.colorChangesRemoved ?? 0}`);
    md.push(`- trailingJumpsTrimsRemoved: ${s.trailingJumpsTrimsRemoved ?? 0}`);
    if (s.commandIndexesRemoved) md.push(`- commandIndexesRemoved: ${s.commandIndexesRemoved.join(', ')}`);
    if (s.unremovableBlocks && s.unremovableBlocks.length) {
      md.push(`- unremovableBlocks (${s.unremovableBlocks.length}):`);
      for (const u of s.unremovableBlocks) {
        md.push(`  - cmdIdx=${u.commandIndex} color=${u.color} prev=${u.previousCommand} next=${u.nextCommand} reason=${u.reason} whyNotRemoved=${u.whyNotRemoved}`);
      }
    }
    md.push(`- remainingEmptyBlocks: ${p.after.emptyBlocks}`);
    md.push('');
  }
  md.push(`- totalEmptyBlocksRemoved (todas las pasadas): **${totalEmptyRemoved}**`);
  md.push(`- remainingEmptyBlocks (returned): **${returnedMetrics.emptyBlocks}**\n`);

  // 5. Métricas
  md.push('## 5. Métricas (source / repaired / returned)\n');
  md.push('| Métrica | source | repaired | returned | OK |');
  md.push('|---|---|---|---|---|');
  const rows = [
    ['stitchCount', sourceMetrics.stitchCount, finalMetrics.stitchCount, returnedMetrics.stitchCount, true],
    ['jumpCount', sourceMetrics.jumpCount, finalMetrics.jumpCount, returnedMetrics.jumpCount, true],
    ['trimCount', sourceMetrics.trimCount, finalMetrics.trimCount, returnedMetrics.trimCount, true],
    ['shortStitches', sourceMetrics.shortStitches, finalMetrics.shortStitches, returnedMetrics.shortStitches, returnedMetrics.shortStitches <= sourceMetrics.shortStitches + 50],
    ['duplicateStitches', sourceMetrics.duplicateStitches, finalMetrics.duplicateStitches, returnedMetrics.duplicateStitches, returnedMetrics.duplicateStitches <= sourceMetrics.duplicateStitches + 20],
    ['missingTieIn', sourceMetrics.missingTieIn, finalMetrics.missingTieIn, returnedMetrics.missingTieIn, returnedMetrics.missingTieIn <= sourceMetrics.missingTieIn],
    ['missingTieOff', sourceMetrics.missingTieOff, finalMetrics.missingTieOff, returnedMetrics.missingTieOff, returnedMetrics.missingTieOff <= sourceMetrics.missingTieOff],
    ['visibleDiagonalStitches', sourceMetrics.visibleDiagonalStitches, finalMetrics.visibleDiagonalStitches, returnedMetrics.visibleDiagonalStitches, returnedMetrics.visibleDiagonalStitches === 0 || returnedMetrics.visibleDiagonalStitches < sourceMetrics.visibleDiagonalStitches],
    ['emptyBlocks', sourceMetrics.emptyBlocks, finalMetrics.emptyBlocks, returnedMetrics.emptyBlocks, returnedMetrics.emptyBlocks === 0],
    ['invalidCommandSequence', sourceMetrics.invalidCommandSequence, finalMetrics.invalidCommandSequence, returnedMetrics.invalidCommandSequence, returnedMetrics.invalidCommandSequence === 0],
    ['regionOutsideBounds', sourceMetrics.regionOutsideBounds, finalMetrics.regionOutsideBounds, returnedMetrics.regionOutsideBounds, returnedMetrics.regionOutsideBounds === 0],
    ['colorCount', sourceMetrics.colorCount, finalMetrics.colorCount, returnedMetrics.colorCount, true],
    ['ce01Score', sourceMetrics.ce01Score, finalMetrics.ce01Score, returnedMetrics.ce01Score, returnedMetrics.ce01Score >= sourceMetrics.ce01Score - 0.5 || (repairAccepted && returnedMetrics.ce01Status !== 'INVALID')],
    ['ce01Status', sourceMetrics.ce01Status, finalMetrics.ce01Status, returnedMetrics.ce01Status, returnedMetrics.ce01Status !== 'INVALID'],
    ['exportAllowed', sourceMetrics.exportAllowed, finalMetrics.exportAllowed, exportAllowed, exportAllowed],
  ];
  for (const [k, s, f, r, ok] of rows) {
    md.push(`| ${k} | ${fmt(s)} | ${fmt(f)} | ${fmt(r)} | ${ok ? '✅' : '❌'} |`);
  }
  md.push('');

  // 6. Fases transaccionales
  md.push('## 6. Fases (transaccional)\n');
  md.push('| Fase | blockingFix | Resultado | Antes | Después | Motivo |');
  md.push('|---|---|---|---|---|---|');
  for (const p of phaseLog) {
    const status = p.accepted ? '✅ Aceptada' : '⛔ Revertida';
    const target = phaseTarget(p.name);
    let antes = '—', despues = '—';
    if (target) {
      antes = target === 'missingTie' ? (p.before.missingTieIn + p.before.missingTieOff) : p.before[target];
      despues = target === 'missingTie' ? (p.after.missingTieIn + p.after.missingTieOff) : p.after[target];
    }
    const bf = p.blockingFixPriority ? '✓' : '';
    const motivo = p.reason || (p.accepted ? 'mejora/mantuvo' : '—');
    md.push(`| ${p.name} | ${bf} | ${status} | ${fmt(antes)} | ${fmt(despues)} | ${motivo} |`);
  }
  md.push('');

  // 7. Criterios de éxito
  md.push('## 7. Criterios de éxito\n');
  const crit = [
    ['visibleDiagonalStitches 53→0 o reducción clara', returnedMetrics.visibleDiagonalStitches < sourceMetrics.visibleDiagonalStitches || returnedMetrics.visibleDiagonalStitches === 0],
    ['emptyBlocks 1→0', returnedMetrics.emptyBlocks === 0],
    ['commandSourceUsedForExport = repaired', exportDecisionSource === 'repaired'],
    ['exportAllowed = true si CE01 queda RISKY', exportAllowed && returnedMetrics.ce01Status !== 'INVALID'],
    ['CE01 no INVALID', returnedMetrics.ce01Status !== 'INVALID'],
    ['DST/DSB usan repairedCommands', exportDecisionSource === 'repaired'],
    ['shortStitches sin regresión grave', returnedMetrics.shortStitches <= sourceMetrics.shortStitches + 50],
    ['duplicateStitches sin regresión grave', returnedMetrics.duplicateStitches <= sourceMetrics.duplicateStitches + 20],
  ];
  for (const [k, ok] of crit) md.push(`- ${ok ? '✅' : '❌'} ${k}`);
  md.push('');

  // 8. Errores bloqueantes restantes
  md.push('## 8. Errores bloqueantes restantes (sobre commandSourceUsedForExport)\n');
  if (!remainingBlockingIssues || remainingBlockingIssues.length === 0) {
    md.push('- Ninguno.\n');
  } else {
    for (const e of remainingBlockingIssues) md.push(`- **${e.type}** ×${e.count}: ${e.proposedAction}`);
    md.push('');
  }

  // 9. Forensics de diagonales visibles
  md.push('## 9. Visible diagonal forensics (detector único)\n');
  const vd = visibleDiagDetection || { count: 0, offenders: [], preservedTatamiDiagonal: 0, preservedContourWithMask: 0 };
  md.push(`- detected (sobre comandos devueltos): **${vd.count}**`);
  md.push(`- preservedTatamiDiagonal: ${vd.preservedTatamiDiagonal || 0}`);
  md.push(`- preservedContourWithMask: ${vd.preservedContourWithMask || 0}\n`);
  if (vd.offenders && vd.offenders.length) {
    md.push('### Primeros 20 offenders\n');
    md.push('| # | cmdIdx | lenMm | angle° | color | stitchType | region | reason | action |');
    md.push('|---|---|---|---|---|---|---|---|---|');
    vd.offenders.slice(0, 20).forEach((o, k) => {
      md.push(`| ${k + 1} | ${o.commandIndex} | ${o.lengthMm.toFixed(2)} | ${o.angleDeg.toFixed(0)} | ${o.color || '—'} | ${o.stitchType || '—'} | ${o.regionName || '—'} | ${o.reason} | ${o.recommendedAction} |`);
    });
    md.push('');
  }

  // 10. Detalle por fase
  md.push('## 10. Detalle por fase\n');
  for (const p of phaseLog) {
    md.push(`### ${p.name} — ${p.accepted ? '✅ Aceptada' : '⛔ Revertida'}${p.acceptedDespiteScoreDrop ? ' (aceptada a pesar de bajar ce01Score)' : ''}`);
    if (p.reason) md.push(`- Motivo: ${p.reason}`);
    const s = p.stepReport || {};
    const keys = Object.keys(s).filter(k => !k.startsWith('_'));
    if (keys.length) {
      md.push('- Contadores:');
      for (const k of keys) md.push(`  - ${k} = ${s[k]}`);
    }
    md.push(`- Antes: emptyBlocks=${p.before.emptyBlocks} visibleDiag=${p.before.visibleDiagonalStitches} shortSt=${p.before.shortStitches} dups=${p.before.duplicateStitches} tieIn=${p.before.missingTieIn} tieOff=${p.before.missingTieOff} stitches=${p.before.stitchCount} ce01=${p.before.ce01Score} (${p.before.ce01Status})`);
    md.push(`- Después: emptyBlocks=${p.after.emptyBlocks} visibleDiag=${p.after.visibleDiagonalStitches} shortSt=${p.after.shortStitches} dups=${p.after.duplicateStitches} tieIn=${p.after.missingTieIn} tieOff=${p.after.missingTieOff} stitches=${p.after.stitchCount} ce01=${p.after.ce01Score} (${p.after.ce01Status})`);
    md.push('');
  }

  md.push('---');
  md.push('_Pre-export repair v4 — prioridad de bloqueos sobre ce01Score. RISKY permite export, INVALID bloquea. Repara comandos reales o revierte. No mezcla métricas._');

  return md.join('\n');
}

function phaseTarget(name) {
  const m = {
    removeEmptyBlocks: 'emptyBlocks',
    removeEmptyBlocksFinal: 'emptyBlocks',
    repairVisibleDiagonalStitches: 'visibleDiagonalStitches',
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