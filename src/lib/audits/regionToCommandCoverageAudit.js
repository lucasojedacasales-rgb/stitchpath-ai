const REGION_METADATA_KEYS = [
  'knockoutZones',
  'excludedZones',
  'removedByKnockout',
  'qualityPhase2',
  'layerPriority',
  'skipFill',
  'skipExport',
  'hiddenByLayer',
  'disabledByComposition',
  'safeToRemove',
  'destructiveApplied',
  'exclusionPolygons',
];

export function runRegionToCommandCoverageAudit({
  finalCommands = [],
  finalObjects = [],
  regions = [],
  config = {},
  commandSourceLabel = 'finalEmbroideryCommands',
} = {}) {
  const generatedAt = new Date().toISOString();
  const commands = Array.isArray(finalCommands) ? finalCommands : [];
  const visualRegions = Array.isArray(regions) ? regions : [];
  const commandRegionStats = buildCommandRegionStats(commands);
  const regionRows = visualRegions.map((region, index) => buildRegionCoverageRow({
    region,
    index,
    stats: commandRegionStats.get(region?.id) || makeEmptyCommandStats(),
    config,
  }));

  const fillRows = regionRows.filter(isFillRow);
  const contourRows = regionRows.filter(isContourRow);
  const lostFillRegions = fillRows.filter((row) => row.visible && row.expectedCommandStitches > 0 && row.actualFinalCommandStitches === 0);
  const lostContourRegions = contourRows.filter((row) => row.visible && row.expectedCommandStitches > 0 && row.actualFinalCommandStitches === 0);
  const underGeneratedRegions = regionRows.filter((row) => row.visible && row.expectedCommandStitches > 0 && row.actualFinalCommandStitches < row.expectedCommandStitches * 0.25);
  const suspiciousZeroRegions = regionRows.filter((row) => row.visible && row.areaMm2 > 0.5 && row.expectedCommandStitches > 0 && row.actualFinalCommandStitches === 0);
  const phase2AffectedRows = regionRows.filter((row) => row.metadataKeys.length > 0);

  const summary = {
    auditOnly: true,
    regionsModified: false,
    commandsModified: false,
    exportModified: false,
    totalRegions: visualRegions.length,
    visibleRegions: regionRows.filter((row) => row.visible).length,
    fillRegions: fillRows.length,
    contourRegions: contourRows.length,
    regionalStitchCountTotal: sum(regionRows, 'regionalStitchCount'),
    finalCommandCount: commands.length,
    finalCommandStitchCount: commands.filter((command) => command?.type === 'stitch').length,
    finalCommandJumpCount: commands.filter((command) => command?.type === 'jump').length,
    finalCommandTrimCount: commands.filter((command) => command?.type === 'trim').length,
    totalColorChanges: commands.filter((command) => command?.type === 'colorChange').length,
    finalObjectsCount: Array.isArray(finalObjects) ? finalObjects.length : 0,
    commandSourceUsed: commandSourceLabel,
    regionToCommandCoveragePercent: pct(regionRows.filter((row) => row.appearsInFinalCommands).length, regionRows.length),
    fillRegionCoveragePercent: pct(fillRows.filter((row) => row.appearsInFinalCommands).length, fillRows.length),
    contourRegionCoveragePercent: pct(contourRows.filter((row) => row.appearsInFinalCommands).length, contourRows.length),
    lostFillRegionsCount: lostFillRegions.length,
    lostContourRegionsCount: lostContourRegions.length,
    underGeneratedRegionsCount: underGeneratedRegions.length,
    suspiciousZeroRegionsCount: suspiciousZeroRegions.length,
    phase2MetadataAffectingCommands: phase2AffectedRows.length > 0,
    phase2MetadataRegionCount: phase2AffectedRows.length,
  };

  const audit = {
    generatedAt,
    auditOnly: true,
    summary,
    lostFillRegions,
    lostContourRegions,
    underGeneratedRegions,
    suspiciousZeroRegions,
    phase2AffectedRegions: phase2AffectedRows,
    regions: regionRows,
  };

  return {
    ...audit,
    markdown: buildRegionCoverageMarkdown(audit),
  };
}

function buildCommandRegionStats(commands) {
  const stats = new Map();
  for (const command of commands || []) {
    const regionId = command?.regionId;
    if (!regionId) continue;
    const current = stats.get(regionId) || makeEmptyCommandStats();
    current.commandCount += 1;
    if (command.type === 'stitch') current.stitchCount += 1;
    if (command.type === 'jump') current.jumpCount += 1;
    if (command.type === 'trim') current.trimCount += 1;
    stats.set(regionId, current);
  }
  return stats;
}

function makeEmptyCommandStats() {
  return { commandCount: 0, stitchCount: 0, jumpCount: 0, trimCount: 0 };
}

function buildRegionCoverageRow({ region, index, stats, config }) {
  const metadataKeys = REGION_METADATA_KEYS.filter((key) => hasMeaningfulValue(region?.[key]));
  const regionalStitchCount = Number(region?.stitch_count || 0);
  const expectedCommandStitches = regionalStitchCount;
  const actualFinalCommandStitches = stats.stitchCount || 0;
  return {
    regionId: region?.id || `region_${index}`,
    name: region?.name || '',
    color: region?.color || region?.hex || '',
    stitchType: region?.stitch_type || region?.type || '',
    layerType: region?.layerType || '',
    regionClass: region?.region_class || '',
    visible: region?.visible !== false,
    supported: region?.supported !== false,
    pathPointsCount: Array.isArray(region?.path_points) ? region.path_points.length : 0,
    areaMm2: calculateAreaMm2(region?.path_points || [], config),
    regionalStitchCount,
    expectedCommandStitches,
    actualFinalCommandStitches,
    actualFinalCommandCount: stats.commandCount || 0,
    actualFinalJumpCount: stats.jumpCount || 0,
    actualFinalTrimCount: stats.trimCount || 0,
    appearsInFinalCommands: (stats.commandCount || 0) > 0,
    metadataKeys,
    coverageRatio: expectedCommandStitches > 0 ? actualFinalCommandStitches / expectedCommandStitches : null,
    droppedReason: chooseDroppedReason({ region, stats, expectedCommandStitches, actualFinalCommandStitches }),
  };
}

function chooseDroppedReason({ region, stats, expectedCommandStitches, actualFinalCommandStitches }) {
  if (region?.visible === false) return 'visible=false';
  if (!Array.isArray(region?.path_points) || region.path_points.length < 3) return 'invalid path_points';
  if (expectedCommandStitches > 0 && actualFinalCommandStitches === 0) return 'no final stitches for regionId';
  if (expectedCommandStitches > 0 && actualFinalCommandStitches < expectedCommandStitches * 0.25) return 'under-generated below 25% of regional stitch_count';
  if ((stats.commandCount || 0) === 0) return 'no commands for regionId';
  return 'covered';
}

function isFillRow(row) {
  return String(row.stitchType || 'fill').toLowerCase() === 'fill';
}

function isContourRow(row) {
  return /contour|outline|running/i.test(`${row.stitchType} ${row.layerType} ${row.regionClass} ${row.name}`);
}

function hasMeaningfulValue(value) {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function calculateAreaMm2(points, config) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  const width = Number(config?.width_mm) || 100;
  const height = Number(config?.height_mm) || 100;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    if (!Array.isArray(current) || !Array.isArray(next)) continue;
    area += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(area / 2) * width * height;
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
}

function pct(value, total) {
  if (!total) return 100;
  return Number(((value / total) * 100).toFixed(2));
}

function fmt(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : '0.00';
}

function buildRegionCoverageMarkdown(audit) {
  const { summary } = audit;
  const lines = [];
  lines.push('# REGION_TO_COMMAND_COVERAGE_AUDIT_V1');
  lines.push('');
  lines.push(`generatedAt=${audit.generatedAt}`);
  lines.push(`auditOnly=${audit.auditOnly}`);
  lines.push(`regionsModified=${summary.regionsModified}`);
  lines.push(`commandsModified=${summary.commandsModified}`);
  lines.push(`exportModified=${summary.exportModified}`);
  lines.push('');
  lines.push('## Summary');
  for (const [key, value] of Object.entries(summary)) lines.push(`- ${key}: ${value}`);
  lines.push('');
  lines.push('## Lost fill regions');
  appendRegionTable(lines, audit.lostFillRegions);
  lines.push('');
  lines.push('## Lost contour regions');
  appendRegionTable(lines, audit.lostContourRegions);
  lines.push('');
  lines.push('## Under-generated regions');
  appendRegionTable(lines, audit.underGeneratedRegions);
  lines.push('');
  lines.push('## Suspicious zero regions');
  appendRegionTable(lines, audit.suspiciousZeroRegions);
  lines.push('');
  lines.push('## Phase 2 / knockout metadata present');
  appendMetadataTable(lines, audit.phase2AffectedRegions);
  lines.push('');
  lines.push('## All region coverage rows');
  appendRegionTable(lines, audit.regions);
  return lines.join('\n');
}

function appendRegionTable(lines, rows) {
  if (!rows.length) {
    lines.push('none');
    return;
  }
  lines.push('| regionId | name | color | stitchType | layerType | regionClass | regionalStitches | finalStitches | finalCommands | coverageRatio | metadataKeys | droppedReason |');
  lines.push('|---|---|---|---|---|---|---:|---:|---:|---:|---|---|');
  for (const row of rows) {
    lines.push(`| ${row.regionId} | ${safeCell(row.name)} | ${row.color} | ${row.stitchType} | ${row.layerType} | ${row.regionClass} | ${row.regionalStitchCount} | ${row.actualFinalCommandStitches} | ${row.actualFinalCommandCount} | ${row.coverageRatio == null ? '' : fmt(row.coverageRatio, 3)} | ${row.metadataKeys.join(', ')} | ${row.droppedReason} |`);
  }
}

function appendMetadataTable(lines, rows) {
  if (!rows.length) {
    lines.push('none');
    return;
  }
  lines.push('| regionId | metadataKeys | finalStitches | droppedReason |');
  lines.push('|---|---|---:|---|');
  for (const row of rows) lines.push(`| ${row.regionId} | ${row.metadataKeys.join(', ')} | ${row.actualFinalCommandStitches} | ${row.droppedReason} |`);
}

function safeCell(value) {
  return String(value || '').replace(/\|/g, '/');
}