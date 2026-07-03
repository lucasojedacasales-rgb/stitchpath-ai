/**
 * referenceLearningValidatedReport.js — Reference Learning Engine v2
 * ─────────────────────────────────────────────────────────────────────────────
 * Genera REFERENCE_LEARNING_VALIDATED_REPORT.md: validación REAL del preset
 * aprendido. Regenera finalCommands antes/después, mide métricas reales y emite
 * un veredicto (IMPROVED / NO_CHANGE / WORSENED) + flags.
 *
 * No inventa métricas: todas se calculan sobre los comandos regenerados.
 */

/**
 * @param {object} ctx
 * @returns {string} markdown
 */
export function generateReferenceLearningValidatedReport(ctx) {
  const {
    designName, selection, basePreset, finalPreset, cartoon,
    before, after, verdict, notEffective, corpusCeiling, integrity,
    learnedRules,
  } = ctx;
  const md = [];

  md.push('# REFERENCE_LEARNING_VALIDATED_REPORT — StitchPath AI\n');
  md.push(`> Generado: ${new Date().toISOString()}\n`);
  md.push('> Modo: validación real del preset aprendido (regenera finalCommands + Quality Gate).\n');
  md.push('> No inventa métricas. No oculta diagonales. No cambia solo el score.\n');

  // 1. Perfil aplicado
  md.push('## 1. Perfil aplicado\n');
  if (selection?.selectedProfile) {
    const p = selection.selectedProfile;
    md.push(`- **Perfil: ${p.label}** (\`${p.name}\`)`);
    md.push(`- Confianza: ${((selection.confidence || 0) * 100).toFixed(0)}%`);
    md.push(`- Razón: ${selection.reason}`);
  }
  if (cartoon?.applies) {
    md.push(`- **Override aplicado: \`CARTOON_OUTLINE_PROFESSIONAL_OVERRIDE\`**`);
    for (const r of cartoon.reasons) md.push(`  - ${r}`);
    md.push(`- Override del preset:`);
    md.push(`  - contourAfterFill: ${basePreset.contourAfterFill} → **${finalPreset.contourAfterFill}**`);
    md.push(`  - useSatinForOuterContours: ${basePreset.useSatinForOuterContours} → **${finalPreset.useSatinForOuterContours}**`);
    md.push(`  - detailsLast: ${basePreset.detailsLast} → **${finalPreset.detailsLast}**`);
  } else {
    md.push(`- Override: no aplica (${cartoon?.reasons?.join('; ') || 'perfil no cartoon'})`);
    md.push(`- Preset sin override: contourAfterFill=${finalPreset.contourAfterFill}, useSatinForOuterContours=${finalPreset.useSatinForOuterContours}, detailsLast=${finalPreset.detailsLast}`);
  }
  md.push('');

  // 2. Métricas ANTES / DESPUÉS
  md.push('## 2. Métricas ANTES / DESPUÉS\n');
  md.push('| Métrica | ANTES | DESPUÉS | Δ | Mejor? |');
  md.push('|---|---|---|---|---|');
  const rows = [
    ['stitchCount', before.stitchCount, after.stitchCount, 'lower'],
    ['jumpCount', before.jumpCount, after.jumpCount, 'lower'],
    ['trimCount', before.trimCount, after.trimCount, 'lower'],
    ['colorCount', before.colorCount, after.colorCount, 'lower'],
    ['visibleDiagonalStitches', before.visibleDiagonalStitches, after.visibleDiagonalStitches, 'lower'],
    ['maxVisibleStitchMm', before.maxVisibleStitchMm, after.maxVisibleStitchMm, 'lower'],
    ['unsupportedTravelStitches', before.unsupportedTravelStitches, after.unsupportedTravelStitches, 'lower'],
    ['unsupportedLongStitches', before.unsupportedLongStitches, after.unsupportedLongStitches, 'lower'],
    ['shortStitchCount', before.shortStitchCount, after.shortStitchCount, 'lower'],
    ['duplicateStitches', before.duplicateStitches, after.duplicateStitches, 'lower'],
    ['satinContourCount', before.satinContourCount, after.satinContourCount, 'higher'],
    ['runningContourCount', before.runningContourCount, after.runningContourCount, 'higher'],
    ['fillBlockCount', before.fillBlockCount, after.fillBlockCount, 'higher'],
    ['underlayCount', before.underlayCount, after.underlayCount, 'higher'],
    ['professionalScore', before.professionalScore, after.professionalScore, 'higher'],
  ];
  for (const [k, b, a, dir] of rows) {
    const delta = (typeof b === 'number' && typeof a === 'number') ? a - b : 0;
    const better = dir === 'lower' ? delta < 0 : delta > 0;
    const worse = dir === 'lower' ? delta > 0 : delta < 0;
    const mark = better ? '✅' : worse ? '❌' : '—';
    md.push(`| ${k} | ${fmt(b)} | ${fmt(a)} | ${fmt(delta)} | ${mark} |`);
  }
  md.push('');
  md.push('| finalLookExportMismatch | ' + String(before.finalLookExportMismatch) + ' | ' + String(after.finalLookExportMismatch) + ' | — | ' + (after.finalLookExportMismatch ? '❌' : '✅') + ' |');
  md.push('| ce01Status | ' + before.ce01Status + ' | ' + after.ce01Status + ' | — | ' + (after.ce01Status === 'SAFE' ? '✅' : after.ce01Status === 'RISKY' ? '⚠️' : '❌') + ' |');
  md.push('');

  // 3. Validación específica J003
  md.push('## 3. Validación específica — J003_max_visible_stitch\n');
  const j003 = (learnedRules || []).find((r) => r.ruleId === 'J003_max_visible_stitch');
  md.push(`- Valor corpus (ceiling): **${corpusCeiling.toFixed(2)}mm**`);
  md.push(`- ANTES maxVisibleStitchMm: **${before.maxVisibleStitchMm.toFixed(2)}mm**`);
  md.push(`- DESPUÉS maxVisibleStitchMm: **${after.maxVisibleStitchMm.toFixed(2)}mm**`);
  const meetsJ003 = after.maxVisibleStitchMm <= corpusCeiling + 0.5;
  if (meetsJ003) {
    md.push(`- ✅ Cumple: maxVisibleStitchMm ≤ ${corpusCeiling.toFixed(2)}mm (+0.5 tolerancia)`);
  } else {
    md.push(`- ❌ NO cumple: ${after.maxVisibleStitchMm.toFixed(2)}mm > ${corpusCeiling.toFixed(2)}mm`);
    md.push(`  - Justificación requerida: el preset fijó maxVisibleStitchMm=${finalPreset.maxVisibleStitchMm}mm pero el motor aún genera stitches visibles más largos. Ver sección 6.`);
  }
  md.push(`- visibleDiagonalStitches: ${before.visibleDiagonalStitches} → ${after.visibleDiagonalStitches}`);
  md.push('');

  // 4. Veredicto
  md.push('## 4. Veredicto\n');
  const vcolor = verdict.verdict === 'IMPROVED' ? '✅' : verdict.verdict === 'WORSENED' ? '❌' : '⚠️';
  md.push(`### ${vcolor} ${verdict.verdict} (net=${verdict.net})\n`);
  if (verdict.changes?.length) {
    md.push('Cambios por métrica:');
    for (const ch of verdict.changes) md.push(`- ${ch}`);
    md.push('');
  }
  if (notEffective) {
    md.push('> ⚠️ **LEARNED_PRESET_NOT_EFFECTIVE**');
    md.push('> El preset NO redujo maxVisibleStitchMm al rango del corpus NI redujo diagonales visibles.');
    md.push('> Ver sección 6 para identificar qué función no está usando el preset aprendido.\n');
  } else {
    md.push('> ✅ El preset afectó al menos una métrica clave (diagonales o maxVisibleStitchMm).\n');
  }

  // 5. Integridad
  md.push('## 5. Integridad del diseño después del preset\n');
  md.push(`- finalLookExportMismatch: **${String(integrity.finalLookExportMismatch)}** ${integrity.finalLookExportMismatch ? '❌ Final Look ≠ Export' : '✅'}`);
  md.push(`- contourMissingOnOneFoot: **${String(integrity.contourMissingOnOneFoot)}** ${integrity.contourMissingOnOneFoot ? '❌ falta contorno en un pie' : '✅'}`);
  md.push(`- fillAfterContour: **${String(integrity.fillAfterContour)}** ${integrity.fillAfterContour ? '⚠️ relleno cosido después del contorno (orden incorrecto)' : '✅'}`);
  md.push(`- ce01Status: **${integrity.ce01Status}**`);
  md.push('- Boca, ojos, pies, contorno exterior: presentes si satinContourCount + runningContourCount > 0 y contourMissingOnOneFoot=false.');
  md.push('');

  // 6. Si no mejora — diagnóstico de funciones
  if (notEffective || verdict.verdict !== 'IMPROVED') {
    md.push('## 6. Diagnóstico — ¿qué función NO usa el preset aprendido?\n');
    md.push('El preset se mapea a `config.learned*` keys. Las funciones que DEBEN consumirlas:');
    md.push('- `buildFinalCommands` (exportPipeline) → genera comandos base.');
    md.push('- `applyProfessionalPipeline` (professionalDigitizingMode) → consume:');
    md.push('  - `learnedMaxVisibleStitchMm` → `maxVisibleStitchMm` (clasificador de diagonales).');
    md.push('  - `learnedConvertTravelAboveMmToJump` → `longConnectorMm` (travel → jump).');
    md.push('  - `learnedTrimBeforeTravelMm` → trim antes de saltos largos.');
    md.push('  - `learnedContourAfterFill` → `reorderProfessionalLayers` (orden capas).');
    md.push('  - `learnedUseSatinForOuterContours` → conversión outer satin↔running.');
    md.push('  - `learnedDetailsLast` → `reorderProfessionalLayers` (detalles al final).');
    md.push('- `professionalEmbroideryQualityGate` → lee comandos REGENERADOS (no el config).');
    md.push('');
    if (after.maxVisibleStitchMm > finalPreset.maxVisibleStitchMm + 1.5) {
      md.push(`> El preset fija maxVisibleStitchMm=${finalPreset.maxVisibleStitchMm}mm pero el comando medido es ${after.maxVisibleStitchMm.toFixed(2)}mm.`);
      md.push('> Causa probable: existen stitches largos que el clasificador no marca como sospechosos (misma región, ángulo no diagonal, o con soporte de máscara). Revisar `classifyVisibleDiagonalStitch`.\n');
    }
    if (after.visibleDiagonalStitches >= before.visibleDiagonalStitches && before.visibleDiagonalStitches > 0) {
      md.push('> visibleDiagonalStitches no bajó. Causa probable: `repairVisibleDiagonalStitches` no detecta las diagonales del diseño actual (umbral o ángulo). Revisar `suspiciousDiagonalMinMm` / `diagonalAngleMin/Max`.\n');
    }
  }

  // 7. Preset final aplicado
  md.push('## 7. Preset final aplicado\n');
  md.push('| Parámetro | Preset base | Preset final (con override) |');
  md.push('|---|---|---|');
  const keys = ['fillRowSpacingMm','satinColumnSpacingMm','satinWidthMm','pullCompensationMm','fillAngleDeg','neighborAngleVariationDeg','maxVisibleStitchMm','trimBeforeTravelMm','convertTravelAboveMmToJump','underlayEnabled','contourAfterFill','detailsLast','maxColorCount','useSatinForOuterContours','reduceSimilarColors'];
  for (const k of keys) {
    md.push(`| ${k} | ${fmt(basePreset[k])} | ${fmt(finalPreset[k])} |`);
  }
  md.push('');

  md.push('---');
  md.push('_Reference Learning Engine v2 — validación real. Métricas medidas sobre finalCommands regenerados, no simuladas._');

  return md.join('\n');
}

function fmt(v) {
  if (v == null) return '—';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === 'boolean') return String(v);
  return String(v);
}