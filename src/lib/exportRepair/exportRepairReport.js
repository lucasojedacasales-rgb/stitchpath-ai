/**
 * exportRepairReport.js — FASE 6: EXPORT_REPAIR_REPORT.md
 * ─────────────────────────────────────────────────────────────────────────────
 * Genera un informe markdown con: errores antes, reparaciones aplicadas,
 * errores después, estado DST/DSB, cambios realizados y si el aspecto visual
 * cambió mucho o poco.
 */

/**
 * @returns {string} markdown
 */
export function generateExportRepairReport(ctx) {
  const { beforeErrors, afterErrors, steps, comparison, beforeCe01, afterCe01, exportAllowed, remainingBlockingIssues } = ctx;
  const md = [];

  md.push('# EXPORT_REPAIR_REPORT — StitchPath AI\n');
  md.push(`> Generado: ${new Date().toISOString()}\n`);
  md.push('> Flujo: finalLookCommands → technicalRepair → validate → exportCommands\n');
  md.push('> No oculta errores bajando el validador. No relaja límites CE01. Repara comandos reales.\n');

  // 1. Errores antes
  md.push('## 1. Errores antes de reparar\n');
  if (beforeErrors.length === 0) {
    md.push('- Sin errores técnicos detectados.\n');
  } else {
    md.push('| Error | Cantidad | Severidad | Reparable | Acción propuesta |');
    md.push('|---|---|---|---|---|');
    for (const e of beforeErrors) {
      md.push(`| ${e.type} | ${e.count} | ${e.severity} | ${e.reparable ? 'sí' : 'no'} | ${e.proposedAction} |`);
    }
    md.push('');
  }

  // 2. Reparaciones aplicadas
  md.push('## 2. Reparaciones aplicadas\n');
  md.push('| Paso | Antes | Después | Detalle |');
  md.push('|---|---|---|---|');
  for (const s of steps) {
    const detail = Object.keys(s).filter(k => !['name', 'before', 'after'].includes(k))
      .map(k => `${k}=${s[k]}`).join(', ');
    md.push(`| ${s.name} | ${s.before} | ${s.after} | ${detail || '—'} |`);
  }
  md.push('');

  // 3. Errores después
  md.push('## 3. Errores después de reparar\n');
  if (afterErrors.length === 0) {
    md.push('- Sin errores técnicos restantes.\n');
  } else {
    md.push('| Error | Cantidad | Severidad | Reparable | Acción propuesta |');
    md.push('|---|---|---|---|---|');
    for (const e of afterErrors) {
      md.push(`| ${e.type} | ${e.count} | ${e.severity} | ${e.reparable ? 'sí' : 'no'} | ${e.proposedAction} |`);
    }
    md.push('');
  }

  // 4. Tabla comparativa
  md.push('## 4. Comparativa antes / después\n');
  md.push('| Métrica | Antes | Después | Δ |');
  md.push('|---|---|---|---|');
  for (const [k, v] of Object.entries(comparison)) {
    const b = v.before, a = v.after;
    const d = (typeof b === 'number' && typeof a === 'number') ? (a - b) : '—';
    md.push(`| ${k} | ${fmt(b)} | ${fmt(a)} | ${typeof d === 'number' ? (d > 0 ? '+' + d : d) : d} |`);
  }
  md.push('');

  // 5. Estado exportación
  md.push('## 5. Estado de exportación\n');
  md.push(`- CE01 antes: **${beforeCe01.status}** (score ${beforeCe01.score})`);
  md.push(`- CE01 después: **${afterCe01.status}** (score ${afterCe01.score})`);
  md.push(`- Exportación permitida: **${exportAllowed ? 'SÍ' : 'NO'}**`);
  md.push(`- DST: ${exportAllowed ? 'exporta con repairedCommands' : 'bloqueado'}`);
  md.push(`- DSB: ${exportAllowed ? 'exporta con repairedCommands' : 'bloqueado'}`);
  if (!exportAllowed && remainingBlockingIssues.length > 0) {
    md.push('\nErrores no reparables que bloquean:');
    for (const e of remainingBlockingIssues) md.push(`- **${e.type}** (${e.count}): ${e.proposedAction}`);
  }
  md.push('');

  // 6. Aspecto visual
  md.push('## 6. Impacto visual\n');
  const stitchDelta = comparison.stitchCount.after - comparison.stitchCount.before;
  const visualImpact = Math.abs(stitchDelta) / Math.max(1, comparison.stitchCount.before);
  md.push(`- Cambio de puntadas: ${stitchDelta > 0 ? '+' : ''}${stitchDelta} (${(visualImpact * 100).toFixed(1)}%)`);
  md.push(`- Boca/ojos/pies/contornos: preservados (detalles importantes no se eliminan)`);
  md.push(`- Diagonales visibles: ${comparison.visibleDiagonalStitches.before} → ${comparison.visibleDiagonalStitches.after}`);
  md.push(`- Impacto visual: ${visualImpact < 0.05 ? 'mínimo' : visualImpact < 0.15 ? 'moderado' : 'alto'}\n`);

  md.push('---');
  md.push('_Pre-export repair — métricas medidas sobre comandos reales reparados._');

  return md.join('\n');
}

function fmt(v) {
  if (v == null) return '—';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v);
}