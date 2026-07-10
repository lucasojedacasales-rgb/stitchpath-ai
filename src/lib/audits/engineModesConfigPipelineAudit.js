const AUDIT_NAME = 'ENGINE_MODES_CONFIG_TO_PIPELINE_AUDIT_V1';

function stableStringify(value) {
  const seen = new WeakSet();
  return JSON.stringify(value, (key, current) => {
    if (current && typeof current === 'object') {
      if (seen.has(current)) return '[Circular]';
      seen.add(current);
      if (Array.isArray(current)) return current;
      return Object.keys(current).sort().reduce((acc, itemKey) => {
        acc[itemKey] = current[itemKey];
        return acc;
      }, {});
    }
    if (typeof current === 'function') return '[Function]';
    return current;
  });
}

function countBy(items = [], selector) {
  const counts = {};
  for (const item of items || []) {
    const key = selector(item) || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function countCommands(commands = [], type) {
  return (commands || []).filter((command) => command?.type === type).length;
}

function getConfigModeFlags(config = {}, machineSettings = {}) {
  return {
    digitizeMode: config.digitize_mode || config.mode || config.engineMode || null,
    vectorizeMode: config.vectorizeMode || config.vectorizationMode || null,
    ce01SafeFillMode: config.ce01SafeFillMode !== false,
    cartoonEmbroideryStructureMode: config.cartoonEmbroideryStructureMode === true,
    goldenMasterWilcomAlignment: config.goldenMasterWilcomAlignment === true,
    goldenMasterProfileId: config.goldenMasterProfileId || machineSettings.goldenMasterProfileId || null,
    learnedFillDensityMm: Number.isFinite(Number(config.learnedFillDensityMm)) ? Number(config.learnedFillDensityMm) : null,
    fillDensityMode: config.fillDensityMode || config.safeFillDensityMode || null,
    validationMode: config.validationMode || config.machineValidationMode || null,
    machineProfileId: config.machineProfileId || machineSettings.profileId || machineSettings.id || null,
  };
}

function summarizeCommands(commands = []) {
  const safeCommands = Array.isArray(commands) ? commands : [];
  return {
    totalCommands: safeCommands.length,
    stitches: countCommands(safeCommands, 'stitch'),
    jumps: countCommands(safeCommands, 'jump'),
    trims: countCommands(safeCommands, 'trim'),
    colorChanges: countCommands(safeCommands, 'colorChange'),
    endCommands: countCommands(safeCommands, 'end'),
    commandSources: countBy(safeCommands, (command) => command?.source),
    stitchTypes: countBy(safeCommands.filter((command) => command?.type === 'stitch'), (command) => command?.stitchType),
    layerTypes: countBy(safeCommands.filter((command) => command?.type === 'stitch'), (command) => command?.layerType),
    generatedBy: countBy(safeCommands, (command) => command?.generatedBy),
  };
}

function summarizeRegions(regions = []) {
  const safeRegions = Array.isArray(regions) ? regions : [];
  return {
    totalRegions: safeRegions.length,
    visibleRegions: safeRegions.filter((region) => region?.visible !== false).length,
    stitchTypes: countBy(safeRegions, (region) => region?.stitch_type),
    layerTypes: countBy(safeRegions, (region) => region?.layerType || region?.region_class),
    modeMarkers: {
      cartoonEmbroideryStructureMode: safeRegions.filter((region) => region?.cartoonEmbroideryStructureMode === true).length,
      blackOutlineFinalPass: safeRegions.filter((region) => region?.blackOutlineFinalPass === true).length,
      ce01SafeFillModeDisabled: safeRegions.filter((region) => region?.ce01SafeFillMode === false).length,
    },
  };
}

function summarizeObjects(finalObjects = []) {
  const safeObjects = Array.isArray(finalObjects) ? finalObjects : [];
  return {
    totalObjects: safeObjects.length,
    stitchTypes: countBy(safeObjects, (object) => object?.stitch_type || object?.stitchType),
    layerTypes: countBy(safeObjects, (object) => object?.layerType || object?.layerRole),
    modeMarkers: {
      ce01SafeFillModeEnabled: safeObjects.filter((object) => object?.ce01SafeFillMode === true).length,
      cartoonEmbroideryStructureMode: safeObjects.filter((object) => object?.cartoonEmbroideryStructureMode === true).length,
      cartoonDarkOutline: safeObjects.filter((object) => object?.cartoonDarkOutline === true).length,
      blackOutlineFinalPass: safeObjects.filter((object) => object?.blackOutlineFinalPass === true).length,
      goldenMasterTravelReduced: safeObjects.filter((object) => object?.goldenMasterTravelReduced === true).length,
    },
  };
}

function buildPipelineMapping(modeFlags, commandSummary, objectSummary, regionSummary) {
  return {
    ce01SafeFillMode: {
      configEnabled: modeFlags.ce01SafeFillMode,
      objectCountEnabled: objectSummary.modeMarkers.ce01SafeFillModeEnabled,
      commandSourceCe01SafeFill: commandSummary.commandSources.ce01_safe_fill || 0,
      commandSourceCe01Fallback: commandSummary.commandSources.ce01_zero_output_fallback_fill || 0,
    },
    cartoonEmbroideryStructureMode: {
      configEnabled: modeFlags.cartoonEmbroideryStructureMode,
      regionMarkers: regionSummary.modeMarkers.cartoonEmbroideryStructureMode,
      objectMarkers: objectSummary.modeMarkers.cartoonEmbroideryStructureMode,
      darkOutlineObjects: objectSummary.modeMarkers.cartoonDarkOutline,
    },
    goldenMasterWilcomAlignment: {
      configEnabled: modeFlags.goldenMasterWilcomAlignment,
      profileId: modeFlags.goldenMasterProfileId,
      generatedByGoldenMasterTravelReduction: commandSummary.generatedBy.GOLDEN_MASTER_TRAVEL_REDUCTION_V1 || 0,
    },
    densitySignals: {
      learnedFillDensityMm: modeFlags.learnedFillDensityMm,
      fillDensityMode: modeFlags.fillDensityMode,
      stitchTypeFillCount: commandSummary.stitchTypes.fill || 0,
      stitchTypeRunningCount: commandSummary.stitchTypes.running_stitch || 0,
    },
  };
}

function buildFindings(modeFlags, mapping) {
  const findings = [];
  if (modeFlags.ce01SafeFillMode && mapping.ce01SafeFillMode.commandSourceCe01SafeFill === 0 && mapping.ce01SafeFillMode.objectCountEnabled > 0) {
    findings.push('CE01 safe fill objects exist, but no ce01_safe_fill command source was observed in the provided command snapshot.');
  }
  if (!modeFlags.cartoonEmbroideryStructureMode && (mapping.cartoonEmbroideryStructureMode.regionMarkers > 0 || mapping.cartoonEmbroideryStructureMode.objectMarkers > 0)) {
    findings.push('Cartoon structure markers were present while cartoonEmbroideryStructureMode config is disabled in this snapshot.');
  }
  if (modeFlags.cartoonEmbroideryStructureMode && mapping.cartoonEmbroideryStructureMode.objectMarkers === 0 && mapping.cartoonEmbroideryStructureMode.regionMarkers === 0) {
    findings.push('cartoonEmbroideryStructureMode is enabled, but no cartoon structure markers were observed in the provided regions or objects.');
  }
  if (!modeFlags.goldenMasterWilcomAlignment && mapping.goldenMasterWilcomAlignment.generatedByGoldenMasterTravelReduction > 0) {
    findings.push('Golden Master travel-reduction commands were observed while goldenMasterWilcomAlignment config is disabled in this snapshot.');
  }
  return findings;
}

export function runEngineModesConfigPipelineAudit({
  finalCommands = [],
  finalObjects = [],
  regions = [],
  config = {},
  machineSettings = {},
  commandSourceLabel = 'finalEmbroideryCommands',
} = {}) {
  const commandFingerprintBefore = stableStringify(finalCommands);
  const regionFingerprintBefore = stableStringify(regions);
  const modeFlags = getConfigModeFlags(config, machineSettings);
  const commandSummary = summarizeCommands(finalCommands);
  const regionSummary = summarizeRegions(regions);
  const objectSummary = summarizeObjects(finalObjects);
  const pipelineMapping = buildPipelineMapping(modeFlags, commandSummary, objectSummary, regionSummary);
  const findings = buildFindings(modeFlags, pipelineMapping);
  const commandFingerprintAfter = stableStringify(finalCommands);
  const regionFingerprintAfter = stableStringify(regions);

  return {
    auditName: AUDIT_NAME,
    generatedAt: new Date().toISOString(),
    auditOnly: true,
    commandsModified: commandFingerprintBefore !== commandFingerprintAfter,
    regionsModified: regionFingerprintBefore !== regionFingerprintAfter,
    commandSourceLabel,
    modeFlags,
    commandSummary,
    regionSummary,
    objectSummary,
    pipelineMapping,
    findings,
    conclusion: findings.length === 0
      ? 'No config-to-pipeline inconsistencies were detected in this read-only snapshot.'
      : 'Review the findings above before changing generation behavior.',
  };
}

function pushObject(lines, object, prefix = '') {
  for (const [key, value] of Object.entries(object || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      lines.push(`${prefix}- ${key}:`);
      pushObject(lines, value, `${prefix}  `);
    } else {
      lines.push(`${prefix}- ${key}: ${Array.isArray(value) ? JSON.stringify(value) : value}`);
    }
  }
}

export function buildEngineModesConfigPipelineAuditMarkdown(audit) {
  const lines = [];
  lines.push(`# ${AUDIT_NAME}`);
  lines.push('');
  lines.push(`Fecha: ${audit.generatedAt}`);
  lines.push('Tipo: audit-only config-to-pipeline snapshot.');
  lines.push('Restricción: no modifica comandos, regiones, densidad, vectorización, optimización de travel ni exportación.');
  lines.push('');
  lines.push('## 1. Confirmación audit-only');
  lines.push(`- auditOnly: ${audit.auditOnly}`);
  lines.push(`- commandsModified: ${audit.commandsModified}`);
  lines.push(`- regionsModified: ${audit.regionsModified}`);
  lines.push(`- commandSourceLabel: ${audit.commandSourceLabel}`);
  lines.push('');
  lines.push('## 2. Configuración de modos detectada');
  pushObject(lines, audit.modeFlags);
  lines.push('');
  lines.push('## 3. Resumen de comandos');
  pushObject(lines, audit.commandSummary);
  lines.push('');
  lines.push('## 4. Resumen de regiones');
  pushObject(lines, audit.regionSummary);
  lines.push('');
  lines.push('## 5. Resumen de objetos finales');
  pushObject(lines, audit.objectSummary);
  lines.push('');
  lines.push('## 6. Mapeo config → pipeline');
  pushObject(lines, audit.pipelineMapping);
  lines.push('');
  lines.push('## 7. Findings');
  if (audit.findings.length === 0) lines.push('- Sin inconsistencias detectadas.');
  else audit.findings.forEach((finding) => lines.push(`- ${finding}`));
  lines.push('');
  lines.push('## 8. Conclusión');
  lines.push(audit.conclusion);
  lines.push('');
  lines.push('## 9. Campos finales obligatorios');
  lines.push(`auditOnly=${audit.auditOnly}`);
  lines.push(`commandsModified=${audit.commandsModified}`);
  lines.push(`regionsModified=${audit.regionsModified}`);
  lines.push(`totalCommands=${audit.commandSummary.totalCommands}`);
  lines.push(`totalRegions=${audit.regionSummary.totalRegions}`);
  lines.push(`totalObjects=${audit.objectSummary.totalObjects}`);
  lines.push(`cartoonEmbroideryStructureMode=${audit.modeFlags.cartoonEmbroideryStructureMode}`);
  lines.push(`ce01SafeFillMode=${audit.modeFlags.ce01SafeFillMode}`);
  lines.push(`goldenMasterWilcomAlignment=${audit.modeFlags.goldenMasterWilcomAlignment}`);
  return lines.join('\n');
}