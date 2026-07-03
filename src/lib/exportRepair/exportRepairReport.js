/**
 * exportRepairReport.js — EXPORT_REPAIR_REPORT_V2.md
 * ─────────────────────────────────────────────────────────────────────────────
 * Informe transaccional: tabla por fase (Aceptada/Revertida | Antes | Después |
 * Mejora | Motivo) + resumen global de métricas críticas antes/después.
 * No oculta errores. No baja límites. Repara comandos reales o revierte.
 */

export function generateExportRepairReport(ctx) {
  const { phaseLog, sourceMetrics, finalMetrics, comparison, repairAccepted, repairRejected, exportAllowed, remainingBlockingIssues } = ctx;
  const md = [];

  md.push('# EXPORT_REPAIR_REPORT_V2 — StitchPath AI\n');
  md.push(`> Generado: ${new Date().toISOString()}\n`);
  md.push('> Flujo: finalLookCommands → technicalRepair (transaccional) → validate → exportCommands\n');
  md.push('> Cada fase mide antes/después. Si empeora métricas críticas, se revierte. Si el global no supera criterios, REPAIR_REJECTED.\n');

  // 0. Veredicto global
  md.push('## 0. Veredicto global\n');
  md.push(`- repairAccepted: **${repairAccepted ? 'SÍ' : 'NO'}**`);
  md.push(`- repairRejected: **${repairRejected ? 'SÍ (REPAIR_REJECTED)' : 'NO'}**`);
  md.push(`- exportAllowed: **${exportAllowed ? 'SÍ' : 'NO'}**`);
  md.push(`- Comandos devueltos: **${repairAccepted ? 'repairedCommands' : 'source (revertido)'}**\n`);

  // 1. Tabla por fase
  md.push('## 1. Fases (transaccional)\n');
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

  // 2. Resumen métricas críticas
  md.push('## 2. Resumen métricas críticas (antes / después)\n');
  md.push('| Métrica | Antes | Después | Δ | OK |');
  md.push('|---|---|---|---|---|');
  const rows = [
    ['emptyBlocks', sourceMetrics.emptyBlocks, finalMetrics.emptyBlocks, 'lower', finalMetrics.emptyBlocks === 0],
    ['visibleDiagonalStitches', sourceMetrics.visibleDiagonalStitches, finalMetrics.visibleDiagonalStitches, 'lower', finalMetrics.visibleDiagonalStitches < sourceMetrics.visibleDiagonalStitches || finalMetrics.visibleDiagonalStitches === 0],
    ['duplicateStitches', sourceMetrics.duplicateStitches, finalMetrics.duplicateStitches, 'lower', finalMetrics.duplicateStitches < sourceMetrics.duplicateStitches],
    ['shortStitches', sourceMetrics.shortStitches, finalMetrics.shortStitches, 'lower', finalMetrics.shortStitches <= sourceMetrics.shortStitches],
    ['unsupportedLongStitches', sourceMetrics.unsupportedLongStitches, finalMetrics.unsupportedLongStitches, 'lower', finalMetrics.unsupportedLongStitches <= sourceMetrics.unsupportedLongStitches],
    ['missingTieIn', sourceMetrics.missingTieIn, finalMetrics.missingTieIn, 'lower', finalMetrics.missingTieIn < sourceMetrics.missingTieIn],
    ['missingTieOff', sourceMetrics.missingTieOff, finalMetrics.missingTieOff, 'lower', finalMetrics.missingTieOff < sourceMetrics.missingTieOff],
    ['stitchCount', sourceMetrics.stitchCount, finalMetrics.stitchCount, 'info', true],
    ['jumpCount', sourceMetrics.jumpCount, finalMetrics.jumpCount, 'info', true],
    ['trimCount', sourceMetrics.trimCount, finalMetrics.trimCount, 'info', true],
    ['colorCount', sourceMetrics.colorCount, finalMetrics.colorCount, 'info', true],
    ['stitchCountOverLimit', sourceMetrics.stitchCountOverLimit, finalMetrics.stitchCountOverLimit, 'lower', finalMetrics.stitchCountOverLimit <= sourceMetrics.stitchCountOverLimit],
    ['ce01Score', sourceMetrics.ce01Score, finalMetrics.ce01Score, 'higher', finalMetrics.ce01Score >= sourceMetrics.ce01Score - 0.5],
    ['ce01Status', sourceMetrics.ce01Status, finalMetrics.ce01Status, 'str', true],
    ['exportAllowed', sourceMetrics.exportAllowed, exportAllowed, 'higher', exportAllowed],
  ];
  for (const [k, b, a, dir, ok] of rows) {
    const d = (typeof b === 'number' && typeof a === 'number') ? (a - b) : '—';
    const dStr = typeof d === 'number' ? (d > 0 ? `+${d}` : `${d}`) : d;
    md.push(`| ${k} | ${fmt(b)} | ${fmt(a)} | ${dStr} | ${ok ? '✅' : '❌'} |`);
  }
  md.push('');

  // 3. Criterios de éxito
  md.push('## 3. Criterios de éxito\n');
  const crit = [
    ['emptyBlocks 1→0', finalMetrics.emptyBlocks === 0],
    ['visibleDiagonalStitches baja o 0', finalMetrics.visibleDiagonalStitches < sourceMetrics.visibleDiagonalStitches || finalMetrics.visibleDiagonalStitches === 0],
    ['duplicateStitches baja', finalMetrics.duplicateStitches < sourceMetrics.duplicateStitches],
    ['shortStitches no sube', finalMetrics.shortStitches <= sourceMetrics.shortStitches],
    ['addTieInTieOff no empeora shortStitches', finalMetrics.shortStitches <= sourceMetrics.shortStitches],
    ['exportAllowed no pasa true→false', !(sourceMetrics.exportAllowed && !exportAllowed)],
    ['CE01 score no empeora', finalMetrics.ce01Score >= sourceMetrics.ce01Score - 0.5],
  ];
  for (const [k, ok] of crit) md.push(`- ${ok ? '✅' : '❌'} ${k}`);
  md.push('');

  // 4. Errores bloqueantes restantes
  md.push('## 4. Errores bloqueantes restantes\n');
  if (!remainingBlockingIssues || remainingBlockingIssues.length === 0) {
    md.push('- Ninguno.\n');
  } else {
    for (const e of remainingBlockingIssues) md.push(`- **${e.type}** ×${e.count}: ${e.proposedAction}`);
    md.push('');
  }

  // 5. Detalle por fase
  md.push('## 5. Detalle por fase\n');
  for (const p of phaseLog) {
    md.push(`### ${p.name} — ${p.accepted ? '✅ Aceptada' : '⛔ Revertida'}`);
    if (p.reason) md.push(`- Motivo: ${p.reason}`);
    const sr = p.stepReport || {};
    const keys = Object.keys(sr);
    if (keys.length) {
      md.push('- Contadores:');
      for (const k of keys) md.push(`  - ${k} = ${sr[k]}`);
    }
    md.push(`- Antes: emptyBlocks=${p.before.emptyBlocks} visibleDiag=${p.before.visibleDiagonalStitches} shortSt=${p.before.shortStitches} dups=${p.before.duplicateStitches} longSt=${p.before.unsupportedLongStitches} tieIn=${p.before.missingTieIn} tieOff=${p.before.missingTieOff} stitches=${p.before.stitchCount} ce01=${p.before.ce01Score}`);
    md.push(`- Después: emptyBlocks=${p.after.emptyBlocks} visibleDiag=${p.after.visibleDiagonalStitches} shortSt=${p.after.shortStitches} dups=${p.after.duplicateStitches} longSt=${p.after.unsupportedLongStitches} tieIn=${p.after.missingTieIn} tieOff=${p.after.missingTieOff} stitches=${p.after.stitchCount} ce01=${p.after.ce01Score}`);
    md.push('');
  }

  md.push('---');
  md.push('_Pre-export repair v2 — transaccional. Repara comandos reales o revierte. No oculta errores._');

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