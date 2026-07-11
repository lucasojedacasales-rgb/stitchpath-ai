import { buildFinalCommands, DEFAULT_MACHINE } from '../exportPipeline.js';
import { resolveEffectiveEmbroideryProfile } from '../embroideryEngineProfiles.js';

const BENCHMARK_MODES = ['fast', 'standard', 'precision', 'hybrid', 'ultra', 'ai', 'intelligent'];

function clone(value) {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function round(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;
}

function commandPoint(command) {
  return command && Number.isFinite(command.x) && Number.isFinite(command.y) ? [command.x, command.y] : null;
}

function distance(a, b) {
  return a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0;
}

function countUnique(values) {
  return new Set(values.filter(Boolean).map(v => String(v).toLowerCase())).size;
}

function hexToRgb(hex = '') {
  const h = String(hex || '').replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
  };
}

function isDarkColor(hex) {
  const { r, g, b } = hexToRgb(hex);
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return luma < 80;
}

function polygonArea(points = [], width = 100, height = 100) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  const normalized = points.every(p => Array.isArray(p) && Math.abs(p[0]) <= 1.5 && Math.abs(p[1]) <= 1.5);
  const mm = points.map(([x, y]) => normalized ? [(x - 0.5) * width, (y - 0.5) * height] : [x, y]);
  let area = 0;
  for (let i = 0; i < mm.length; i++) {
    const a = mm[i];
    const b = mm[(i + 1) % mm.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(area / 2);
}

function objectIsContour(object) {
  const text = `${object?.stitch_type || ''} ${object?.layerType || ''} ${object?.name || ''} ${object?.id || ''}`.toLowerCase();
  return object?.isContour === true || text.includes('contour') || text.includes('outline') || text.includes('running');
}

function analyzeCommands(commands = []) {
  let previous = [0, 0];
  let jumpsOver3mm = 0;
  let jumpsOver6mm = 0;
  let jumpsOver10mm = 0;
  let totalJumpTravelMm = 0;
  let maxJumpMm = 0;
  let stitchCommandsLongerThan3mm = 0;
  let stitchCommandsLongerThan6mm = 0;
  let stitchCommandsLongerThan10mm = 0;

  for (const command of commands) {
    const point = commandPoint(command);
    if (!point) continue;
    const d = distance(previous, point);
    if (command.type === 'jump') {
      if (d > 3) jumpsOver3mm++;
      if (d > 6) jumpsOver6mm++;
      if (d > 10) jumpsOver10mm++;
      totalJumpTravelMm += d;
      maxJumpMm = Math.max(maxJumpMm, d);
    }
    if (command.type === 'stitch') {
      if (d > 3) stitchCommandsLongerThan3mm++;
      if (d > 6) stitchCommandsLongerThan6mm++;
      if (d > 10) stitchCommandsLongerThan10mm++;
    }
    previous = point;
  }

  return {
    jumpsOver3mm,
    jumpsOver6mm,
    jumpsOver10mm,
    totalJumpTravelMm: round(totalJumpTravelMm),
    maxJumpMm: round(maxJumpMm),
    stitchCommandsLongerThan3mm,
    stitchCommandsLongerThan6mm,
    stitchCommandsLongerThan10mm,
  };
}

function scoreMode(row) {
  const colorTargetScore = Math.max(0, 10 - Math.abs((row.regionColorCount || 0) - (row.effectiveColorCount || 8)) * 0.6);
  const travelPenalty = Math.min(6, row.jumpsOver10mm * 0.15 + row.totalJumpTravelMm / 600);
  const longStitchPenalty = Math.min(5, row.stitchCommandsLongerThan6mm * 0.08 + row.stitchCommandsLongerThan10mm * 0.25);
  const contourRatio = row.finalObjectCount ? row.contourObjectCount / row.finalObjectCount : 0;
  const fillRatio = row.finalObjectCount ? row.fillObjectCount / row.finalObjectCount : 0;
  const microPenalty = Math.min(4, row.microFragmentCount * 0.35);

  return {
    vectorizationQuality: round(Math.max(0, Math.min(10, 5 + row.regionCount / 22 - microPenalty)), 1),
    silhouetteQuality: round(Math.max(0, Math.min(10, 7 + contourRatio * 3 - longStitchPenalty * 0.35)), 1),
    colorGroupingQuality: round(Math.max(0, Math.min(10, colorTargetScore)), 1),
    blackOutlineQuality: round(Math.max(0, Math.min(10, 5 + row.darkOutlineObjectCount * 0.45 - row.stitchCommandsLongerThan10mm * 0.08)), 1),
    regionCoherence: round(Math.max(0, Math.min(10, 8 - microPenalty + Math.min(1.5, row.regionCount / 80))), 1),
    microFragmentSuppression: round(Math.max(0, Math.min(10, 10 - row.microFragmentCount * 0.5)), 1),
    fillQuality: round(Math.max(0, Math.min(10, 5 + fillRatio * 5 - longStitchPenalty * 0.2)), 1),
    travelQuality: round(Math.max(0, Math.min(10, 10 - travelPenalty)), 1),
    ce01Compatibility: round(Math.max(0, Math.min(10, 10 - row.jumpsOver10mm * 0.18 - row.stitchCommandsLongerThan10mm * 0.25)), 1),
    universalAutoDigitizingPotential: round(Math.max(0, Math.min(10, 4 + contourRatio * 2 + fillRatio * 2 + colorTargetScore * 0.2 - microPenalty * 0.2)), 1),
  };
}

function overallScore(row) {
  const s = row.scores || {};
  return round((
    s.vectorizationQuality +
    s.silhouetteQuality +
    s.colorGroupingQuality +
    s.blackOutlineQuality +
    s.regionCoherence +
    s.microFragmentSuppression +
    s.fillQuality +
    s.travelQuality +
    s.ce01Compatibility +
    s.universalAutoDigitizingPotential
  ) / 10, 2);
}

function benchmarkMode(modeName, { regions, config, machineSettings }) {
  const inputRegions = clone(regions || []);
  const modeConfig = {
    ...clone(config || {}),
    mode: modeName,
    universalAutoDigitizerPro: false,
  };
  const profile = resolveEffectiveEmbroideryProfile(modeConfig, modeConfig.preprocessSettings || null, machineSettings || {});
  const pipelineConfig = {
    ...modeConfig,
    ...profile.pipelineConfig,
    mode: modeName,
    universalAutoDigitizerPro: false,
  };
  const resolvedMachine = {
    ...DEFAULT_MACHINE,
    ...(machineSettings || {}),
    hoopSize: machineSettings?.hoopSize || [pipelineConfig.width_mm || config?.width_mm || 100, pipelineConfig.height_mm || config?.height_mm || 100],
  };
  const result = buildFinalCommands(inputRegions, pipelineConfig, resolvedMachine, 'DST');
  const commands = result.commands || [];
  const objects = result.objects || [];
  const commandStats = analyzeCommands(commands);
  const width = pipelineConfig.width_mm || config?.width_mm || 100;
  const height = pipelineConfig.height_mm || config?.height_mm || 100;
  const regionAreas = (regions || []).map(r => polygonArea(r.path_points || [], width, height));

  const row = {
    modeName,
    effectiveBaseEngine: profile.effectiveBaseEngine,
    effectiveVectorEngine: profile.effectiveVectorEngine,
    effectiveUseIaVision: profile.effectiveUseIaVision,
    effectiveUseFullBackground: profile.effectiveUseFullBackground,
    effectivePreprocessSettings: profile.effectivePreprocessSettings,
    effectiveColorCount: profile.effectiveColorCount,
    effectiveTatamiDensity: profile.effectiveTatamiDensity,
    regionCount: (regions || []).length,
    regionColorCount: countUnique((regions || []).map(r => r.color || r.hex)),
    commandColorCount: (commands.filter(c => c.type === 'colorChange').length || 0) + 1,
    finalCommandCount: commands.length,
    finalStitchCount: commands.filter(c => c.type === 'stitch').length,
    finalJumpCount: commands.filter(c => c.type === 'jump').length,
    finalTrimCount: commands.filter(c => c.type === 'trim').length,
    finalColorChangeCount: commands.filter(c => c.type === 'colorChange').length,
    finalObjectCount: objects.length,
    fillObjectCount: objects.filter(o => o.stitch_type === 'fill').length,
    contourObjectCount: objects.filter(objectIsContour).length,
    darkOutlineObjectCount: objects.filter(o => objectIsContour(o) && isDarkColor(o.color)).length,
    tinyRegionCount: regionAreas.filter(a => a > 0 && a < 1.5).length,
    microFragmentCount: regionAreas.filter(a => a > 0 && a < 0.5).length,
    ...commandStats,
    visualStructureScoreEstimate: result.meta?.visualStructureScoreEstimate ?? null,
  };
  row.scores = scoreMode(row);
  row.overallScore = overallScore(row);
  row.machinePreviewRiskScoreEstimate = round(Math.max(0, Math.min(10, 10 - row.scores.ce01Compatibility)), 1);
  return row;
}

function bestBy(rows, selector) {
  return [...rows].sort((a, b) => selector(b) - selector(a))[0] || null;
}

function worstByOverall(rows) {
  return [...rows].sort((a, b) => a.overallScore - b.overallScore)[0] || null;
}

export function runEngineProfileBenchmark({ regions = [], config = {}, machineSettings = {}, finalCommands = [] } = {}) {
  const generatedAt = new Date().toISOString();
  const originalRegionsSnapshot = JSON.stringify(regions || []);
  const originalPathPointsSnapshot = JSON.stringify((regions || []).map(r => r.path_points || []));
  const originalCommandsSnapshot = JSON.stringify(finalCommands || []);

  const rows = BENCHMARK_MODES.map(mode => benchmarkMode(mode, { regions, config, machineSettings }));
  const bestOverall = bestBy(rows, row => row.overallScore);
  const bestVectorization = bestBy(rows, row => row.scores.vectorizationQuality);
  const bestOutline = bestBy(rows, row => row.scores.blackOutlineQuality);
  const bestFills = bestBy(rows, row => row.scores.fillQuality);
  const bestTravel = bestBy(rows, row => row.scores.travelQuality);
  const worst = worstByOverall(rows);

  return {
    reportId: 'ENGINE_PROFILE_BENCHMARK_V1',
    generatedAt,
    benchmarkOnly: true,
    commandsModified: originalCommandsSnapshot !== JSON.stringify(finalCommands || []),
    regionsModified: originalRegionsSnapshot !== JSON.stringify(regions || []),
    originalPathPointsMutated: originalPathPointsSnapshot !== JSON.stringify((regions || []).map(r => r.path_points || [])),
    exportModified: false,
    encodersTouched: false,
    ExportModalTouched: false,
    MachineSimulatorTouched: false,
    FinalLookTouched: false,
    modesBenchmarked: [...BENCHMARK_MODES],
    rows,
    summary: {
      recommendedBaseMode: bestOverall?.modeName || 'hybrid',
      recommendedUnifiedArchitecture: 'Resolver único de perfiles + pipeline común de comandos finales + benchmarks audit-only por modo.',
      safestNextImplementationStep: 'Mantener el benchmark como diagnóstico y usar sus métricas para decidir una unificación sin cambiar generación.',
      bestModeOverall: bestOverall?.modeName,
      bestModeForVectorization: bestVectorization?.modeName,
      bestModeForOutline: bestOutline?.modeName,
      bestModeForFills: bestFills?.modeName,
      bestModeForTravel: bestTravel?.modeName,
      worstMode: worst?.modeName,
      worstModeReason: worst ? `overallScore=${worst.overallScore}, travel=${worst.scores.travelQuality}, microFragments=${worst.microFragmentCount}, longStitches>10=${worst.stitchCommandsLongerThan10mm}` : 'n/a',
      recommendedPiecesToKeep: [
        `${bestVectorization?.modeName || 'hybrid'} vectorization settings`,
        `${bestOutline?.modeName || 'hybrid'} outline preservation`,
        `${bestFills?.modeName || 'hybrid'} fill density behavior`,
        `${bestTravel?.modeName || 'hybrid'} travel behavior`,
      ],
      recommendedPiecesToRemove: [
        'Duplicated mode-specific assumptions that do not affect final command quality',
        'Micro-fragment heavy settings when they increase jumps without visual gain',
        'Any machine-specific interpretation inside artwork analysis layers',
      ],
    },
  };
}

function formatObject(value) {
  if (value == null) return '';
  if (typeof value === 'object') return '`' + JSON.stringify(value).replaceAll('|', '\\|') + '`';
  return String(value);
}

export function buildEngineProfileBenchmarkMarkdown(report) {
  const lines = [];
  const rows = report.rows || [];
  lines.push('# ENGINE_PROFILE_BENCHMARK_V1');
  lines.push('');
  lines.push(`generatedAt=${report.generatedAt}`);
  lines.push(`benchmarkOnly=${report.benchmarkOnly}`);
  lines.push(`commandsModified=${report.commandsModified}`);
  lines.push(`regionsModified=${report.regionsModified}`);
  lines.push(`originalPathPointsMutated=${report.originalPathPointsMutated}`);
  lines.push(`exportModified=${report.exportModified}`);
  lines.push(`encodersTouched=${report.encodersTouched}`);
  lines.push(`ExportModalTouched=${report.ExportModalTouched}`);
  lines.push(`MachineSimulatorTouched=${report.MachineSimulatorTouched}`);
  lines.push(`FinalLookTouched=${report.FinalLookTouched}`);
  lines.push('');
  lines.push('## 1. Summary');
  for (const [key, value] of Object.entries(report.summary || {})) {
    lines.push(`- ${key}: ${Array.isArray(value) ? value.join('; ') : value}`);
  }
  lines.push('');
  lines.push('## 2. Side-by-side mode table');
  lines.push('| modeName | base | vector | IA | fullBg | colors | density | regions | regionColors | commandColors | commands | stitches | jumps | trims | colorChanges | objects | fillObjects | contourObjects | darkOutlines | tinyRegions | microFragments | jumps>3 | jumps>6 | jumps>10 | jumpTravelMm | maxJumpMm | stitch>3 | stitch>6 | stitch>10 | visualStructure | risk | overall |');
  lines.push('|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const row of rows) {
    lines.push(`| ${row.modeName} | ${row.effectiveBaseEngine} | ${row.effectiveVectorEngine} | ${row.effectiveUseIaVision} | ${row.effectiveUseFullBackground} | ${row.effectiveColorCount} | ${row.effectiveTatamiDensity} | ${row.regionCount} | ${row.regionColorCount} | ${row.commandColorCount} | ${row.finalCommandCount} | ${row.finalStitchCount} | ${row.finalJumpCount} | ${row.finalTrimCount} | ${row.finalColorChangeCount} | ${row.finalObjectCount} | ${row.fillObjectCount} | ${row.contourObjectCount} | ${row.darkOutlineObjectCount} | ${row.tinyRegionCount} | ${row.microFragmentCount} | ${row.jumpsOver3mm} | ${row.jumpsOver6mm} | ${row.jumpsOver10mm} | ${row.totalJumpTravelMm} | ${row.maxJumpMm} | ${row.stitchCommandsLongerThan3mm} | ${row.stitchCommandsLongerThan6mm} | ${row.stitchCommandsLongerThan10mm} | ${row.visualStructureScoreEstimate ?? ''} | ${row.machinePreviewRiskScoreEstimate} | ${row.overallScore} |`);
  }
  lines.push('');
  lines.push('### Effective preprocess settings');
  for (const row of rows) lines.push(`- ${row.modeName}: ${formatObject(row.effectivePreprocessSettings)}`);
  lines.push('');
  lines.push('### Qualitative scores 0-10');
  lines.push('| mode | vectorization | silhouette | colorGrouping | blackOutline | coherence | microSuppress | fill | travel | ce01 | universalPotential |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const row of rows) {
    const s = row.scores;
    lines.push(`| ${row.modeName} | ${s.vectorizationQuality} | ${s.silhouetteQuality} | ${s.colorGroupingQuality} | ${s.blackOutlineQuality} | ${s.regionCoherence} | ${s.microFragmentSuppression} | ${s.fillQuality} | ${s.travelQuality} | ${s.ce01Compatibility} | ${s.universalAutoDigitizingPotential} |`);
  }
  lines.push('');
  lines.push(`## 3. Best mode overall\n${report.summary.bestModeOverall}`);
  lines.push(`## 4. Best mode for vectorization\n${report.summary.bestModeForVectorization}`);
  lines.push(`## 5. Best mode for outline\n${report.summary.bestModeForOutline}`);
  lines.push(`## 6. Best mode for fills\n${report.summary.bestModeForFills}`);
  lines.push(`## 7. Best mode for travel\n${report.summary.bestModeForTravel}`);
  lines.push(`## 8. Worst mode and why\n${report.summary.worstMode}: ${report.summary.worstModeReason}`);
  lines.push(`## 9. Recommended base mode\nrecommendedBaseMode=${report.summary.recommendedBaseMode}`);
  lines.push(`## 10. Recommended pieces to keep\n${report.summary.recommendedPiecesToKeep.map(x => `- ${x}`).join('\n')}`);
  lines.push(`## 11. Recommended pieces to remove\n${report.summary.recommendedPiecesToRemove.map(x => `- ${x}`).join('\n')}`);
  lines.push('## 12. Recommended unification plan');
  lines.push(`recommendedBaseMode=${report.summary.recommendedBaseMode}`);
  lines.push(`recommendedUnifiedArchitecture=${report.summary.recommendedUnifiedArchitecture}`);
  lines.push(`safestNextImplementationStep=${report.summary.safestNextImplementationStep}`);
  return lines.join('\n');
}